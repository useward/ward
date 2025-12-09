import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Stream from "effect/Stream"
import { create } from "zustand"
import { AppRuntime, getProfilingService } from "@/domain/runtime"
import type { ProfilingStatus, RequestFlow } from "@/domain"

interface ProfilingStore {
  status: ProfilingStatus
  flows: ReadonlyArray<RequestFlow>
  isConnected: boolean
  sessionStartTime: number | null
  error: string | null
  startProfiling: () => void
  stopProfiling: () => void
  clearFlows: () => void
}

let streamFiber: Fiber.RuntimeFiber<void, unknown> | null = null

export const useProfilingStore = create<ProfilingStore>((set) => ({
  status: "idle",
  flows: [],
  isConnected: false,
  sessionStartTime: null,
  error: null,

  startProfiling: () => {
    const service = getProfilingService()

    Effect.runPromise(service.clear)

    set({
      status: "recording",
      flows: [],
      sessionStartTime: Date.now(),
      error: null,
    })

    const program = service.flows.pipe(
      Stream.tap((flows) =>
        Effect.sync(() => {
          const { status } = useProfilingStore.getState()
          if (status === "recording") {
            set({ flows, isConnected: true })
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

  clearFlows: () => {
    if (streamFiber) {
      Effect.runPromise(Fiber.interrupt(streamFiber))
      streamFiber = null
    }

    const service = getProfilingService()
    Effect.runPromise(service.clear)

    set({
      flows: [],
      status: "idle",
      sessionStartTime: null,
      isConnected: false,
      error: null,
    })
  },
}))
