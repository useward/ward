import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Database,
  Layers,
  Maximize2,
  Monitor,
  Search,
  Server,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";
import { ResourceFilters } from "@/components/resource-filters";
import { ResourceTree } from "@/components/resource-tree";
import { SessionWaterfall } from "@/components/session-waterfall";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  NavigationType,
  PageSession,
  Resource,
  ResourceFilterState,
} from "@/domain";
import { filterResources } from "@/domain";
import {
  filteredSessionsSelector,
  useProfilingStore,
} from "@/lib/profiling-store";
import { cn } from "@/lib/utils";
import {
  countDataFetches,
  formatDuration,
  NAVIGATION_TYPE_CONFIG,
} from "@/lib/view-models";

type SortField = "time" | "duration" | "resources";
type SortOrder = "asc" | "desc";

export function SessionsPanel() {
  const {
    selectedSessionId,
    selectSession,
    filters,
    setFilters,
    zoomPan,
    setZoom,
    resetZoomPan,
  } = useProfilingStore();
  const sessions = useProfilingStore(useShallow(filteredSessionsSelector));

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<NavigationType | "ALL">("ALL");
  const [sortField, setSortField] = useState<SortField>("time");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [showDetails, setShowDetails] = useState(false);

  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.route.toLowerCase().includes(query) ||
          s.url.toLowerCase().includes(query),
      );
    }

    if (filterType !== "ALL") {
      result = result.filter((s) => s.navigationType === filterType);
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "time":
          comparison = a.timing.navigationStart - b.timing.navigationStart;
          break;
        case "duration":
          comparison = a.stats.totalDuration - b.stats.totalDuration;
          break;
        case "resources":
          comparison = a.stats.totalResources - b.stats.totalResources;
          break;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    return result;
  }, [sessions, searchQuery, filterType, sortField, sortOrder]);

  const selectedSession =
    sessions.find((s) => s.id === selectedSessionId) ?? null;

  const filteredResources = useMemo(() => {
    if (!selectedSession) return [];
    return filterResources(selectedSession.resources, {
      search: filters.search,
      types: filters.types.length > 0 ? filters.types : undefined,
      origins: filters.origins.length > 0 ? filters.origins : undefined,
      minDuration: filters.minDuration,
      showErrorsOnly: filters.showErrorsOnly,
    });
  }, [selectedSession, filters]);

  return (
    <div className="flex h-full">
      <SessionList
        sessions={filteredSessions}
        selectedId={selectedSessionId}
        searchQuery={searchQuery}
        filterType={filterType}
        sortField={sortField}
        sortOrder={sortOrder}
        onSelectSession={selectSession}
        onSearchChange={setSearchQuery}
        onFilterChange={setFilterType}
        onSortChange={(field, order) => {
          setSortField(field);
          setSortOrder(order);
        }}
      />

      <SessionDetailPanel
        session={selectedSession}
        filteredResources={filteredResources}
        showDetails={showDetails}
        onToggleDetails={() => setShowDetails(!showDetails)}
        filters={filters}
        onFiltersChange={setFilters}
        zoom={zoomPan.zoom}
        onZoomChange={setZoom}
        onResetZoom={resetZoomPan}
      />
    </div>
  );
}

interface SessionListProps {
  sessions: ReadonlyArray<PageSession>;
  selectedId: string | null;
  searchQuery: string;
  filterType: NavigationType | "ALL";
  sortField: SortField;
  sortOrder: SortOrder;
  onSelectSession: (id: string) => void;
  onSearchChange: (query: string) => void;
  onFilterChange: (type: NavigationType | "ALL") => void;
  onSortChange: (field: SortField, order: SortOrder) => void;
}

