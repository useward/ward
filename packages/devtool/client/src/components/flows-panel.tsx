import { useState, useMemo } from "react"
import { Search, ChevronRight, Server, Monitor, Layers, AlertTriangle, Clock, Database, Zap, ChevronDown, ChevronUp } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { FlowWaterfall } from "@/components/flow-waterfall"
import { cn } from "@/lib/utils"
import { FLOW_TYPE_CONFIG, countDataFetches } from "@/lib/view-models"
import type { RequestFlow, FlowType } from "@/domain"

interface FlowsPanelProps {
  flows: ReadonlyArray<RequestFlow>
}

type SortField = "time" | "duration" | "spans"
type SortOrder = "asc" | "desc"

export function FlowsPanel({ flows }: FlowsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<FlowType | "ALL">("ALL")
  const [sortField, setSortField] = useState<SortField>("time")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [showDetails, setShowDetails] = useState(false)

  const filteredFlows = useMemo(() => {
    let result = [...flows]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter((f) => f.name.toLowerCase().includes(query) || f.url.toLowerCase().includes(query))
    }

    if (filterType !== "ALL") {
      result = result.filter((f) => f.type === filterType)
    }

    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case "time":
          comparison = a.startTime - b.startTime
          break
        case "duration":
          comparison = a.duration - b.duration
          break
        case "spans":
          comparison = a.spans.length - b.spans.length
          break
      }
      return sortOrder === "desc" ? -comparison : comparison
    })

    return result
  }, [flows, searchQuery, filterType, sortField, sortOrder])

  const selectedFlow = flows.find((f) => f.id === selectedId) ?? null

  return (
    <div className="flex h-full">
      <FlowList
        flows={filteredFlows}
        selectedId={selectedId}
        searchQuery={searchQuery}
        filterType={filterType}
        sortField={sortField}
        sortOrder={sortOrder}
        onSelectFlow={setSelectedId}
        onSearchChange={setSearchQuery}
        onFilterChange={setFilterType}
        onSortChange={(field, order) => {
          setSortField(field)
          setSortOrder(order)
        }}
      />

      <FlowDetailPanel
        flow={selectedFlow}
        showDetails={showDetails}
        onToggleDetails={() => setShowDetails(!showDetails)}
      />
    </div>
  )
}

interface FlowListProps {
  flows: ReadonlyArray<RequestFlow>
  selectedId: string | null
  searchQuery: string
  filterType: FlowType | "ALL"
  sortField: SortField
  sortOrder: SortOrder
  onSelectFlow: (id: string) => void
  onSearchChange: (query: string) => void
  onFilterChange: (type: FlowType | "ALL") => void
  onSortChange: (field: SortField, order: SortOrder) => void
}

