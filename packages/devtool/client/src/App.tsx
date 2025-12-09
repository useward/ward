import { useEffect } from "react"
import { DevtoolHeader } from "@/components/devtool-header"
import { ProfilingControls } from "@/components/profiling-controls"
import { FlowsPanel } from "@/components/flows-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProfilingStore } from "@/lib/profiling-store"

function App() {
  const { flows, status, isConnected } = useProfilingStore()

  useEffect(() => {
    document.documentElement.classList.add("dark")
  }, [])

  const displayFlows = status === "idle" ? [] : flows
  const totalSpans = displayFlows.reduce((sum, f) => sum + f.spans.length, 0)

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <DevtoolHeader projectName="my-nextjs-app" projectUrl="localhost:3000" isConnected={isConnected} />

      <ProfilingControls />

      <Tabs defaultValue="flows" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0">
          <TabsTrigger
            value="flows"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            Request Flows
            {displayFlows.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({displayFlows.length} flows, {totalSpans} spans)
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="renders"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            disabled
          >
            Re-renders
          </TabsTrigger>
          <TabsTrigger
            value="cache"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            disabled
          >
            Cache
          </TabsTrigger>
          <TabsTrigger
            value="metrics"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
            disabled
          >
            Web Vitals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flows" className="flex-1 m-0">
          {displayFlows.length === 0 ? (
            <EmptyFlowsMessage status={status} isConnected={isConnected} />
          ) : (
            <FlowsPanel flows={displayFlows} />
          )}
        </TabsContent>

        <TabsContent value="renders" className="flex-1 m-0 p-4">
          <div className="text-muted-foreground">Component re-renders tracking - coming soon</div>
        </TabsContent>

        <TabsContent value="cache" className="flex-1 m-0 p-4">
          <div className="text-muted-foreground">Cache analysis - coming soon</div>
        </TabsContent>

        <TabsContent value="metrics" className="flex-1 m-0 p-4">
          <div className="text-muted-foreground">Web Vitals metrics - coming soon</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface EmptyFlowsMessageProps {
  status: "idle" | "recording" | "stopped"
  isConnected: boolean
}

function EmptyFlowsMessage({ status, isConnected }: EmptyFlowsMessageProps) {
  const messages = {
    idle: {
      primary: 'Click "Start Profiling" to begin capturing request flows',
      secondary:
        "Request flows combine server renders, data fetches, network transfer, and client hydration into unified waterfalls.",
    },
    recording: {
      primary: "Recording... Navigate your app to capture traces",
      secondary: "Server and client traces will be automatically correlated into request flows.",
    },
    stopped: {
      primary: "No flows captured in this session",
      secondary: 'Click "Record Again" to start a new session',
    },
  }

  const { primary, secondary } = messages[status]

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-3 max-w-md">
        <p className="text-muted-foreground">{primary}</p>
        <p className="text-xs text-muted-foreground">{secondary}</p>
        {status === "recording" && !isConnected && (
          <p className="text-xs text-amber-500">
            Not connected to telemetry stream. Make sure the devtool server is running on port 19393.
          </p>
        )}
      </div>
    </div>
  )
}

export default App
