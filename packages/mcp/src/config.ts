import * as path from "node:path";
import { SERVER_PORT } from "@useward/shared";

export interface McpConfig {
  readonly devtoolsUrl: string;
  readonly sessionRetention: number;
  readonly debounceMs: number;
}

export const loadConfig = (): McpConfig => {
  const port = process.env.WARD_PORT ?? SERVER_PORT;
  const devtoolsUrl = process.env.WARD_URL ?? `http://localhost:${port}`;

  return {
    devtoolsUrl,
    sessionRetention: 100,
    debounceMs: 500,
  };
};

const GENERIC_NAMES = ["next-app", "my-app", "app", "web", "frontend"];
const SYSTEM_DIRS = ["/", "home", "Users", "var", "tmp", "usr"];

export function resolveProjectId(): string | undefined {
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = require(pkgPath) as { name?: string };
    if (pkg.name && !GENERIC_NAMES.includes(pkg.name)) {
      return pkg.name;
    }
  } catch {
    // package.json not found or not readable
  }

  const dirName = path.basename(process.cwd());
  if (
    dirName &&
    !GENERIC_NAMES.includes(dirName) &&
    !SYSTEM_DIRS.includes(dirName)
  ) {
    return dirName;
  }

  return undefined;
}
