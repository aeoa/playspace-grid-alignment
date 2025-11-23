import { rotate } from "./geometry";
import { RASTER_RESOLUTION, countLargestComponentWithOffset, rasterizeRegion } from "./raster";
import type { GridState, MultiPolygon, Vec2 } from "./state";

const ROTATION_STEP_DEGREES = 5;
const YIELD_INTERVAL = 10;

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
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

function yieldToMainThread() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Brute-force search for a grid rotation and origin offset that keeps the largest connected set of
 * grid cells inside the polygon. The search samples rotations between 0° and 90° (because of grid
 * symmetry) and offsets within a single grid cell at the raster resolution.
 */
export function findBestGridAlignment(
  region: MultiPolygon | null,
  grid: GridState,
): GridAlignmentResult | null {
  return findBestGridAlignmentSync(region, grid);
}

function findBestGridAlignmentSync(
  region: MultiPolygon | null,
  grid: GridState,
  signal?: AbortSignal,
): GridAlignmentResult | null {
  if (!region) {
    return null;
  }

  const rotationStep = (Math.PI / 180) * ROTATION_STEP_DEGREES;
  const offsetStep = grid.spacing / RASTER_RESOLUTION;
  let best: GridAlignmentResult | null = null;

  for (let angle = 0; angle <= Math.PI / 2 + 1e-6; angle += rotationStep) {
    throwIfAborted(signal);
    const baseGrid: GridState = {
      origin: { ...grid.origin },
      angle,
      spacing: grid.spacing,
    };
    const baseRaster = rasterizeRegion(region, baseGrid);
    if (!baseRaster) {
      continue;
    }
    for (let oy = 0; oy < RASTER_RESOLUTION; oy += 1) {
      for (let ox = 0; ox < RASTER_RESOLUTION; ox += 1) {
        throwIfAborted(signal);
        const offsetGrid: Vec2 = { x: ox * offsetStep, y: oy * offsetStep };
        const count = countLargestComponentWithOffset(baseRaster, offsetGrid);
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
      }
    }
  }

  return best;
}

export async function findBestGridAlignmentAsync(
  region: MultiPolygon | null,
  grid: GridState,
  options: { signal?: AbortSignal; onProfile?: (stats: GridAlignmentStats) => void } = {},
): Promise<GridAlignmentResult | null> {
  const { signal, onProfile } = options;
  let samples = 0;

  const maybeYield = async () => {
    samples += 1;
    if (samples % YIELD_INTERVAL === 0) {
      await yieldToMainThread();
      throwIfAborted(signal);
    }
  };

  const rotationStep = (Math.PI / 180) * ROTATION_STEP_DEGREES;
  const offsetStep = grid.spacing / RASTER_RESOLUTION;
  let best: GridAlignmentResult | null = null;
  let orientations = 0;
  const offsetsPerOrientation = RASTER_RESOLUTION * RASTER_RESOLUTION;
  const start = performance.now();

  if (!region) {
    return null;
  }

  for (let angle = 0; angle <= Math.PI / 2 + 1e-6; angle += rotationStep) {
    throwIfAborted(signal);
    const baseGrid: GridState = {
      origin: { ...grid.origin },
      angle,
      spacing: grid.spacing,
    };
    const baseRaster = rasterizeRegion(region, baseGrid);
    if (!baseRaster) {
      continue;
    }
    orientations += 1;
    for (let oy = 0; oy < RASTER_RESOLUTION; oy += 1) {
      for (let ox = 0; ox < RASTER_RESOLUTION; ox += 1) {
        throwIfAborted(signal);
        const offsetGrid: Vec2 = { x: ox * offsetStep, y: oy * offsetStep };
        const count = countLargestComponentWithOffset(baseRaster, offsetGrid);
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
    });
  }

  return best;
}
