import { rotate } from "./geometry";
import { RASTER_RESOLUTION, countLargestComponentWithOffset, rasterizeRegion } from "./raster";
import type { GridState, MultiPolygon, Vec2 } from "./state";

const ROTATION_STEP_DEGREES = 5;
const YIELD_BUDGET_MS = 12;

export interface GridAlignmentResult {
  angle: number;
  origin: Vec2;
  cellCount: number;
}

export interface GridAlignmentStats {
  durationMs: number;
  orientations: number;
  offsetsPerOrientation: number;
  samples: number;
  timings: {
    anglePrepMs: number;
    rasterMs: number;
    offsetsMs: number;
    rasterDetail?: RasterTimings;
  };
}

export type RasterTimings = {
  boundsMs: number;
  fillMs: number;
  prefixMs: number;
  componentMs: number;
};

const ANGLE_BIN_RESOLUTION = 1; // degrees

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

function yieldToMainThread() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export async function findBestGridAlignmentAsync(
  region: MultiPolygon | null,
  grid: GridState,
  options: { signal?: AbortSignal; onProfile?: (stats: GridAlignmentStats) => void } = {},
): Promise<GridAlignmentResult | null> {
  const { signal, onProfile } = options;
  let samples = 0;

  let lastYieldTime = performance.now();
  const maybeYield = async () => {
    samples += 1;
    const now = performance.now();
    if (now - lastYieldTime >= YIELD_BUDGET_MS) {
      await yieldToMainThread();
      throwIfAborted(signal);
      lastYieldTime = performance.now();
    }
  };

  const anglePrepStart = performance.now();
  const candidateAngles = buildCandidateAngles(region);
  const anglePrepMs = performance.now() - anglePrepStart;
  const offsetStep = grid.spacing / RASTER_RESOLUTION;
  let best: GridAlignmentResult | null = null;
  let orientations = 0;
  const offsetsPerOrientation = RASTER_RESOLUTION * RASTER_RESOLUTION;
  const start = performance.now();
  let rasterMs = 0;
  let offsetsMs = 0;
  const rasterDetail = { boundsMs: 0, fillMs: 0, prefixMs: 0, componentMs: 0 };

  if (!region) {
    return null;
  }

  for (const angle of candidateAngles) {
    throwIfAborted(signal);
    const rasterStart = performance.now();
    const baseGrid: GridState = {
      origin: { ...grid.origin },
      angle,
      spacing: grid.spacing,
    };
    const baseRaster = rasterizeRegion(region, baseGrid, rasterDetail);
    rasterMs += performance.now() - rasterStart;
    if (!baseRaster) {
      continue;
    }
    orientations += 1;
    for (let oy = 0; oy < RASTER_RESOLUTION; oy += 1) {
      for (let ox = 0; ox < RASTER_RESOLUTION; ox += 1) {
        throwIfAborted(signal);
        const offsetStart = performance.now();
        const offsetGrid: Vec2 = { x: ox * offsetStep, y: oy * offsetStep };
        const count = countLargestComponentWithOffset(baseRaster, offsetGrid);
        offsetsMs += performance.now() - offsetStart;
        if (!best || count > best.cellCount) {
          const offsetWorld = rotate(offsetGrid, angle);
          const originWorld: Vec2 = {
            x: grid.origin.x + offsetWorld.x,
            y: grid.origin.y + offsetWorld.y,
          };
          best = {
            angle,
            origin: originWorld,
            cellCount: count,
          };
        }
        await maybeYield();
      }
    }
  }

  if (onProfile) {
    const durationMs = performance.now() - start;
    onProfile({
      durationMs,
      orientations,
      offsetsPerOrientation,
      samples,
      timings: {
        anglePrepMs,
        rasterMs,
        offsetsMs,
        rasterDetail,
      },
    });
  }

  return best;
}

function buildCandidateAngles(region: MultiPolygon | null): number[] {
  const coarseStep = ROTATION_STEP_DEGREES;

  if (!region) {
    return [0];
  }

  const bins = computeEdgeHistogram(region);
  const occupied = Array.from(bins.entries())
    .filter(([, value]) => value)
    .map(([deg]) => deg)
    .sort((a, b) => a - b);

  if (!occupied.length) {
    return [0];
  }

  const filled = new Set<number>();
  const addSegment = (start: number, end: number) => {
    const span = end - start;
    const maxStep = coarseStep;
    const needed = Math.max(1, Math.ceil(span / maxStep));
    const actualStep = span / needed;
    for (let i = 0; i <= needed; i += 1) {
      filled.add(start + actualStep * i);
    }
  };

  for (let i = 0; i < occupied.length; i += 1) {
    const current = occupied[i];
    const next = i === occupied.length - 1 ? occupied[0] + 90 : occupied[i + 1];
    addSegment(current, next);
  }

  const normalized = Array.from(filled).map((deg) => ((deg % 90) + 90) % 90);
  const unique = Array.from(new Set(normalized)).sort((a, b) => a - b);
  return unique.map((deg) => toRad(deg));
}

function computeEdgeHistogram(region: MultiPolygon): Map<number, boolean> {
  const bins = new Map<number, boolean>();
  const binSize = ANGLE_BIN_RESOLUTION;

  const addAngle = (angleRad: number) => {
    let deg = ((toDeg(angleRad) % 90) + 90) % 90;
    deg = Math.min(89.9999, deg);
    const bin = Math.floor(deg / binSize) * binSize;
    bins.set(bin, true);
  };

  region.forEach((polygon) => {
    polygon.forEach((ring) => {
      for (let i = 0; i < ring.length; i += 1) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
          continue;
        }
        const angle = Math.atan2(dy, dx);
        addAngle(angle);
      }
    });
  });

  return bins;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
