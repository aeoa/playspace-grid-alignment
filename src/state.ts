export type Vec2 = {
  x: number;
  y: number;
};

export type ClipRing = [number, number][];
export type ClipPolygon = ClipRing[];
export type MultiPolygon = ClipPolygon[];

export interface GridState {
  /** Origin of the rotated grid in world space */
  origin: Vec2;
  /** Rotation in radians, counter-clockwise */
  angle: number;
  /** Grid spacing measured in world units */
  spacing: number;
}

export interface CameraState {
  /** Translation applied in screen pixels after zoom */
  offset: Vec2;
  /** Scalar applied to world positions to get screen space */
  zoom: number;
}

export type PolygonBooleanMode = "add" | "subtract";
export type PolygonMode = PolygonBooleanMode | null;

export type GridGizmoHandle = "origin" | "axis";
export type GridGizmoHover = GridGizmoHandle | null;

export type InteractionMode =
  | "idle"
  | "drawing_polygon"
  | "dragging_grid_origin"
  | "rotating_grid";

export interface RasterMask {
  data: Uint8Array;
  width: number;
  height: number;
  /** Summed area table over `data`, flattened row-major with (width + 1) stride. */
  prefixSum: Uint32Array;
  /**
   * Size of a raster cell measured in grid units (currently spacing / 10 for a finer raster).
   */
  cellSize: number;
  /**
   * Grid coordinates of the lower-left corner of cell (0, 0). Converting from raster to grid requires
   * originGrid + (index + 0.5) * cellSize to reach the cell center.
   */
  originGrid: Vec2;
}

export interface GridSampleBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface RasterResult {
  mask: RasterMask;
  gridSpacing: number;
  gridSampleBounds: GridSampleBounds;
  gridCellCount: number;
  insideCells: Set<string>;
}

export interface AppState {
  region: MultiPolygon | null;
  drawingPolygon: Vec2[];
  drawingCursorWorld: Vec2 | null;
  polygonMode: PolygonMode;
  interactionMode: InteractionMode;
  grid: GridState;
  camera: CameraState;
  raster: RasterResult | null;
  hoveredGizmo: GridGizmoHover;
  hoveredFirstVertex: boolean;
}

export const INITIAL_CAMERA_ZOOM = 60;
const DEFAULT_REGION: MultiPolygon = [
  [
    [
      [-5.21, -6.98],
      [-3.96, -7.13],
      [-4.02, -7.67],
      [0.08, -8.17],
      [0.22, -7.10],
      [5.40, -7.74],
      [5.70, -5.23],
      [4.10, -5.04],
      [4.05, -5.39],
      [1.02, -5.02],
      [1.67, 0.34],
      [2.39, 0.25],
      [2.54, 1.50],
      [5.58, 1.13],
      [5.89, 3.63],
      [5.17, 3.72],
      [5.61, 7.29],
      [2.93, 7.62],
      [2.82, 6.73],
      [1.03, 6.95],
      [1.17, 8.02],
      [-3.84, 8.63],
      [-4.17, 5.95],
      [-5.59, 6.13],
      [-6.08, 2.20],
      [-4.11, 1.96],
      [-5.21, -6.98],
    ] as ClipRing,
  ],
];

function cloneRegion(region: MultiPolygon): MultiPolygon {
  return region.map((polygon) =>
    polygon.map((ring) => ring.map(([x, y]) => [x, y] as [number, number])),
  );
}

export function createInitialState(): AppState {
  return {
    region: cloneRegion(DEFAULT_REGION),
    drawingPolygon: [],
    drawingCursorWorld: null,
    polygonMode: null,
    interactionMode: "idle",
    grid: {
      origin: { x: 0, y: 0 },
      angle: 0,
      spacing: 1,
    },
    camera: {
      offset: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      zoom: INITIAL_CAMERA_ZOOM,
    },
    raster: null,
    hoveredGizmo: null,
    hoveredFirstVertex: false,
  };
}
