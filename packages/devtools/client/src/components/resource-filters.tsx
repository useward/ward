import { AlertTriangle, Monitor, Search, Server, X } from "lucide-react";
import type { ResourceFilterState, ResourceType, SpanOrigin } from "@/domain";
import { cn } from "@/lib/utils";
import { RESOURCE_TYPE_CONFIG } from "@/lib/view-models";

interface ResourceFiltersProps {
  filters: ResourceFilterState;
  onFiltersChange: (filters: Partial<ResourceFilterState>) => void;
}

export function ResourceFilters({
  filters,
  onFiltersChange,
}: ResourceFiltersProps) {
  const hasActiveFilters =
    filters.search !== "" ||
    filters.types.length > 0 ||
    filters.origins.length > 0 ||
    filters.minDuration > 0 ||
    filters.showErrorsOnly;

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      types: [],
      origins: [],
      minDuration: 0,
      showErrorsOnly: false,
    });
  };

  const toggleType = (type: ResourceType) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    onFiltersChange({ types: newTypes });
  };

  const toggleOrigin = (origin: SpanOrigin) => {
    const newOrigins = filters.origins.includes(origin)
      ? filters.origins.filter((o) => o !== origin)
      : [...filters.origins, origin];
    onFiltersChange({ origins: newOrigins });
  };

  return (
    <div className="px-4 py-2 border-b border-border space-y-2 bg-card/30">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter resources..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value })}
          />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => toggleOrigin("server")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors",
              filters.origins.includes("server")
                ? "bg-green-500/20 border-green-500 text-green-400"
                : "bg-background border-border text-muted-foreground hover:bg-accent",
            )}
          >
            <Server className="size-2.5" />
            Server
          </button>
          <button
            type="button"
            onClick={() => toggleOrigin("client")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors",
              filters.origins.includes("client")
                ? "bg-blue-500/20 border-blue-500 text-blue-400"
                : "bg-background border-border text-muted-foreground hover:bg-accent",
            )}
          >
            <Monitor className="size-2.5" />
            Client
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            onFiltersChange({ showErrorsOnly: !filters.showErrorsOnly })
          }
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors",
            filters.showErrorsOnly
              ? "bg-red-500/20 border-red-500 text-red-400"
              : "bg-background border-border text-muted-foreground hover:bg-accent",
          )}
        >
          <AlertTriangle className="size-2.5" />
          Errors
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Min:</span>
          <input
            type="number"
            min={0}
            step={10}
            placeholder="0"
            className="w-14 px-1.5 py-1 text-[10px] bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            value={filters.minDuration || ""}
            onChange={(e) =>
              onFiltersChange({ minDuration: Number(e.target.value) || 0 })
            }
          />
          <span className="text-[10px] text-muted-foreground">ms</span>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-accent hover:bg-accent/80 text-muted-foreground transition-colors"
          >
            <X className="size-2.5" />
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {(Object.keys(RESOURCE_TYPE_CONFIG) as ResourceType[]).map((type) => {
          const cfg = RESOURCE_TYPE_CONFIG[type];
          const isActive = filters.types.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded border transition-colors",
                isActive
                  ? cn(cfg.bg, cfg.border, cfg.text)
                  : "bg-background border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
