const STORAGE_KEY = Symbol.for("nextdoctor.requestContextStorage");
const PROJECT_ID_KEY = Symbol.for("nextdoctor.projectId");

type AsyncLocalStorageType = import("node:async_hooks").AsyncLocalStorage<{
  sessionId?: string;
}>;

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

function getProjectId(): string | undefined {
  const g = globalThis as unknown as Record<symbol, string | undefined>;
  return g[PROJECT_ID_KEY];
}

export function SessionMeta() {
  const sessionId = getSessionId();
  const projectId = getProjectId();

  return (
    <>
      {sessionId && <meta name="nextdoctor-session-id" content={sessionId} />}
      {projectId && <meta name="nextdoctor-project-id" content={projectId} />}
    </>
  );
}
