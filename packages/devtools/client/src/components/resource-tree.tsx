import { useMemo, useCallback } from "react"
import { List } from "react-window"
import { ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  RESOURCE_TYPE_CONFIG,
  ORIGIN_CONFIG,
  getResourceConfig,
  getResourceDisplayName,
  formatDuration,
} from "@/lib/view-models"
import { useProfilingStore } from "@/lib/profiling-store"
import type { PageSession, Resource } from "@/domain"

interface ResourceTreeProps {
  session: PageSession
  filteredResources: ReadonlyArray<Resource>
}

interface FlattenedResource {
  resource: Resource
  depth: number
  isExpanded: boolean
  hasChildren: boolean
  isVisible: boolean
}

export function ResourceTree({ session, filteredResources }: ResourceTreeProps) {
  const { expandedResourceIds, toggleResourceExpanded, selectResource, selectedResourceId, expandAll, collapseAll } =
    useProfilingStore()

  const filteredIds = useMemo(() => new Set(filteredResources.map((r) => r.id)), [filteredResources])

  const flattenedResources = useMemo(() => {
    const result: FlattenedResource[] = []

    const flatten = (resources: ReadonlyArray<Resource>, depth: number, parentVisible: boolean) => {
      for (const resource of resources) {
        const isVisible = filteredIds.has(resource.id)
        const showResource = parentVisible || isVisible

        if (showResource) {
          const isExpanded = expandedResourceIds.has(resource.id)
          const hasChildren = resource.children.length > 0

          result.push({
            resource,
            depth,
            isExpanded,
            hasChildren,
            isVisible,
          })

          if (hasChildren && isExpanded) {
            flatten(resource.children, depth + 1, isVisible)
          }
        }
      }
    }

    flatten(session.rootResources, 0, true)
    return result
  }, [session.rootResources, expandedResourceIds, filteredIds])

  const handleRowClick = useCallback(
    (resource: Resource) => {
      selectResource(resource.id)
    },
    [selectResource]
  )

  const handleExpandToggle = useCallback(
    (e: React.MouseEvent, resourceId: string) => {
      e.stopPropagation()
      toggleResourceExpanded(resourceId)
    },
    [toggleResourceExpanded]
  )

  if (flattenedResources.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No resources match the current filters
      </div>
    )
  }

  const rowHeight = 32
  const maxHeight = Math.min(flattenedResources.length * rowHeight, 600)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Resources ({flattenedResources.length})
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={expandAll}
            className="text-[10px] px-2 py-0.5 bg-accent hover:bg-accent/80 rounded transition-colors"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="text-[10px] px-2 py-0.5 bg-accent hover:bg-accent/80 rounded transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <List<RowProps>
          rowCount={flattenedResources.length}
          rowHeight={rowHeight}
          defaultHeight={maxHeight}
          rowComponent={ResourceRow}
          rowProps={{
            items: flattenedResources,
            selectedResourceId,
            onRowClick: handleRowClick,
            onExpandToggle: handleExpandToggle,
          }}
        />
      </div>
    </div>
  )
}

interface RowProps {
  items: FlattenedResource[]
  selectedResourceId: string | null
  onRowClick: (resource: Resource) => void
  onExpandToggle: (e: React.MouseEvent, resourceId: string) => void
}

function ResourceRow(props: { index: number; style: React.CSSProperties } & RowProps) {
  const { index, style, items, selectedResourceId, onRowClick, onExpandToggle } = props
  const { resource, depth, isExpanded, hasChildren, isVisible } = items[index]

  const config = getResourceConfig(resource)
  const originConfig = ORIGIN_CONFIG[resource.origin]
  const displayName = getResourceDisplayName(resource)
  const isSelected = selectedResourceId === resource.id

  const paddingLeft = 8 + depth * 20

  return (
    <div
      style={{ ...style, paddingLeft }}
      className={cn(
        "flex items-center gap-2 pr-3 cursor-pointer transition-colors border-b border-border/30",
        isSelected ? "bg-accent" : "hover:bg-accent/50",
        !isVisible && "opacity-50"
      )}
      onClick={() => onRowClick(resource)}
    >
      <div className="flex items-center gap-1 min-w-[20px]">
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => onExpandToggle(e, resource.id)}
            className="p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="size-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
      </div>

      <div
        className={cn("w-1.5 h-4 rounded-sm flex-shrink-0", resource.origin === "server" ? "bg-green-500" : "bg-blue-500")}
        title={originConfig.label}
      />

      <span className={cn("text-[10px] w-10 flex-shrink-0", config.text)}>{RESOURCE_TYPE_CONFIG[resource.type].label}</span>

      <span className="flex-1 text-xs truncate" title={resource.name}>
        {displayName}
      </span>

      {resource.cached && (
        <span className="text-[9px] px-1 py-0.5 bg-teal-500/20 text-teal-400 rounded">cached</span>
      )}

      {resource.status === "error" && (
        <span className="text-[9px] px-1 py-0.5 bg-red-500/20 text-red-400 rounded">error</span>
      )}

      <span className="text-[10px] font-mono text-muted-foreground w-16 text-right flex-shrink-0">
        {formatDuration(resource.duration)}
      </span>
    </div>
  )
}
