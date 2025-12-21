export interface NextDoctorConfig {
  projectId?: string;
  debug?: boolean;
}

const GENERIC_NAMES = ["next-app", "my-app", "app", "web", "frontend"];

export function resolveProjectId(config?: NextDoctorConfig): string {
  if (config?.projectId) {
    return config.projectId;
  }

  try {
    const pkg = require(`${process.cwd()}/package.json`) as { name?: string };
    if (pkg.name && !GENERIC_NAMES.includes(pkg.name)) {
      return pkg.name;
    }
  } catch {
    // package.json not found or not readable
  }

  const cwd = process.cwd();
  const dirName = cwd.split(/[/\\]/).pop() ?? "";
  if (dirName && !GENERIC_NAMES.includes(dirName)) {
    return dirName;
  }

  return "unknown-project";
}

const PROJECT_ID_KEY = Symbol.for("nextdoctor.projectId");
const globalWithProjectId = globalThis as unknown as Record<symbol, string>;

export function setProjectId(projectId: string): void {
  globalWithProjectId[PROJECT_ID_KEY] = projectId;
}

export function getProjectId(): string {
  return globalWithProjectId[PROJECT_ID_KEY] ?? "unknown-project";
}
