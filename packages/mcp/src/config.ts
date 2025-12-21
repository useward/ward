import { SERVER_PORT } from "@nextdoctor/shared";

export interface McpConfig {
  readonly devtoolsUrl: string;
  readonly sessionRetention: number;
  readonly debounceMs: number;
}

export const loadConfig = (): McpConfig => {
  const port = process.env.NEXTDOCTOR_PORT ?? SERVER_PORT;
  const devtoolsUrl = process.env.NEXTDOCTOR_URL ?? `http://localhost:${port}`;

  return {
    devtoolsUrl,
    sessionRetention: 100,
    debounceMs: 500,
  };
};
