import { Activity, Circle, Settings, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface DevtoolHeaderProps {
  projectName: string
  projectUrl: string
  isConnected: boolean
}

export function DevtoolHeader({ projectName, projectUrl, isConnected }: DevtoolHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <h1 className="text-base font-bold">Next.js Profiler</h1>
        </div>
        <Badge variant="secondary" className="font-mono text-xs">
          {projectName}
        </Badge>
        <span className="text-xs text-muted-foreground font-mono">{projectUrl}</span>
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
  )
}
