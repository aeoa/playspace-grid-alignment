import type {
  GridSampleBounds,
  GridState,
  MultiPolygon,
  RasterMask,
  RasterResult,
  Vec2,
} from "./state";
import type { RasterTimings } from "./gridAlignment";

const RASTER_MARGIN_CELLS = 2;
export const RASTER_RESOLUTION = 8;

export function rasterizeRegion(
  region: MultiPolygon | null,
  grid: GridState,
  timings?: RasterTimings,
): RasterResult | null {
  if (!region) {
    return null;
  }

  const t0 = performance.now();
  const cellSize = grid.spacing / RASTER_RESOLUTION;
  const regionGrid = transformRegionToGrid(region, grid);
  const bounds = computeGridBoundsGrid(regionGrid);
  if (!bounds) {
    return null;
  }
  const tBounds = performance.now();

  const minMarginCells = Math.ceil((grid.spacing / 2) / cellSize) + 2;
  const marginCells = Math.max(RASTER_MARGIN_CELLS, minMarginCells);

  const minX = Math.floor(bounds.minX / cellSize) * cellSize - cellSize * marginCells;
  const minY = Math.floor(bounds.minY / cellSize) * cellSize - cellSize * marginCells;
  const maxX = Math.ceil(bounds.maxX / cellSize) * cellSize + cellSize * marginCells;
  const maxY = Math.ceil(bounds.maxY / cellSize) * cellSize + cellSize * marginCells;

  const width = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const height = Math.max(1, Math.ceil((maxY - minY) / cellSize));

  const originGrid = { x: minX, y: minY };
  const data = new Uint8Array(width * height);
  const prefixSum = new Uint32Array((width + 1) * (height + 1));

  const mask: RasterMask = {
    data,
    width,
    height,
    prefixSum,
    cellSize,
    originGrid,
  };

  const tFillStart = performance.now();
  fillMaskWithCanvas(mask, regionGrid);
  const tFill = performance.now();

  buildPrefixSum(mask);
  const tPrefix = performance.now();

  const gridSampleBounds = computeGridSampleBounds(mask, grid.spacing);

  const rasterResult: RasterResult = {
    mask,
    gridSpacing: grid.spacing,
    gridSampleBounds,
    gridCellCount: 0,
    insideCells: new Set(),
  };

  const { insideCells, count } = computeLargestComponent(rasterResult);
  const tComponent = performance.now();
  rasterResult.gridCellCount = count;
  rasterResult.insideCells = insideCells;

  if (timings) {
    timings.boundsMs += tBounds - t0;
    timings.fillMs += tFill - tFillStart;
    timings.prefixMs += tPrefix - tFill;
    timings.componentMs += tComponent - tPrefix;
  }
  return rasterResult;
}

export function sampleRasterAtGridPoint(raster: RasterResult, gridPoint: Vec2): number {
  return erodeGridCell(raster, gridPoint) ? 1 : 0;
}

export function countLargestComponentWithOffset(raster: RasterResult, offsetGrid: Vec2): number {
  const gridSampleBounds = computeGridSampleBoundsWithOffset(
    raster.mask,
    raster.gridSpacing,
    offsetGrid,
  );
  const width = gridSampleBounds.maxX - gridSampleBounds.minX + 1;
  const height = gridSampleBounds.maxY - gridSampleBounds.minY + 1;
  const visited = new Uint8Array(width * height);
  let bestCount = 0;

  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  const idx = (gx: number, gy: number) => (gy - gridSampleBounds.minY) * width + (gx - gridSampleBounds.minX);
  const spacing = raster.gridSpacing;

  for (let gy = gridSampleBounds.minY; gy <= gridSampleBounds.maxY; gy += 1) {
    for (let gx = gridSampleBounds.minX; gx <= gridSampleBounds.maxX; gx += 1) {
      const vIndex = idx(gx, gy);
      if (visited[vIndex]) {
        continue;
      }
      const gridCenter: Vec2 = {
        x: gx * spacing + offsetGrid.x,
        y: gy * spacing + offsetGrid.y,
      };
      if (!erodeGridCell(raster, gridCenter)) {
        visited[vIndex] = 1;
        continue;
      }

      const queue: Vec2[] = [{ x: gx, y: gy }];
      let componentSize = 0;
      visited[vIndex] = 1;

      while (queue.length > 0) {
        const cell = queue.shift()!;
        componentSize += 1;
        for (const dir of directions) {
          const nx = cell.x + dir.x;
          const ny = cell.y + dir.y;
          if (nx < gridSampleBounds.minX || nx > gridSampleBounds.maxX) {
            continue;
          }
          if (ny < gridSampleBounds.minY || ny > gridSampleBounds.maxY) {
            continue;
          }
          const nIndex = idx(nx, ny);
          if (visited[nIndex]) {
            continue;
          }
          const neighborCenter: Vec2 = {
            x: nx * spacing + offsetGrid.x,
            y: ny * spacing + offsetGrid.y,
          };
          if (!erodeGridCell(raster, neighborCenter)) {
            visited[nIndex] = 1;
            continue;
          }
          visited[nIndex] = 1;
          queue.push({ x: nx, y: ny });
        }
      }

      if (componentSize > bestCount) {
        bestCount = componentSize;
      }
    }
  }

  return bestCount;
}

