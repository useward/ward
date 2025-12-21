import * as Schema from "effect/Schema";
import type { NavigationType } from "./types";

const NavigationTypeSchema = Schema.Literal(
  "initial",
  "navigation",
  "back-forward",
);

const NavigationTimingSchema = Schema.Struct({
  navigationStart: Schema.Number,
  responseStart: Schema.NullOr(Schema.Number),
  domContentLoaded: Schema.NullOr(Schema.Number),
  load: Schema.NullOr(Schema.Number),
  fcp: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null,
  }),
  lcp: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null,
  }),
});

export const NavigationEventSchema = Schema.Struct({
  sessionId: Schema.String,
  projectId: Schema.optionalWith(Schema.String, {
    default: () => "unknown-project",
  }),
  url: Schema.String,
  route: Schema.String,
  navigationType: NavigationTypeSchema,
  previousSessionId: Schema.NullOr(Schema.String),
  timing: NavigationTimingSchema,
});

export interface ParsedNavigationEvent {
  sessionId: string;
  projectId: string;
  url: string;
  route: string;
  navigationType: NavigationType;
  previousSessionId: string | undefined;
  timing: {
    navigationStart: number;
    responseStart: number | undefined;
    domContentLoaded: number | undefined;
    load: number | undefined;
    fcp: number | undefined;
    lcp: number | undefined;
  };
}

export const parseNavigationEvent = (
  data: unknown,
): ParsedNavigationEvent | undefined => {
  const result = Schema.decodeUnknownOption(NavigationEventSchema)(data);
  if (result._tag === "None") {
    return undefined;
  }
  const parsed = result.value;
  return {
    sessionId: parsed.sessionId,
    projectId: parsed.projectId,
    url: parsed.url,
    route: parsed.route,
    navigationType: parsed.navigationType,
    previousSessionId: parsed.previousSessionId ?? undefined,
    timing: {
      navigationStart: parsed.timing.navigationStart,
      responseStart: parsed.timing.responseStart ?? undefined,
      domContentLoaded: parsed.timing.domContentLoaded ?? undefined,
      load: parsed.timing.load ?? undefined,
      fcp: parsed.timing.fcp ?? undefined,
      lcp: parsed.timing.lcp ?? undefined,
    },
  };
};
