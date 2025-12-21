import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { create } from "zustand";
import type {
  PageSession,
  ProfilingStatus,
  Resource,
  ResourceFilterState,
  ZoomPanState,
} from "@/domain";
import { AppRuntime, getProfilingService } from "@/domain/runtime";

type StreamFiber = Fiber.RuntimeFiber<void, unknown>;

interface ProfilingStoreState {
  status: ProfilingStatus;
  sessions: ReadonlyArray<PageSession>;
  selectedSessionId: string | null;
  selectedResourceId: string | null;
  isConnected: boolean;
  sessionStartTime: number | null;
  error: string | null;
  filters: ResourceFilterState;
  zoomPan: ZoomPanState;
  expandedResourceIds: Set<string>;
  streamFiber: StreamFiber | null;
}

interface ProfilingStoreActions {
  startProfiling: () => void;
  stopProfiling: () => void;
  clearSessions: () => void;
  selectSession: (id: string | null) => void;
  selectResource: (id: string | null) => void;
  setFilters: (filters: Partial<ResourceFilterState>) => void;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: number) => void;
  resetZoomPan: () => void;
  toggleResourceExpanded: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
}

type ProfilingStore = ProfilingStoreState & ProfilingStoreActions;

const defaultFilters: ResourceFilterState = {
  search: "",
  types: [],
  origins: [],
  minDuration: 0,
  showErrorsOnly: false,
};

const defaultZoomPan: ZoomPanState = {
  zoom: 1,
  panOffset: 0,
  viewportWidth: 0,
};

const initialState: ProfilingStoreState = {
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
  streamFiber: null,
};

const interruptFiber = (fiber: StreamFiber | null): void => {
  if (fiber) {
    Effect.runPromise(Fiber.interrupt(fiber));
  }
};

export const useProfilingStore = create<ProfilingStore>((set, get) => ({
  ...initialState,

  startProfiling: () => {
    const service = getProfilingService();

    Effect.runPromise(service.clear);

    set({
      status: "recording",
      sessions: [],
      selectedSessionId: null,
      selectedResourceId: null,
      sessionStartTime: Date.now(),
      error: null,
      expandedResourceIds: new Set(),
      streamFiber: null,
    });

    const program = service.sessions.pipe(
      Stream.tap((sessions) =>
        Effect.sync(() => {
          const { status } = useProfilingStore.getState();
          if (status === "recording") {
            set({ sessions, isConnected: true });
          }
        }),
      ),
      Stream.catchAll((error) =>
        Stream.fromEffect(
          Effect.sync(() => {
            set({ error: error.message, isConnected: false });
          }),
        ),
      ),
      Stream.runDrain,
    );

    const fiber = AppRuntime.runFork(program);
    set({ streamFiber: fiber });
  },

  stopProfiling: () => {
    const { streamFiber } = get();
    interruptFiber(streamFiber);
    set({ status: "stopped", isConnected: false, streamFiber: null });
  },

  clearSessions: () => {
    const { streamFiber } = get();
    interruptFiber(streamFiber);

    const service = getProfilingService();
    Effect.runPromise(service.clear);

    set({
      ...initialState,
    });
  },

  selectSession: (id) => {
    set({
      selectedSessionId: id,
      selectedResourceId: null,
      zoomPan: defaultZoomPan,
    });
  },

  selectResource: (id) => {
    set({ selectedResourceId: id });
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
  },

  setZoom: (zoom) => {
    set((state) => ({
      zoomPan: { ...state.zoomPan, zoom: Math.max(0.1, Math.min(10, zoom)) },
    }));
  },

  setPanOffset: (offset) => {
    set((state) => ({
      zoomPan: { ...state.zoomPan, panOffset: Math.max(0, offset) },
    }));
  },

  resetZoomPan: () => {
    set({ zoomPan: defaultZoomPan });
  },

  toggleResourceExpanded: (id) => {
    set((state) => {
      const newExpanded = new Set(state.expandedResourceIds);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return { expandedResourceIds: newExpanded };
    });
  },

  expandAll: () => {
    const { sessions, selectedSessionId } = get();
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session) return;

    const allIds = new Set<string>();
    const collectIds = (resources: ReadonlyArray<Resource>) => {
      for (const resource of resources) {
        if (resource.children.length > 0) {
          allIds.add(resource.id);
        }
        collectIds(resource.children);
      }
    };
    collectIds(session.rootResources);

    set({ expandedResourceIds: allIds });
  },

  collapseAll: () => {
    set({ expandedResourceIds: new Set() });
  },
}));