function computeGridSampleBounds(mask: RasterMask, spacing: number): GridSampleBounds {
  const minX = mask.originGrid.x;
  const minY = mask.originGrid.y;
  const maxX = mask.originGrid.x + mask.width * mask.cellSize;
  const maxY = mask.originGrid.y + mask.height * mask.cellSize;
  return {
    minX: Math.floor(minX / spacing),
    maxX: Math.ceil(maxX / spacing),
    minY: Math.floor(minY / spacing),
    maxY: Math.ceil(maxY / spacing),
  };
}

function computeGridSampleBoundsWithOffset(
  mask: RasterMask,
  spacing: number,
  offset: Vec2,
): GridSampleBounds {
  const minX = mask.originGrid.x - offset.x;
  const minY = mask.originGrid.y - offset.y;
  const maxX = mask.originGrid.x + mask.width * mask.cellSize - offset.x;
  const maxY = mask.originGrid.y + mask.height * mask.cellSize - offset.y;
  return {
    minX: Math.floor(minX / spacing),
    maxX: Math.ceil(maxX / spacing),
    minY: Math.floor(minY / spacing),
    maxY: Math.ceil(maxY / spacing),
  };
}

function computeLargestComponent(
  raster: RasterResult,
): { insideCells: Set<string>; count: number } {
  const { gridSampleBounds } = raster;
  const width = gridSampleBounds.maxX - gridSampleBounds.minX + 1;
  const height = gridSampleBounds.maxY - gridSampleBounds.minY + 1;
  const visited = new Uint8Array(width * height);
  let bestCount = 0;
  let bestComponent: Set<string> = new Set();

  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  const encode = (gx: number, gy: number) => `${gx},${gy}`;
  const idx = (gx: number, gy: number) => (gy - gridSampleBounds.minY) * width + (gx - gridSampleBounds.minX);

  for (let gy = gridSampleBounds.minY; gy <= gridSampleBounds.maxY; gy += 1) {
    for (let gx = gridSampleBounds.minX; gx <= gridSampleBounds.maxX; gx += 1) {
      const vIndex = idx(gx, gy);
      if (visited[vIndex]) {
        continue;
      }
      const gridCenter: Vec2 = { x: gx * raster.gridSpacing, y: gy * raster.gridSpacing };
      if (!sampleRasterAtGridPoint(raster, gridCenter)) {
        visited[vIndex] = 1;
        continue;
      }

      const queue: Vec2[] = [{ x: gx, y: gy }];
      const component = new Set<string>();
      visited[vIndex] = 1;
      component.add(encode(gx, gy));

      while (queue.length > 0) {
        const cell = queue.shift()!;
        for (const dir of directions) {
          const nx = cell.x + dir.x;
          const ny = cell.y + dir.y;
          if (nx < gridSampleBounds.minX || nx > gridSampleBounds.maxX) {
            continue;
          }
          if (ny < gridSampleBounds.minY || ny > gridSampleBounds.maxY) {
            continue;
          }
          const nIndex = idx(nx, ny);
          if (visited[nIndex]) {
            continue;
          }
          const neighborCenter: Vec2 = { x: nx * raster.gridSpacing, y: ny * raster.gridSpacing };
          if (!sampleRasterAtGridPoint(raster, neighborCenter)) {
            visited[nIndex] = 1;
            continue;
          }
          visited[nIndex] = 1;
          component.add(encode(nx, ny));
          queue.push({ x: nx, y: ny });
        }
      }

      if (component.size > bestCount) {
        bestCount = component.size;
        bestComponent = component;
      }
    }
  }

  return { insideCells: bestComponent, count: bestCount };
}

