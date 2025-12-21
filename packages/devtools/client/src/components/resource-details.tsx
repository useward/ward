import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Link2,
  Monitor,
  Server,
  X,
  Zap,
} from "lucide-react";
import type { PageSession, Resource } from "@/domain";
import { Z_INDEX } from "@/lib/design-tokens";
import { useProfilingStore } from "@/lib/profiling-store";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  getResourceConfig,
  ORIGIN_CONFIG,
  RESOURCE_TYPE_CONFIG,
} from "@/lib/view-models";

interface ResourceDetailsProps {
  session: PageSession;
}

export function ResourceDetails({ session }: ResourceDetailsProps) {
  const { selectedResourceId, selectResource } = useProfilingStore();

  const resource = findResourceById(session.resources, selectedResourceId);

  if (!resource) {
    return null;
  }

  const config = getResourceConfig(resource);
  const typeConfig = RESOURCE_TYPE_CONFIG[resource.type];

  return (
    <div
      className="fixed right-0 top-0 h-full w-100 bg-card border-l border-border shadow-xl flex flex-col"
      style={{ zIndex: Z_INDEX.modal }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-4 rounded-sm",
              resource.origin === "server" ? "bg-green-500" : "bg-blue-500",
            )}
          />
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded",
              config.bg,
              config.text,
            )}
          >
            {typeConfig.label}
          </span>
          <h3
            className="font-semibold text-sm truncate max-w-50"
            title={resource.name}
          >
            {resource.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => selectResource(null)}
          className="p-1 hover:bg-accent rounded transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          <SummarySection resource={resource} />

          <TimingSection
            resource={resource}
            sessionStart={session.timing.navigationStart}
          />

          {resource.url && <UrlSection url={resource.url} />}

          <AttributesSection attributes={resource.attributes} />

          {resource.children.length > 0 && (
            <ChildrenSection>{resource.children}</ChildrenSection>
          )}
        </div>
      </div>
    </div>
  );
}

function findResourceById(
  resources: ReadonlyArray<Resource>,
  id: string | null,
): Resource | null {
  if (!id) return null;
  for (const resource of resources) {
    if (resource.id === id) return resource;
    const found = findResourceById(resource.children, id);
    if (found) return found;
  }
  return null;
}

function SummarySection({ resource }: { resource: Resource }) {
  const originConfig = ORIGIN_CONFIG[resource.origin];

  return (
    <div className="grid grid-cols-2 gap-3">
      <InfoCard
        icon={<Clock className="size-3.5" />}
        label="Duration"
        value={formatDuration(resource.duration)}
        className="font-mono"
      />
      <InfoCard
        icon={
          resource.origin === "server" ? (
            <Server className="size-3.5 text-green-400" />
          ) : (
            <Monitor className="size-3.5 text-blue-400" />
          )
        }
        label="Origin"
        value={originConfig.label}
      />
      <InfoCard
        icon={
          resource.status === "error" ? (
            <AlertTriangle className="size-3.5 text-red-400" />
          ) : (
            <CheckCircle className="size-3.5 text-green-400" />
          )
        }
        label="Status"
        value={resource.status === "error" ? "Error" : "OK"}
        valueClassName={
          resource.status === "error" ? "text-red-400" : "text-green-400"
        }
      />
      {resource.statusCode !== undefined && (
        <InfoCard
          icon={<Zap className="size-3.5" />}
          label="HTTP Status"
          value={String(resource.statusCode)}
          valueClassName={
            resource.statusCode >= 400
              ? "text-red-400"
              : resource.statusCode >= 300
                ? "text-amber-400"
                : "text-green-400"
          }
        />
      )}
      {resource.size !== undefined && (
        <InfoCard
          icon={<Database className="size-3.5" />}
          label="Size"
          value={formatBytes(resource.size)}
        />
      )}
      {resource.cached && (
        <InfoCard
          icon={<Database className="size-3.5 text-teal-400" />}
          label="Cache"
          value="Cached"
          valueClassName="text-teal-400"
        />
      )}
    </div>
  );
}

interface InfoCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}

function InfoCard({
  icon,
  label,
  value,
  className,
  valueClassName,
}: InfoCardProps) {
  return (
    <div className={cn("bg-accent/30 rounded-lg p-2.5", className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn("text-sm font-medium", valueClassName)}>{value}</div>
    </div>
  );
}

function TimingSection({
  resource,
  sessionStart,
}: {
  resource: Resource;
  sessionStart: number;
}) {
  const relativeStart = resource.startTime - sessionStart;
  const relativeEnd = resource.endTime - sessionStart;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Timing
      </h4>
      <div className="bg-accent/20 rounded-lg p-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Start</span>
          <span className="font-mono">
            {formatDuration(relativeStart)} from nav start
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">End</span>
          <span className="font-mono">
            {formatDuration(relativeEnd)} from nav start
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Duration</span>
          <span className="font-mono font-medium">
            {formatDuration(resource.duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

function UrlSection({ url }: { url: string }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Link2 className="size-3" />
        URL
      </h4>
      <div className="bg-accent/20 rounded-lg p-3">
        <p className="text-xs font-mono break-all text-muted-foreground">
          {url}
        </p>
      </div>
    </div>
  );
}

function AttributesSection({
  attributes,
}: {
  attributes: Record<string, string | number | boolean>;
}) {
  const entries = Object.entries(attributes).filter(
    ([key]) => !key.startsWith("nextdoctor."),
  );

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Attributes
      </h4>
      <div className="bg-accent/20 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key} className="border-b border-border/30 last:border-0">
                <td
                  className="px-3 py-1.5 text-muted-foreground font-mono truncate max-w-37.5"
                  title={key}
                >
                  {key}
                </td>
                <td className="px-3 py-1.5 font-mono break-all">
                  {String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChildrenSection({ children }: { children: ReadonlyArray<Resource> }) {
  const { selectResource } = useProfilingStore();

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Child Resources ({children.length})
      </h4>
      <div className="space-y-1">
        {children.slice(0, 10).map((child) => {
          const config = getResourceConfig(child);
          return (
            <button
              key={child.id}
              type="button"
              onClick={() => selectResource(child.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left bg-accent/20 hover:bg-accent/40 rounded-lg transition-colors"
            >
              <div
                className={cn(
                  "w-1 h-4 rounded-sm",
                  child.origin === "server" ? "bg-green-500" : "bg-blue-500",
                )}
              />
              <span className={cn("text-[10px] font-medium", config.text)}>
                {RESOURCE_TYPE_CONFIG[child.type].label}
              </span>
              <span className="flex-1 text-xs truncate">{child.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {formatDuration(child.duration)}
              </span>
            </button>
          );
        })}
        {children.length > 10 && (
          <div className="text-[10px] text-muted-foreground text-center py-1">
            +{children.length - 10} more
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
