import type { AppState } from "./state";
import { INITIAL_CAMERA_ZOOM } from "./state";

export const MIN_CAMERA_ZOOM = 10;
export const MAX_CAMERA_ZOOM = 200;

export function resetCamera(state: AppState): void {
  state.camera.zoom = INITIAL_CAMERA_ZOOM;
  state.camera.offset.x = window.innerWidth / 2;
  state.camera.offset.y = window.innerHeight / 2;
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
