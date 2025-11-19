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

export function createInitialState(): AppState {
  return {
    region: null,
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