function SessionList({
  sessions,
  selectedId,
  searchQuery,
  filterType,
  sortField,
  sortOrder,
  onSelectSession,
  onSearchChange,
  onFilterChange,
  onSortChange,
}: SessionListProps) {
  return (
    <div className="w-[320px] border-r border-border flex flex-col bg-card/50">
      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sessions ({sessions.length})
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
            onChange={(e) =>
              onFilterChange(e.target.value as NavigationType | "ALL")
            }
          >
            <option value="ALL">All</option>
            <option value="initial">Initial</option>
            <option value="navigation">Navigation</option>
            <option value="back-forward">Back/Forward</option>
          </select>
          <select
            className="flex-1 bg-background border border-border rounded px-1 py-0.5 focus:outline-none text-[11px]"
            value={`${sortField}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split("-") as [
                SortField,
                SortOrder,
              ];
              onSortChange(field, order);
            }}
          >
            <option value="time-desc">Newest</option>
            <option value="duration-desc">Slowest</option>
            <option value="resources-desc">Most resources</option>
          </select>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div>
          {sessions.map((session) => (
            <SessionListItem
              key={session.id}
              session={session}
              isSelected={selectedId === session.id}
              onClick={() => onSelectSession(session.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface SessionListItemProps {
  session: PageSession;
  isSelected: boolean;
  onClick: () => void;
}

function SessionListItem({
  session,
  isSelected,
  onClick,
}: SessionListItemProps) {
  const config = NAVIGATION_TYPE_CONFIG[session.navigationType];
  const hasError = session.stats.errorCount > 0;
  const isInitial = session.navigationType === "initial";
  const dataFetchCount = countDataFetches(session);

  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        "w-full text-left px-3 py-2 cursor-pointer border-b border-border/50 transition-colors",
        "hover:bg-accent/50",
        isSelected && "bg-accent/70 border-l-2 border-l-primary",
        hasError && "bg-red-950/10",
        isInitial && !hasError && "bg-green-950/5",
      )}
    >
      <div className="flex items-center gap-2">
        <Badge className={cn("font-mono text-[9px] px-1.5", config.bgColor)}>
          {config.label}
        </Badge>
        <span
          className={cn(
            "flex-1 text-xs truncate",
            isInitial ? "font-semibold" : "text-muted-foreground",
          )}
        >
          {session.route}
        </span>
        <span className="text-xs font-mono text-muted-foreground">
          {formatDuration(session.stats.totalDuration)}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-0.5">
          <Layers className="size-2.5" />
          {session.stats.totalResources}
        </span>
        {dataFetchCount > 0 && (
          <span className="flex items-center gap-0.5 text-amber-400">
            <Database className="size-2.5" />
            {dataFetchCount}
          </span>
        )}
        {session.stats.serverResources > 0 && (
          <span className="flex items-center gap-0.5 text-green-400">
            <Server className="size-2.5" />
            {session.stats.serverResources}
          </span>
        )}
        {hasError && (
          <span className="text-red-400 font-medium">
            {session.stats.errorCount} err
          </span>
        )}
      </div>
    </button>
  );
}

interface SessionDetailPanelProps {
  session: PageSession | null;
  filteredResources: ReadonlyArray<Resource>;
  showDetails: boolean;
  onToggleDetails: () => void;
  filters: ResourceFilterState;
  onFiltersChange: (filters: Partial<ResourceFilterState>) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onResetZoom: () => void;
}

function SessionDetailPanel({
  session,
  filteredResources,
  showDetails,
  onToggleDetails,
  filters,
  onFiltersChange,
  zoom,
  onZoomChange,
  onResetZoom,
}: SessionDetailPanelProps) {
  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <ChevronRight className="size-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            Select a session to view its resources
          </p>
        </div>
      </div>
    );
  }

  const dataFetchCount = countDataFetches(session);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <SessionHeader
        session={session}
        showDetails={showDetails}
        onToggleDetails={onToggleDetails}
      />

      {dataFetchCount > 0 && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <Zap className="size-4" />
            <span className="font-medium">
              {dataFetchCount} data {dataFetchCount === 1 ? "fetch" : "fetches"}{" "}
              for this page
            </span>
          </div>
        </div>
      )}

      <ResourceFilters filters={filters} onFiltersChange={onFiltersChange} />

      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Zoom:</span>
        <button
          type="button"
          onClick={() => onZoomChange(zoom / 1.5)}
          className="p-1 hover:bg-accent rounded"
          title="Zoom out"
        >
          <ZoomOut className="size-3" />
        </button>
        <span className="text-xs font-mono w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => onZoomChange(zoom * 1.5)}
          className="p-1 hover:bg-accent rounded"
          title="Zoom in"
        >
          <ZoomIn className="size-3" />
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          className="p-1 hover:bg-accent rounded"
          title="Fit to window"
        >
          <Maximize2 className="size-3" />
        </button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <SessionWaterfall
          session={session}
          filteredResources={filteredResources}
          zoom={zoom}
        />
        <div className="mt-4">
          <ResourceTree
            session={session}
            filteredResources={filteredResources}
          />
        </div>
      </ScrollArea>
    </div>
  );
}

interface SessionHeaderProps {
  session: PageSession;
  showDetails: boolean;
  onToggleDetails: () => void;
}

function SessionHeader({
  session,
  showDetails,
  onToggleDetails,
}: SessionHeaderProps) {
  const config = NAVIGATION_TYPE_CONFIG[session.navigationType];

  return (
    <div className="px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Badge className={cn("font-mono", config.bgColor)}>
            {config.label}
          </Badge>
          <h2 className="text-lg font-semibold font-mono">{session.route}</h2>
        </div>
        <button
          onClick={onToggleDetails}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          {showDetails ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          {showDetails ? "Hide" : "Show"} Details
        </button>
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <Clock className="size-4 text-muted-foreground" />
          <span className="font-mono font-semibold">
            {formatDuration(session.stats.totalDuration)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Layers className="size-4 text-muted-foreground" />
          <span className="font-mono">
            {session.stats.totalResources} resources
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Server className="size-4 text-green-400" />
          <span className="font-mono">{session.stats.serverResources}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Monitor className="size-4 text-blue-400" />
          <span className="font-mono">{session.stats.clientResources}</span>
        </div>
        {session.stats.errorCount > 0 && (
          <div className="flex items-center gap-1.5 text-red-400">
            <AlertTriangle className="size-4" />
            <span className="font-mono">{session.stats.errorCount} errors</span>
          </div>
        )}
        {session.stats.slowestResource && (
          <div className="flex items-center gap-1.5 text-amber-400 ml-auto">
            <Zap className="size-4" />
            <span className="text-xs">
              Slowest:{" "}
              <span className="font-mono">
                {session.stats.slowestResource.name.substring(0, 30)}
              </span>{" "}
              ({formatDuration(session.stats.slowestResource.duration)})
            </span>
          </div>
        )}
      </div>

      {showDetails && <SessionDetailsExpanded session={session} />}
    </div>
  );
}

function SessionDetailsExpanded({ session }: { session: PageSession }) {
  return (
    <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Timing
        </h3>
        <div className="space-y-1 text-xs">
          {session.timing.serverStart !== undefined &&
            session.timing.serverEnd !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Server Processing</span>
                <span className="font-mono">
                  {formatDuration(
                    session.timing.serverEnd - session.timing.serverStart,
                  )}
                </span>
              </div>
            )}
          {session.timing.responseStart !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">TTFB</span>
              <span className="font-mono">
                {formatDuration(session.timing.responseStart)}
              </span>
            </div>
          )}
          {session.timing.domContentLoaded !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">DOMContentLoaded</span>
              <span className="font-mono">
                {formatDuration(session.timing.domContentLoaded)}
              </span>
            </div>
          )}
          {session.timing.load !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Load</span>
              <span className="font-mono">
                {formatDuration(session.timing.load)}
              </span>
            </div>
          )}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          URL
        </h3>
        <p className="text-xs text-muted-foreground break-all">{session.url}</p>
      </div>
    </div>
  );
}
