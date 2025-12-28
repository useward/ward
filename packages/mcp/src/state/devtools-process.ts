import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const HEALTH_TIMEOUT_MS = 1000;
const MAX_WAIT_ATTEMPTS = 50;
const WAIT_INTERVAL_MS = 100;

async function isDevToolsRunning(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    const response = await fetch(`${url}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return false;

    const data = (await response.json()) as { service?: string };
    return data.service === "ward-collector";
  } catch {
    return false;
  }
}

async function waitForDevTools(url: string): Promise<boolean> {
  for (let i = 0; i < MAX_WAIT_ATTEMPTS; i++) {
    if (await isDevToolsRunning(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  return false;
}

type SpawnConfig = {
  command: string;
  args: string[];
};

function getSpawnConfig(): SpawnConfig {
  try {
    const bin = require.resolve("@useward/devtools");
    return { command: "node", args: [bin] };
  } catch {
    return { command: "npx", args: ["@useward/devtools"] };
  }
}

export interface DevToolsHandle {
  process: ChildProcess | null;
  isOwner: boolean;
  stop(): void;
}

export async function ensureDevTools(url: string): Promise<DevToolsHandle> {
  if (await isDevToolsRunning(url)) {
    return { process: null, isOwner: false, stop: () => {} };
  }

  const { command, args } = getSpawnConfig();
  const child = spawn(command, args, {
    stdio: "ignore",
    detached: false,
  });

  child.unref();

  const ready = await waitForDevTools(url);
  if (!ready) {
    child.kill();
    throw new Error(`DevTools failed to start on ${url}`);
  }

  const stop = () => {
    if (!child.killed) {
      child.kill();
    }
  };

  return { process: child, isOwner: true, stop };
}
