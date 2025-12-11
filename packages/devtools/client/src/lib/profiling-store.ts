import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Stream from "effect/Stream"
import { create } from "zustand"
import { AppRuntime, getProfilingService } from "@/domain/runtime"
import type { ProfilingStatus, PageSession, Resource, ResourceFilterState, ZoomPanState } from "@/domain"

interface ProfilingStore {
  status: ProfilingStatus
  sessions: ReadonlyArray<PageSession>
  selectedSessionId: string | null
  selectedResourceId: string | null
  isConnected: boolean
  sessionStartTime: number | null
  error: string | null
  filters: ResourceFilterState
  zoomPan: ZoomPanState
  expandedResourceIds: Set<string>
  startProfiling: () => void
  stopProfiling: () => void
  clearSessions: () => void
  selectSession: (id: string | null) => void
  selectResource: (id: string | null) => void
  setFilters: (filters: Partial<ResourceFilterState>) => void
  setZoom: (zoom: number) => void
  setPanOffset: (offset: number) => void
  resetZoomPan: () => void
  toggleResourceExpanded: (id: string) => void
  expandAll: () => void
  collapseAll: () => void
}

let streamFiber: Fiber.RuntimeFiber<void, unknown> | null = null

const defaultFilters: ResourceFilterState = {
  search: "",
  types: [],
  origins: [],
  minDuration: 0,
  showErrorsOnly: false,
}

const defaultZoomPan: ZoomPanState = {
  zoom: 1,
  panOffset: 0,
  viewportWidth: 0,
}

export const useProfilingStore = create<ProfilingStore>((set, get) => ({
  status: "idle",
  sessions: [],
  selectedSessionId: null,
  selectedResourceId: null,
  isConnected: false,
  sessionStartTime: null,
  error: null,
  filters: defaultFilters,
  zoomPan: defaultZoomPan,
  expandedResourceIds: new Set(),

  startProfiling: () => {
    const service = getProfilingService()

    Effect.runPromise(service.clear)

    set({
      status: "recording",
      sessions: [],
      selectedSessionId: null,
      selectedResourceId: null,
      sessionStartTime: Date.now(),
      error: null,
      expandedResourceIds: new Set(),
    })

    const program = service.sessions.pipe(
      Stream.tap((sessions) =>
        Effect.sync(() => {
          const { status } = useProfilingStore.getState()
          if (status === "recording") {
            set({ sessions, isConnected: true })
          }
        })
      ),
      Stream.catchAll((error) =>
        Stream.fromEffect(
          Effect.sync(() => {
            set({ error: error.message, isConnected: false })
          })
        )
      ),
      Stream.runDrain
    )

    streamFiber = AppRuntime.runFork(program)
  },

  stopProfiling: () => {
    if (streamFiber) {
      Effect.runPromise(Fiber.interrupt(streamFiber))
      streamFiber = null
    }
    set({ status: "stopped", isConnected: false })
  },

  clearSessions: () => {
    if (streamFiber) {
      Effect.runPromise(Fiber.interrupt(streamFiber))
      streamFiber = null
    }

    const service = getProfilingService()
    Effect.runPromise(service.clear)

    set({
      sessions: [],
      selectedSessionId: null,
      selectedResourceId: null,
      status: "idle",
      sessionStartTime: null,
      isConnected: false,
      error: null,
      filters: defaultFilters,
      zoomPan: defaultZoomPan,
      expandedResourceIds: new Set(),
    })
  },

  selectSession: (id) => {
    set({
      selectedSessionId: id,
      selectedResourceId: null,
      zoomPan: defaultZoomPan,
    })
  },

  selectResource: (id) => {
    set({ selectedResourceId: id })
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }))
  },

  setZoom: (zoom) => {
    set((state) => ({
      zoomPan: { ...state.zoomPan, zoom: Math.max(0.1, Math.min(10, zoom)) },
    }))
  },

  setPanOffset: (offset) => {
    set((state) => ({
      zoomPan: { ...state.zoomPan, panOffset: Math.max(0, offset) },
    }))
  },

  resetZoomPan: () => {
    set({ zoomPan: defaultZoomPan })
  },

  toggleResourceExpanded: (id) => {
    set((state) => {
      const newExpanded = new Set(state.expandedResourceIds)
      if (newExpanded.has(id)) {
        newExpanded.delete(id)
      } else {
        newExpanded.add(id)
      }
      return { expandedResourceIds: newExpanded }
    })
  },

  expandAll: () => {
    const { sessions, selectedSessionId } = get()
    const session = sessions.find((s) => s.id === selectedSessionId)
    if (!session) return

    const allIds = new Set<string>()
    const collectIds = (resources: ReadonlyArray<Resource>) => {
      for (const resource of resources) {
        if (resource.children.length > 0) {
          allIds.add(resource.id)
        }
        collectIds(resource.children)
      }
    }
    collectIds(session.rootResources)

    set({ expandedResourceIds: allIds })
  },

  collapseAll: () => {
    set({ expandedResourceIds: new Set() })
  },
}))