/**
 * Checks whether a grid cell centered at gridPoint is completely covered by the rasterized region by
 * testing every raster cell inside the square whose edge length matches the grid spacing. This acts
 * as the erosion stage described in the spec.
 */
function erodeGridCell(raster: RasterResult, gridPoint: Vec2): boolean {
  const { mask, gridSpacing } = raster;
  const halfEdge = gridSpacing / 2;

  const minGX = gridPoint.x - halfEdge;
  const maxGX = gridPoint.x + halfEdge;
  const minGY = gridPoint.y - halfEdge;
  const maxGY = gridPoint.y + halfEdge;

  const eps = 1e-7;
  const startX = Math.floor(((minGX - mask.originGrid.x) / mask.cellSize) + eps);
  const endX = Math.ceil(((maxGX - mask.originGrid.x) / mask.cellSize) - eps) - 1;
  const startY = Math.floor(((minGY - mask.originGrid.y) / mask.cellSize) + eps);
  const endY = Math.ceil(((maxGY - mask.originGrid.y) / mask.cellSize) - eps) - 1;

  if (startX < 0 || startY < 0 || endX >= mask.width || endY >= mask.height) {
    return false;
  }
  if (endX < startX || endY < startY) {
    return false;
  }

  const ps = mask.prefixSum;
  const stride = mask.width + 1;
  const x0 = startX;
  const x1 = endX + 1;
  const y0 = startY;
  const y1 = endY + 1;
  const area =
    ps[y1 * stride + x1] - ps[y0 * stride + x1] - ps[y1 * stride + x0] + ps[y0 * stride + x0];
  const expectedArea = (endX - startX + 1) * (endY - startY + 1);
  return area === expectedArea;
}

function computeGridBoundsGrid(region: MultiPolygon) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  region.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function buildPrefixSum(mask: RasterMask) {
  const { width, height, data, prefixSum } = mask;
  const stride = width + 1;
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += data[y * width + x];
      const idx = (y + 1) * stride + (x + 1);
      prefixSum[idx] = prefixSum[idx - stride] + rowSum;
    }
  }
}

function transformRegionToGrid(region: MultiPolygon, grid: GridState): MultiPolygon {
  const sin = Math.sin(-grid.angle);
  const cos = Math.cos(-grid.angle);
  const ox = grid.origin.x;
  const oy = grid.origin.y;
  return region.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, y]) => {
        const tx = x - ox;
        const ty = y - oy;
        const gx = tx * cos - ty * sin;
        const gy = tx * sin + ty * cos;
        return [gx, gy];
      }),
    ),
  );
}

function fillMaskWithCanvas(mask: RasterMask, regionGrid: MultiPolygon) {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2d context for rasterization");
  }
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  const scale = 1 / mask.cellSize;
  const offsetX = -mask.originGrid.x * scale;
  const offsetY = -mask.originGrid.y * scale;

  regionGrid.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(([x, y], idx) => {
        const px = x * scale + offsetX;
        const py = y * scale + offsetY;
        if (idx === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.closePath();
    });
  });
  ctx.fill("evenodd");

  const imageData = ctx.getImageData(0, 0, mask.width, mask.height).data;
  const data = mask.data;
  const stride = mask.width * 4;
  let di = 0;
  for (let y = 0; y < mask.height; y += 1) {
    let si = y * stride + 3; // alpha channel
    for (let x = 0; x < mask.width; x += 1) {
      data[di] = imageData[si] === 255 ? 1 : 0;
      di += 1;
      si += 4;
    }
  }
}

// TODO: Future version will align the grid origin with geometric features for better sampling.
