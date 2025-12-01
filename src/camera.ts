import type { AppState, MultiPolygon } from "./state";
import { INITIAL_CAMERA_ZOOM } from "./state";

export const MIN_CAMERA_ZOOM = 10;
export const MAX_CAMERA_ZOOM = 200;
const FIT_MARGIN_PX = 24;

export function resetCamera(state: AppState): void {
  const { innerWidth, innerHeight } = window;
  const insets = getViewportInsets();
  const usableWidth = Math.max(32, innerWidth - insets.left - insets.right);
  const usableHeight = Math.max(32, innerHeight - insets.top - insets.bottom);
  const centerScreen = {
    x: insets.left + usableWidth / 2,
    y: insets.top + usableHeight / 2,
  };

  const bounds = computeRegionBounds(state.region);
  if (!bounds) {
    state.camera.zoom = INITIAL_CAMERA_ZOOM;
    state.camera.offset.x = centerScreen.x;
    state.camera.offset.y = centerScreen.y;
    state.drawingCursorWorld = null;
    state.hoveredGizmo = null;
    state.hoveredFirstVertex = false;
    return;
  }

  const regionSize = {
    width: Math.max(bounds.maxX - bounds.minX, 1e-3),
    height: Math.max(bounds.maxY - bounds.minY, 1e-3),
  };
  const fitZoom = Math.min(usableWidth / regionSize.width, usableHeight / regionSize.height);
  const targetZoom = clampZoom(Math.min(INITIAL_CAMERA_ZOOM, fitZoom));

  const regionCenter = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };

  state.camera.zoom = targetZoom;
  state.camera.offset.x = centerScreen.x - regionCenter.x * targetZoom;
  state.camera.offset.y = centerScreen.y - regionCenter.y * targetZoom;
  state.drawingCursorWorld = null;
  state.hoveredGizmo = null;
  state.hoveredFirstVertex = false;
}

export function resetGrid(state: AppState): void {
  state.grid.origin.x = 0;
  state.grid.origin.y = 0;
  state.grid.angle = 0;
  state.hoveredGizmo = null;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, value));
}

export function setupCanvasSizing(
  canvasEl: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  state: AppState,
): void {
  const resize = () => {
    const { innerWidth, innerHeight, devicePixelRatio } = window;
    canvasEl.style.width = `${innerWidth}px`;
    canvasEl.style.height = `${innerHeight}px`;
    canvasEl.width = innerWidth * devicePixelRatio;
    canvasEl.height = innerHeight * devicePixelRatio;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  };
  window.addEventListener("resize", resize);
  resize();
  state.camera.offset.x = window.innerWidth / 2;
  state.camera.offset.y = window.innerHeight / 2;
}

function computeRegionBounds(region: MultiPolygon | null) {
  if (!region) {
    return null;
  }
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

function getViewportInsets() {
  const base = FIT_MARGIN_PX;
  return {
    left: base,
    right: base,
    top: base,
    bottom: base,
  };
}
