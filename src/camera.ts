import type { AppState, MultiPolygon } from "./state";
import { INITIAL_CAMERA_ZOOM } from "./state";

export const MIN_CAMERA_ZOOM = 10;
export const MAX_CAMERA_ZOOM = 200;
const FIT_MARGIN_PX = 12;

export function resetCamera(state: AppState): void {
  const { innerWidth, innerHeight } = window;
  const bounds = computeRegionBounds(state.region);
  const baseInsets = { left: FIT_MARGIN_PX, right: FIT_MARGIN_PX, top: FIT_MARGIN_PX, bottom: FIT_MARGIN_PX };

  const fitWithInsets = (insets: typeof baseInsets) => {
    const usableWidth = Math.max(32, innerWidth - insets.left - insets.right);
    const usableHeight = Math.max(32, innerHeight - insets.top - insets.bottom);
    if (!bounds) {
      const centerScreen = {
        x: insets.left + usableWidth / 2,
        y: insets.top + usableHeight / 2,
      };
      return {
        zoom: INITIAL_CAMERA_ZOOM,
        offset: { x: centerScreen.x, y: centerScreen.y },
      };
    }
    const fitZoom = Math.min(
      usableWidth / Math.max(bounds.maxX - bounds.minX, 1e-3),
      usableHeight / Math.max(bounds.maxY - bounds.minY, 1e-3),
    );
    const targetZoom = clampZoom(Math.min(INITIAL_CAMERA_ZOOM, fitZoom));
    const centerScreen = {
      x: insets.left + usableWidth / 2,
      y: insets.top + usableHeight / 2,
    };
    const regionCenter = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    return {
      zoom: targetZoom,
      offset: {
        x: centerScreen.x - regionCenter.x * targetZoom,
        y: centerScreen.y - regionCenter.y * targetZoom,
      },
    };
  };

  let cameraFit = fitWithInsets(baseInsets);

  if (bounds) {
    const toolbar = document.querySelector<HTMLElement>(".toolbar");
    if (toolbar) {
      const rect = toolbar.getBoundingClientRect();
      const screenBounds = projectBoundsToScreen(bounds, cameraFit.zoom, cameraFit.offset);
      const overlapX = screenBounds.maxX > rect.left && screenBounds.minX < rect.right;
      const overlapY = screenBounds.maxY > rect.top && screenBounds.minY < rect.bottom;
      if (overlapX && overlapY) {
        const extraTop = Math.max(0, rect.bottom + FIT_MARGIN_PX - screenBounds.minY);
        const adjustedInsets = {
          left: baseInsets.left,
          right: baseInsets.right,
          top: baseInsets.top + extraTop,
          bottom: baseInsets.bottom,
        };
        cameraFit = fitWithInsets(adjustedInsets);
      }
    }
  }

  state.camera.zoom = cameraFit.zoom;
  state.camera.offset.x = cameraFit.offset.x;
  state.camera.offset.y = cameraFit.offset.y;
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

function projectBoundsToScreen(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  zoom: number,
  offset: { x: number; y: number },
) {
  const minX = bounds.minX * zoom + offset.x;
  const maxX = bounds.maxX * zoom + offset.x;
  const minY = bounds.minY * zoom + offset.y;
  const maxY = bounds.maxY * zoom + offset.y;
  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY),
  };
}
