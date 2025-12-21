import { Array as A, Option as O, pipe } from "effect";
import type { Resource } from "../../types";

/**
 * A chain of resources that execute sequentially when they could be parallel.
 */
export interface WaterfallChain {
  /** Resources in the chain, ordered by start time */
  readonly resources: readonly Resource[];

  /** Total duration of the chain */
  readonly totalDuration: number;

  /** Time wasted due to sequential execution (could be saved with parallelization) */
  readonly wastedTime: number;

  /** Depth of the waterfall (number of sequential steps) */
  readonly depth: number;
}

export interface WaterfallOptions {
  /** Minimum gap (ms) between resources to consider them sequential. Default: 5 */
  readonly minGapMs?: number;

  /** Minimum chain length to report. Default: 2 */
  readonly minChainLength?: number;

  /** Minimum wasted time (ms) to report. Default: 50 */
  readonly minWastedMs?: number;
}

const DEFAULT_OPTIONS: Required<WaterfallOptions> = {
  minGapMs: 5,
  minChainLength: 2,
  minWastedMs: 50,
};

/**
 * Detect sequential resource chains where parallelization is possible.
 * Looks for resources that start after the previous one ends (sequential pattern).
 *
 * @param resources Resources to analyze
 * @param options Detection options
 * @returns Detected waterfall chains
 */
export const detectWaterfalls = (
  resources: readonly Resource[],
  options?: WaterfallOptions,
): readonly WaterfallChain[] => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Sort by start time
  const sorted = pipe(
    resources,
    A.sort((a: Resource, b: Resource) => (a.startTime < b.startTime ? -1 : 1)),
  );

  if (sorted.length < opts.minChainLength) return [];

  const chains: WaterfallChain[] = [];
  let currentChain: Resource[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const resource = sorted[i];
    if (!resource) continue;

    if (currentChain.length === 0) {
      currentChain.push(resource);
      continue;
    }

    const lastInChain = currentChain[currentChain.length - 1];
    if (!lastInChain) continue;

    // Check if this resource starts after the previous ends (sequential)
    const gap = resource.startTime - lastInChain.endTime;

    if (gap >= -opts.minGapMs && gap <= 100) {
      // Sequential: starts around when previous ends
      currentChain.push(resource);
    } else if (resource.startTime < lastInChain.endTime - opts.minGapMs) {
      // Overlapping (parallel) - end current chain and start new
      if (currentChain.length >= opts.minChainLength) {
        const chain = buildChain(currentChain);
        if (chain.wastedTime >= opts.minWastedMs) {
          chains.push(chain);
        }
      }
      currentChain = [resource];
    } else {
      // Large gap - end current chain and start new
      if (currentChain.length >= opts.minChainLength) {
        const chain = buildChain(currentChain);
        if (chain.wastedTime >= opts.minWastedMs) {
          chains.push(chain);
        }
      }
      currentChain = [resource];
    }
  }

  // Don't forget the last chain
  if (currentChain.length >= opts.minChainLength) {
    const chain = buildChain(currentChain);
    if (chain.wastedTime >= opts.minWastedMs) {
      chains.push(chain);
    }
  }

  return pipe(
    chains,
    A.sort((a: WaterfallChain, b: WaterfallChain) =>
      a.wastedTime > b.wastedTime ? -1 : 1,
    ),
  );
};

/**
 * Build a WaterfallChain from a list of sequential resources.
 */
const buildChain = (resources: readonly Resource[]): WaterfallChain => {
  const totalDuration = pipe(
    resources,
    A.reduce(0, (acc, r) => acc + r.duration),
  );

  // Wasted time = total sequential time - longest single resource
  // (if parallel, would only take as long as the longest)
  const longestDuration = pipe(
    resources,
    A.map((r) => r.duration),
    A.reduce(0, Math.max),
  );

  return {
    resources,
    totalDuration,
    wastedTime: totalDuration - longestDuration,
    depth: resources.length,
  };
};

/**
 * Detect parent-child waterfall pattern.
 * Finds cases where a parent resource blocks all its children.
 *
 * @param rootResources Root resources with children
 * @returns The most impactful waterfall chain, or null
 */
export const detectParentChildWaterfall = (
  rootResources: readonly Resource[],
): WaterfallChain | null => {
  const chains: WaterfallChain[] = [];

  const traverse = (resource: Resource, depth: number): void => {
    // Check if this resource blocks its children
    if (resource.children.length > 0) {
      const childrenStartAfterParent = resource.children.filter(
        (child) => child.startTime >= resource.endTime - 10, // Small tolerance
      );

      if (childrenStartAfterParent.length > 0) {
        // This is a blocking parent
        const blockedChildren = childrenStartAfterParent;
        const longestChild = pipe(
          blockedChildren,
          A.reduce(null as Resource | null, (acc, r) =>
            !acc || r.duration > acc.duration ? r : acc,
          ),
        );

        if (longestChild) {
          const wastedTime = Math.min(resource.duration, longestChild.duration);

          chains.push({
            resources: [resource, longestChild],
            totalDuration: resource.duration + longestChild.duration,
            wastedTime,
            depth: 2,
          });
        }
      }
    }

    // Recurse into children
    for (const child of resource.children) {
      traverse(child, depth + 1);
    }
  };

  for (const root of rootResources) {
    traverse(root, 0);
  }

  // Return the most impactful waterfall
  return pipe(
    chains,
    A.sort((a: WaterfallChain, b: WaterfallChain) =>
      a.wastedTime > b.wastedTime ? -1 : 1,
    ),
    A.head,
    O.getOrNull,
  );
};

/**
 * Detect sequential resources from the same initiator file.
 * Finds cases where the same file makes multiple sequential fetches.
 *
 * @param resources Resources to analyze
 * @returns Waterfall chains grouped by initiator
 */
export const detectSequentialByInitiator = (
  resources: readonly Resource[],
): readonly WaterfallChain[] => {
  // Group resources by initiator
  const byInitiator = pipe(
    resources,
    A.filter((r) => r.initiator !== undefined),
    A.groupBy((r) => r.initiator ?? "unknown"),
  );

  const chains: WaterfallChain[] = [];

  for (const [_initiator, group] of Object.entries(byInitiator)) {
    if (group.length < 2) continue;

    // Detect waterfalls within this initiator group
    const waterfalls = detectWaterfalls(group, {
      minChainLength: 2,
      minWastedMs: 30,
    });

    chains.push(...waterfalls);
  }

  return pipe(
    chains,
    A.sort((a: WaterfallChain, b: WaterfallChain) =>
      a.wastedTime > b.wastedTime ? -1 : 1,
    ),
  );
};

/**
 * Calculate potential time savings if waterfalls were parallelized.
 */
export const calculatePotentialSavings = (
  chains: readonly WaterfallChain[],
): number =>
  pipe(
    chains,
    A.map((c) => c.wastedTime),
    A.reduce(0, (acc, ms) => acc + ms),
  );
