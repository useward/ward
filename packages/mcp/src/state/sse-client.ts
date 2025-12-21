import {
  extractSpansFromPayload,
  type NavigationEvent,
  type OTLPExportTraceServiceRequest,
  parseNavigationEvent,
  type RawSpan,
  type SpanOrigin,
} from "@ward/domain";
import { EventSource } from "eventsource";

export interface TelemetryEvent {
  readonly origin: SpanOrigin;
  readonly spans: ReadonlyArray<RawSpan>;
}

export interface SSEClientOptions {
  readonly url: string;
  readonly onTelemetry: (event: TelemetryEvent) => void;
  readonly onNavigation: (event: NavigationEvent) => void;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onError: (error: Error) => void;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor(private options: SSEClientOptions) {}

  connect(): void {
    const streamUrl = `${this.options.url}/v1/telemetry-stream`;

    try {
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        this.options.onConnect();
      };

      this.eventSource.onerror = (_error: Event) => {
        this.options.onDisconnect();

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * 2 ** (this.reconnectAttempts - 1);
          setTimeout(() => this.connect(), delay);
        } else {
          this.options.onError(
            new Error(
              `Failed to connect to Ward DevTools at ${this.options.url} after ${this.maxReconnectAttempts} attempts`,
            ),
          );
        }
      };

      this.eventSource.addEventListener(
        "client-traces",
        (event: MessageEvent) => {
          this.handleTraceEvent(event.data, "client");
        },
      );

      this.eventSource.addEventListener(
        "server-traces",
        (event: MessageEvent) => {
          this.handleTraceEvent(event.data, "server");
        },
      );

      this.eventSource.addEventListener(
        "navigation-event",
        (event: MessageEvent) => {
          this.handleNavigationEvent(event.data);
        },
      );
    } catch (error) {
      this.options.onError(
        new Error(
          `Failed to connect to Ward DevTools at ${this.options.url}: ${error}`,
        ),
      );
    }
  }

  private handleTraceEvent(data: string, origin: SpanOrigin): void {
    try {
      const payload: OTLPExportTraceServiceRequest = JSON.parse(data);
      const spans = extractSpansFromPayload(payload, origin);
      if (spans.length > 0) {
        this.options.onTelemetry({ origin, spans });
      }
    } catch {
      // Ignore parse errors
    }
  }

  private handleNavigationEvent(data: string): void {
    try {
      const parsed = JSON.parse(data);
      const event = parseNavigationEvent(parsed);
      if (event) {
        this.options.onNavigation(event);
      }
    } catch {
      // Ignore parse errors
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}