function FlowList({
  flows,
  selectedId,
  searchQuery,
  filterType,
  sortField,
  sortOrder,
  onSelectFlow,
  onSearchChange,
  onFilterChange,
  onSortChange,
}: FlowListProps) {
  return (
    <div className="w-[320px] border-r border-border flex flex-col bg-card/50">
      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Flows ({flows.length})
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1 text-xs">
          <select
            className="flex-1 bg-background border border-border rounded px-1 py-0.5 focus:outline-none text-[11px]"
            value={filterType}
            onChange={(e) => onFilterChange(e.target.value as FlowType | "ALL")}
          >
            <option value="ALL">All</option>
            <option value="page-load">Pages</option>
            <option value="api-call">API</option>
          </select>
          <select
            className="flex-1 bg-background border border-border rounded px-1 py-0.5 focus:outline-none text-[11px]"
            value={`${sortField}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split("-") as [SortField, SortOrder]
              onSortChange(field, order)
            }}
          >
            <option value="time-desc">Newest</option>
            <option value="duration-desc">Slowest</option>
            <option value="spans-desc">Most spans</option>
          </select>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div>
          {flows.map((flow) => (
            <FlowListItem
              key={flow.id}
              flow={flow}
              isSelected={selectedId === flow.id}
              onClick={() => onSelectFlow(flow.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

interface FlowListItemProps {
  flow: RequestFlow
  isSelected: boolean
  onClick: () => void
}

function FlowListItem({ flow, isSelected, onClick }: FlowListItemProps) {
  const config = FLOW_TYPE_CONFIG[flow.type]
  const hasError = flow.stats.errorCount > 0
  const isPageLoad = flow.type === "page-load"
  const dataFetchCount = countDataFetches(flow)

  return (
    <div
      onClick={onClick}
      className={cn(
        "px-3 py-2 cursor-pointer border-b border-border/50 transition-colors",
        "hover:bg-accent/50",
        isSelected && "bg-accent/70 border-l-2 border-l-primary",
        hasError && "bg-red-950/10",
        isPageLoad && !hasError && "bg-green-950/5"
      )}
    >
      <div className="flex items-center gap-2">
        <Badge className={cn("font-mono text-[9px] px-1.5", config.color)}>{config.label}</Badge>
        <span className={cn("flex-1 text-xs truncate", isPageLoad ? "font-semibold" : "text-muted-foreground")}>
          {flow.name}
        </span>
        <span className="text-xs font-mono text-muted-foreground">{flow.duration}ms</span>
      </div>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-0.5">
          <Layers className="size-2.5" />
          {flow.spans.length}
        </span>
        {isPageLoad && dataFetchCount > 0 && (
          <span className="flex items-center gap-0.5 text-amber-400">
            <Database className="size-2.5" />
            {dataFetchCount}
          </span>
        )}
        {flow.stats.serverSpanCount > 0 && (
          <span className="flex items-center gap-0.5 text-green-400">
            <Server className="size-2.5" />
            {flow.stats.serverSpanCount}
          </span>
        )}
        {hasError && <span className="text-red-400 font-medium">{flow.stats.errorCount} err</span>}
      </div>
    </div>
  )
}

interface FlowDetailPanelProps {
  flow: RequestFlow | null
  showDetails: boolean
  onToggleDetails: () => void
}

function FlowDetailPanel({ flow, showDetails, onToggleDetails }: FlowDetailPanelProps) {
  if (!flow) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <ChevronRight className="size-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Select a flow to view its waterfall</p>
        </div>
      </div>
    )
  }

  const dataFetchCount = countDataFetches(flow)

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <FlowHeader flow={flow} showDetails={showDetails} onToggleDetails={onToggleDetails} />

      {flow.type === "page-load" && dataFetchCount > 0 && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <Zap className="size-4" />
            <span className="font-medium">
              This page required {dataFetchCount} data {dataFetchCount === 1 ? "fetch" : "fetches"} to render
            </span>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 p-4">
        <FlowWaterfall flow={flow} />
      </ScrollArea>
    </div>
  )
}

interface FlowHeaderProps {
  flow: RequestFlow
  showDetails: boolean
  onToggleDetails: () => void
}

function FlowHeader({ flow, showDetails, onToggleDetails }: FlowHeaderProps) {
  const config = FLOW_TYPE_CONFIG[flow.type]

  return (
    <div className="px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Badge className={cn("font-mono", config.color)}>{config.label}</Badge>
          <h2 className="text-lg font-semibold font-mono">{flow.name}</h2>
        </div>
        <button
          onClick={onToggleDetails}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {showDetails ? "Hide" : "Show"} Details
        </button>
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <Clock className="size-4 text-muted-foreground" />
          <span className="font-mono font-semibold">{flow.duration}ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Layers className="size-4 text-muted-foreground" />
          <span className="font-mono">{flow.spans.length} spans</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Server className="size-4 text-green-400" />
          <span className="font-mono">{flow.stats.serverSpanCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Monitor className="size-4 text-blue-400" />
          <span className="font-mono">{flow.stats.clientSpanCount}</span>
        </div>
        {flow.stats.errorCount > 0 && (
          <div className="flex items-center gap-1.5 text-red-400">
            <AlertTriangle className="size-4" />
            <span className="font-mono">{flow.stats.errorCount} errors</span>
          </div>
        )}
        {flow.stats.slowestSpan && (
          <div className="flex items-center gap-1.5 text-amber-400 ml-auto">
            <Zap className="size-4" />
            <span className="text-xs">
              Slowest: <span className="font-mono">{flow.stats.slowestSpan.name}</span> ({flow.stats.slowestSpan.duration}
              ms)
            </span>
          </div>
        )}
      </div>

      {showDetails && <FlowDetailsExpanded flow={flow} />}
    </div>
  )
}

function FlowDetailsExpanded({ flow }: { flow: RequestFlow }) {
  return (
    <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Phases</h3>
        <div className="space-y-1">
          {flow.phases.serverDataFetch && (
            <PhaseRow label="Server Data Fetch" duration={flow.phases.serverDataFetch.duration} color="bg-amber-500" />
          )}
          {flow.phases.serverRender && (
            <PhaseRow label="Server Render" duration={flow.phases.serverRender.duration} color="bg-green-500" />
          )}
          {flow.phases.hydration && (
            <PhaseRow label="Hydration" duration={flow.phases.hydration.duration} color="bg-purple-500" />
          )}
        </div>
      </div>
    </div>
  )
}

function PhaseRow({ label, duration, color }: { label: string; duration: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5">
        <div className={cn("w-2 h-2 rounded-sm", color)} />
        {label}
      </span>
      <span className="font-mono text-muted-foreground">{duration}ms</span>
    </div>
  )
}
