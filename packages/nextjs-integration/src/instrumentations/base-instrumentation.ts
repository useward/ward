import { diag, trace } from "@opentelemetry/api";

export interface Instrumentation {
  enable(): void;
  disable(): void;
}

export interface InstrumentationConfig {
  debug?: boolean;
  instrumentationName: string;
  instrumentationVersion: string;
}

export abstract class BaseInstrumentation implements Instrumentation {
  protected readonly config: Required<InstrumentationConfig>;
  protected readonly tracer: ReturnType<typeof trace.getTracer>;
  protected isEnabled = false;

  constructor(config: InstrumentationConfig) {
    this.config = {
      debug: config.debug ?? false,
      instrumentationName: config.instrumentationName,
      instrumentationVersion: config.instrumentationVersion,
    };

    this.tracer = trace.getTracer(
      this.config.instrumentationName,
      this.config.instrumentationVersion,
    );
  }

  enable(): void {
    if (this.isEnabled) {
      this.log("Instrumentation already enabled, skipping");
      return;
    }

    if (!this.isNodeEnvironment()) {
      this.log("Skipping instrumentation: not in Node.js environment");
      return;
    }

    this.patch();
    this.isEnabled = true;
  }

  disable(): void {
    if (!this.isEnabled) {
      this.log("Instrumentation not enabled, skipping disable");
      return;
    }

    this.unpatch();
    this.isEnabled = false;
  }

  protected abstract patch(): void;

  protected abstract unpatch(): void;

  protected isNodeEnvironment(): boolean {
    return (
      typeof require !== "undefined" && typeof require.resolve !== "undefined"
    );
  }

  protected ensureError(err: unknown): Error {
    if (err instanceof Error) {
      return err;
    }

    if (typeof err === "string") {
      return new Error(err);
    }

    return new Error("Unknown error occurred");
  }

  protected log(message: string): void {
    if (this.config.debug) {
      diag.debug(`[${this.config.instrumentationName}] ${message}`);
    }
  }

  protected logError(message: string, err: unknown): void {
    const error = this.ensureError(err);
    diag.warn(`[${this.config.instrumentationName}] ${message}:`, error);
  }
}
