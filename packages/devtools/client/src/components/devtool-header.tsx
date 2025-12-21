import {
  Activity,
  Check,
  ChevronDown,
  Circle,
  Settings,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DevtoolHeaderProps {
  projectName: string;
  projectUrl: string;
  isConnected: boolean;
  projects: ReadonlyArray<string>;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
}

export function DevtoolHeader({
  projectName,
  projectUrl,
  isConnected,
  projects,
  selectedProjectId,
  onSelectProject,
}: DevtoolHeaderProps) {
  const showProjectSelector = projects.length > 1;

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <h1 className="text-base font-bold">Next.js Profiler</h1>
        </div>
        {showProjectSelector ? (
          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <span className="font-mono text-xs">{projectName}</span>
              <ChevronDown className="size-3" />
            </button>
            <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-50">
              <div className="bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]">
                <button
                  type="button"
                  onClick={() => onSelectProject(null)}
                  className="flex items-center justify-between w-full px-3 py-1.5 text-xs hover:bg-accent text-left"
                >
                  <span>All Projects</span>
                  {selectedProjectId === null && <Check className="size-3" />}
                </button>
                <div className="h-px bg-border my-1" />
                {projects.map((project) => (
                  <button
                    key={project}
                    type="button"
                    onClick={() => onSelectProject(project)}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-mono hover:bg-accent text-left"
                  >
                    <span>{project}</span>
                    {selectedProjectId === project && (
                      <Check className="size-3" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Badge variant="secondary" className="font-mono text-xs">
            {projectName}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground font-mono">
          {projectUrl}
        </span>
        {isConnected && (
          <div className="flex items-center gap-1.5">
            <Circle className="size-2" fill="#22c55e" color="#22c55e" />
            <span className="text-xs text-green-500 font-medium">Live</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm">
          <Settings className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm">
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}
