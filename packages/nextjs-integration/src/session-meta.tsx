const STORAGE_KEY = Symbol.for("nextdoctor.requestContextStorage");

type AsyncLocalStorageType = import("node:async_hooks").AsyncLocalStorage<{ sessionId?: string }>;

function getSessionId(): string | undefined {
  const g = globalThis as unknown as {
    AsyncLocalStorage?: typeof import("node:async_hooks").AsyncLocalStorage;
    [key: symbol]: AsyncLocalStorageType | undefined;
  };

  if (!g.AsyncLocalStorage) {
    return undefined;
  }

  const storage = g[STORAGE_KEY];
  return storage?.getStore()?.sessionId;
}

export function SessionMeta() {
  const sessionId = getSessionId();

  if (!sessionId) {
    return null;
  }

  return <meta name="nextdoctor-session-id" content={sessionId} />;
}
