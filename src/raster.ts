import { gridToWorld, worldToGrid } from "./geometry";
import type {
  GridSampleBounds,
  GridState,
  MultiPolygon,
  RasterMask,
  RasterResult,
  Vec2,
} from "./state";

const RASTER_MARGIN_CELLS = 2;
export const RASTER_RESOLUTION = 10;

export function rasterizeRegion(region: MultiPolygon | null, grid: GridState): RasterResult | null {
  if (!region) {
    return null;
  }

  const cellSize = grid.spacing / RASTER_RESOLUTION;
  const bounds = computeGridBounds(region, grid);
  if (!bounds) {
    return null;
  }

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

  const mask: RasterMask = {
    data,
    width,
    height,
    cellSize,
    originGrid,
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const baseGridX = originGrid.x + x * cellSize;
      const baseGridY = originGrid.y + y * cellSize;
      const cornersGrid: Vec2[] = [
        { x: baseGridX, y: baseGridY },
        { x: baseGridX + cellSize, y: baseGridY },
        { x: baseGridX + cellSize, y: baseGridY + cellSize },
        { x: baseGridX, y: baseGridY + cellSize },
      ];
      const fullyInside = cornersGrid.every((corner) =>
        pointInMultiPolygon(gridToWorld(corner, grid), region),
      );
      if (fullyInside) {
        data[y * width + x] = 1;
      }
    }
  }

  const gridSampleBounds = computeGridSampleBounds(mask, grid.spacing);

  const rasterResult: RasterResult = {
    mask,
    gridSpacing: grid.spacing,
    gridSampleBounds,
    gridCellCount: 0,
    insideCells: new Set(),
  };

  const { insideCells, count } = computeLargestComponent(rasterResult);
  rasterResult.gridCellCount = count;
  rasterResult.insideCells = insideCells;
  return rasterResult;
}

export function sampleRasterAtGridPoint(raster: RasterResult, gridPoint: Vec2): number {
  return erodeGridCell(raster, gridPoint) ? 1 : 0;
}

export function countLargestComponentWithOffset(raster: RasterResult, offsetGrid: Vec2): number {
  const visited = new Set<string>();
  let bestCount = 0;

  const gridSampleBounds = computeGridSampleBoundsWithOffset(
    raster.mask,
    raster.gridSpacing,
    offsetGrid,
  );
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  const encode = (gx: number, gy: number) => `${gx},${gy}`;
  const spacing = raster.gridSpacing;

  for (let gy = gridSampleBounds.minY; gy <= gridSampleBounds.maxY; gy += 1) {
    for (let gx = gridSampleBounds.minX; gx <= gridSampleBounds.maxX; gx += 1) {
      const key = encode(gx, gy);
      if (visited.has(key)) {
        continue;
      }
      const gridCenter: Vec2 = {
        x: gx * spacing + offsetGrid.x,
        y: gy * spacing + offsetGrid.y,
      };
      if (!erodeGridCell(raster, gridCenter)) {
        visited.add(key);
        continue;
      }

      const queue: Vec2[] = [{ x: gx, y: gy }];
      let componentSize = 0;
      visited.add(key);

      while (queue.length > 0) {
        const cell = queue.shift()!;
        componentSize += 1;
        for (const dir of directions) {
          const nx = cell.x + dir.x;
          const ny = cell.y + dir.y;
          const nkey = encode(nx, ny);
          if (nx < gridSampleBounds.minX || nx > gridSampleBounds.maxX) {
            continue;
          }
          if (ny < gridSampleBounds.minY || ny > gridSampleBounds.maxY) {
            continue;
          }
          if (visited.has(nkey)) {
            continue;
          }
          const neighborCenter: Vec2 = {
            x: nx * spacing + offsetGrid.x,
            y: ny * spacing + offsetGrid.y,
          };
          if (!erodeGridCell(raster, neighborCenter)) {
            visited.add(nkey);
            continue;
          }
          visited.add(nkey);
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
    minX: Math.floor(minX / spacing) - 1,
    maxX: Math.ceil(maxX / spacing) + 1,
    minY: Math.floor(minY / spacing) - 1,
    maxY: Math.ceil(maxY / spacing) + 1,
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
    minX: Math.floor(minX / spacing) - 1,
    maxX: Math.ceil(maxX / spacing) + 1,
    minY: Math.floor(minY / spacing) - 1,
    maxY: Math.ceil(maxY / spacing) + 1,
  };
}

function computeLargestComponent(
  raster: RasterResult,
): { insideCells: Set<string>; count: number } {
  const visited = new Set<string>();
  let bestComponent: Set<string> = new Set();

  const { gridSampleBounds } = raster;
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  const encode = (gx: number, gy: number) => `${gx},${gy}`;

  for (let gy = gridSampleBounds.minY; gy <= gridSampleBounds.maxY; gy += 1) {
    for (let gx = gridSampleBounds.minX; gx <= gridSampleBounds.maxX; gx += 1) {
      const key = encode(gx, gy);
      if (visited.has(key)) {
        continue;
      }
      const gridCenter: Vec2 = { x: gx * raster.gridSpacing, y: gy * raster.gridSpacing };
      if (!sampleRasterAtGridPoint(raster, gridCenter)) {
        visited.add(key);
        continue;
      }

      const queue: Vec2[] = [{ x: gx, y: gy }];
      const component = new Set<string>();
      visited.add(key);
      component.add(key);

      while (queue.length > 0) {
        const cell = queue.shift()!;
        for (const dir of directions) {
          const nx = cell.x + dir.x;
          const ny = cell.y + dir.y;
          const nkey = encode(nx, ny);
          if (nx < gridSampleBounds.minX || nx > gridSampleBounds.maxX) {
            continue;
          }
          if (ny < gridSampleBounds.minY || ny > gridSampleBounds.maxY) {
            continue;
          }
          if (visited.has(nkey)) {
            continue;
          }
          const neighborCenter: Vec2 = { x: nx * raster.gridSpacing, y: ny * raster.gridSpacing };
          if (!sampleRasterAtGridPoint(raster, neighborCenter)) {
            visited.add(nkey);
            continue;
          }
          visited.add(nkey);
          component.add(nkey);
          queue.push({ x: nx, y: ny });
        }
      }

      if (component.size > bestComponent.size) {
        bestComponent = component;
      }
    }
  }

  return { insideCells: bestComponent, count: bestComponent.size };
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

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      if (mask.data[y * mask.width + x] === 0) {
        return false;
      }
    }
  }
  return true;
}

function computeGridBounds(region: MultiPolygon, grid: GridState) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  region.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(([x, y]) => {
        const gridPt = worldToGrid({ x, y }, grid);
        minX = Math.min(minX, gridPt.x);
        minY = Math.min(minY, gridPt.y);
        maxX = Math.max(maxX, gridPt.x);
        maxY = Math.max(maxY, gridPt.y);
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function pointInMultiPolygon(point: Vec2, region: MultiPolygon): boolean {
  for (const polygon of region) {
    if (pointInPolygon(point, polygon)) {
      return true;
    }
  }
  return false;
}

function pointInPolygon(point: Vec2, polygon: MultiPolygon[number]): boolean {
  if (!polygon.length) {
    return false;
  }
  if (!pointInRing(point, polygon[0])) {
    return false;
  }
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(point, polygon[i])) {
      return false;
    }
  }
  return true;
}

function pointInRing(point: Vec2, ring: MultiPolygon[number][number]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

// TODO: Future version will align the grid origin with geometric features for better sampling.
