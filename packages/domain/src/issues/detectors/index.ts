import type { IssueDetector } from "../types";
import { cacheFetchNoConfigDetector } from "./cache-fetch-no-config";
import { nPlusOneDetector } from "./n-plus-one";
import { rscWaterfallParentChildDetector } from "./rsc-waterfall-parent-child";
import { rscWaterfallSequentialDetector } from "./rsc-waterfall-sequential";

export { cacheFetchNoConfigDetector } from "./cache-fetch-no-config";
export { nPlusOneDetector } from "./n-plus-one";
export { rscWaterfallParentChildDetector } from "./rsc-waterfall-parent-child";
export { rscWaterfallSequentialDetector } from "./rsc-waterfall-sequential";

/**
 * All available issue detectors.
 * Add new detectors here to include them in default detection.
 */
export const ALL_DETECTORS: readonly IssueDetector[] = [
  rscWaterfallParentChildDetector,
  rscWaterfallSequentialDetector,
  nPlusOneDetector,
  cacheFetchNoConfigDetector,
];

/**
 * Detectors focused on waterfall/sequential issues.
 */
export const WATERFALL_DETECTORS: readonly IssueDetector[] = [
  rscWaterfallParentChildDetector,
  rscWaterfallSequentialDetector,
];

/**
 * Detectors focused on caching issues.
 */
export const CACHING_DETECTORS: readonly IssueDetector[] = [
  cacheFetchNoConfigDetector,
];

/**
 * Detectors focused on data fetching patterns.
 */
export const DATA_FETCHING_DETECTORS: readonly IssueDetector[] = [
  nPlusOneDetector,
];
