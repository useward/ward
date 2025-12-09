import type { Instrumentation } from "./base-instrumentation.js";

export class InstrumentationManager implements Instrumentation {
  private readonly instrumentations: Instrumentation[] = [];

  register(instrumentations: Instrumentation | Instrumentation[]): void {
    this.instrumentations.push(
      ...(Array.isArray(instrumentations)
        ? instrumentations
        : [instrumentations]),
    );
  }

  enable(): void {
    for (const instrumentation of this.instrumentations) {
      instrumentation.enable();
    }
  }

  disable(): void {
    for (const instrumentation of this.instrumentations) {
      instrumentation.disable();
    }
  }

  get count(): number {
    return this.instrumentations.length;
  }
}
