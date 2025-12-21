import { useEffect } from "react";
import { DevtoolHeader } from "@/components/devtool-header";
import { ProfilingControls } from "@/components/profiling-controls";
import { ResourceDetails } from "@/components/resource-details";
import { SessionsPanel } from "@/components/sessions-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfilingStore } from "@/lib/profiling-store";

function App() {
  const {
    status,
    sessions,
    isConnected,
    selectedSessionId,
    selectedResourceId,
    selectedProjectId,
    selectProject,
  } = useProfilingStore();

  const projects = [...new Set(sessions.map((s) => s.projectId))].sort();
  const filteredSessions =
    status === "idle"
      ? []
      : selectedProjectId
        ? sessions.filter((s) => s.projectId === selectedProjectId)
        : sessions;

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const totalResources = filteredSessions.reduce(
    (sum, s) => sum + s.stats.totalResources,
    0,
  );
  const selectedSession =
    filteredSessions.find((s) => s.id === selectedSessionId) ?? null;

  const currentProjectName =
    selectedProjectId ?? (projects.length === 1 ? projects[0] : "All Projects");

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <DevtoolHeader
        projectName={currentProjectName ?? "No Projects"}
        projectUrl="localhost:3000"
        isConnected={isConnected}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={selectProject}
      />

      <ProfilingControls />

      <Tabs defaultValue="sessions" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0">
          <TabsTrigger
            value="sessions"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            Page Sessions
            {filteredSessions.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({filteredSessions.length} sessions, {totalResources} resources)
              </span>
            )}
          </TabsTrigger>
          {/* TODO: to be implemented */}
          {/* <TabsTrigger
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
          </TabsTrigger> */}
        </TabsList>

        <TabsContent value="sessions" className="flex-1 m-0">
          {filteredSessions.length === 0 ? (
            <EmptySessionsMessage status={status} isConnected={isConnected} />
          ) : (
            <SessionsPanel />
          )}
          {selectedSession && selectedResourceId && (
            <ResourceDetails session={selectedSession} />
          )}
        </TabsContent>

        <TabsContent value="renders" className="flex-1 m-0 p-4">
          <div className="text-muted-foreground">
            Component re-renders tracking - coming soon
          </div>
        </TabsContent>

        <TabsContent value="cache" className="flex-1 m-0 p-4">
          <div className="text-muted-foreground">
            Cache analysis - coming soon
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="flex-1 m-0 p-4">
          <div className="text-muted-foreground">
            Web Vitals metrics - coming soon
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface EmptySessionsMessageProps {
  status: "idle" | "recording" | "stopped";
  isConnected: boolean;
}

function EmptySessionsMessage({
  status,
  isConnected,
}: EmptySessionsMessageProps) {
  const messages = {
    idle: {
      primary: 'Click "Start Profiling" to begin capturing page sessions',
      secondary:
        "Page sessions show all server and client resources needed to render each page, with hierarchical timing waterfalls.",
    },
    recording: {
      primary: "Recording... Navigate your app to capture traces",
      secondary:
        "Server and client traces will be automatically correlated by page session.",
    },
    stopped: {
      primary: "No sessions captured",
      secondary: 'Click "Record Again" to start a new session',
    },
  };

  const { primary, secondary } = messages[status];

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-3 max-w-md">
        <p className="text-muted-foreground">{primary}</p>
        <p className="text-xs text-muted-foreground">{secondary}</p>
        {status === "recording" && !isConnected && (
          <p className="text-xs text-amber-500">
            Not connected to telemetry stream. Make sure the devtool server is
            running on port 19393.
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
