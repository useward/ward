import type {
  NavigationType,
  PageSession,
  Resource,
  ResourceType,
  SpanOrigin,
} from "@/domain";

export interface NavigationTypeConfig {
  readonly label: string;
  readonly color: string;
  readonly bgColor: string;
}

export const NAVIGATION_TYPE_CONFIG: Record<
  NavigationType,
  NavigationTypeConfig
> = {
  initial: {
    label: "Initial",
    color: "text-green-400",
    bgColor: "bg-green-600",
  },
  navigation: { label: "Nav", color: "text-blue-400", bgColor: "bg-blue-600" },
  "back-forward": {
    label: "Back",
    color: "text-purple-400",
    bgColor: "bg-purple-600",
  },
};

export interface ResourceTypeConfig {
  readonly label: string;
  readonly icon: string;
  readonly bg: string;
  readonly border: string;
  readonly text: string;
}

export const RESOURCE_TYPE_CONFIG: Record<ResourceType, ResourceTypeConfig> = {
  document: {
    label: "Doc",
    icon: "📄",
    bg: "bg-green-500/40",
    border: "border-green-500",
    text: "text-green-400",
  },
  fetch: {
    label: "Fetch",
    icon: "🔗",
    bg: "bg-blue-500/40",
    border: "border-blue-500",
    text: "text-blue-400",
  },
  api: {
    label: "API",
    icon: "⚡",
    bg: "bg-purple-500/40",
    border: "border-purple-500",
    text: "text-purple-400",
  },
  database: {
    label: "DB",
    icon: "🗄️",
    bg: "bg-amber-500/40",
    border: "border-amber-500",
    text: "text-amber-400",
  },
  external: {
    label: "Ext",
    icon: "🌐",
    bg: "bg-orange-500/40",
    border: "border-orange-500",
    text: "text-orange-400",
  },
  rsc: {
    label: "RSC",
    icon: "⚛️",
    bg: "bg-cyan-500/40",
    border: "border-cyan-500",
    text: "text-cyan-400",
  },
  action: {
    label: "Action",
    icon: "🎯",
    bg: "bg-pink-500/40",
    border: "border-pink-500",
    text: "text-pink-400",
  },
  render: {
    label: "Render",
    icon: "🖼️",
    bg: "bg-emerald-500/40",
    border: "border-emerald-500",
    text: "text-emerald-400",
  },
  hydration: {
    label: "Hydrate",
    icon: "💧",
    bg: "bg-violet-500/40",
    border: "border-violet-500",
    text: "text-violet-400",
  },
  cache: {
    label: "Cache",
    icon: "📦",
    bg: "bg-teal-500/40",
    border: "border-teal-500",
    text: "text-teal-400",
  },
  other: {
    label: "Other",
    icon: "📎",
    bg: "bg-gray-500/40",
    border: "border-gray-500",
    text: "text-gray-400",
  },
};

export const ERROR_CONFIG: ResourceTypeConfig = {
  label: "Error",
  icon: "❌",
  bg: "bg-red-500/50",
  border: "border-red-500",
  text: "text-red-400",
};

export const ORIGIN_CONFIG: Record<
  SpanOrigin,
  { label: string; color: string; icon: string }
> = {
  server: { label: "Server", color: "text-green-400", icon: "🖥️" },
  client: { label: "Client", color: "text-blue-400", icon: "💻" },
};

export const getResourceConfig = (resource: Resource): ResourceTypeConfig =>
  resource.status === "error"
    ? ERROR_CONFIG
    : RESOURCE_TYPE_CONFIG[resource.type];

export const countDataFetches = (session: PageSession): number =>
  session.resources.filter(
    (r) =>
      r.type === "fetch" ||
      r.type === "api" ||
      r.type === "database" ||
      r.type === "external",
  ).length;

export const formatDuration = (ms: number): string => {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export const formatElapsedTime = (startTime: number, now: number): string => {
  const seconds = Math.floor((now - startTime) / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

export const getResourceDisplayName = (resource: Resource): string => {
  const name = resource.name;
  const method = String(
    resource.attributes["http.request.method"] ??
      resource.attributes["http.method"] ??
      "",
  );

  if (
    name.startsWith("HTTP ") ||
    name === "fetch" ||
    resource.type === "fetch" ||
    resource.type === "api" ||
    resource.type === "external"
  ) {
    const url =
      resource.url ||
      resource.attributes["url.full"] ||
      resource.attributes["http.url"];
    const target = resource.attributes["http.target"];

    if (target && typeof target === "string") {
      const path =
        target.length > 40 ? `${target.substring(0, 40)}...` : target;
      return method ? `${method} ${path}` : path;
    }

    if (url) {
      try {
        const parsed = new URL(String(url), "http://localhost");
        const path =
          parsed.pathname.length > 40
            ? `${parsed.pathname.substring(0, 40)}...`
            : parsed.pathname;
        return method ? `${method} ${path}` : path;
      } catch {
        return method ? `${method} ${name}` : name;
      }
    }

    if (method) {
      return `${method} ${name}`;
    }
  }

  if (name.length > 50) {
    return `${name.substring(0, 50)}...`;
  }

  return name;
};

export const getTimelinePosition = (
  startTime: number,
  sessionStartTime: number,
  totalDuration: number,
  zoom: number,
  panOffset: number,
): number => {
  if (totalDuration === 0) return 0;
  const basePosition = ((startTime - sessionStartTime) / totalDuration) * 100;
  return (basePosition - panOffset) * zoom;
};

export const getTimelineWidth = (
  duration: number,
  totalDuration: number,
  zoom: number,
): number => {
  if (totalDuration === 0) return 0;
  return Math.max((duration / totalDuration) * 100 * zoom, 0.5);
};

export const formatTimeMarker = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};
