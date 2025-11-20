import "./style.css";

import {
  applyPolygonBoolean,
  gridToWorld,
  polylineToClipPolygon,
  screenToWorld,
  worldToScreen,
} from "./geometry";
import { renderScene } from "./render";
import { rasterizeRegion } from "./raster";
import { createInitialState, INITIAL_CAMERA_ZOOM } from "./state";
import type {
  AppState,
  GridGizmoHover,
  InteractionMode,
  PolygonBooleanMode,
  PolygonMode,
  Vec2,
} from "./state";

const canvas = document.getElementById("main-canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d");
if (!context) {
  throw new Error("Missing drawing context");
}
const ctx = context;

const state = createInitialState();
let rasterDirty = true;
const toolbarControls = setupToolbar(state, () => resetView(state));
const updateCellCountLabel = toolbarControls.updateCellCount;
let activePointerId: number | null = null;
let isPanning = false;
let lastPointerPosition: Vec2 | null = null;
const MIN_CAMERA_ZOOM = 10;
const MAX_CAMERA_ZOOM = 200;
const FIRST_VERTEX_CLICK_RADIUS = 14;
const FIRST_VERTEX_HOVER_RADIUS = 14;
const ORIGIN_HANDLE_RADIUS = 18;
const AXIS_HANDLE_DISTANCE = 10;
const ROTATION_HANDLE_MIN_T = 0.4;
const activeTouchPoints = new Map<number, Vec2>();
type TouchGestureState = {
  prevCentroid: Vec2;
  startDistance: number;
  startZoom: number;
  focusWorld: Vec2;
};
let touchGesture: TouchGestureState | null = null;

setupCanvasSizing(canvas, ctx, state);
setupInteractions(canvas);
toolbarControls.updateModeButtons();
updateCellCountLabel(0);

function resetView(appState: AppState) {
  appState.camera.zoom = INITIAL_CAMERA_ZOOM;
  appState.camera.offset.x = window.innerWidth / 2;
  appState.camera.offset.y = window.innerHeight / 2;
  appState.grid.origin.x = 0;
  appState.grid.origin.y = 0;
  appState.grid.angle = 0;
  appState.drawingCursorWorld = null;
  appState.hoveredGizmo = null;
  appState.hoveredFirstVertex = false;
  rasterDirty = true;
}

function setupToolbar(appState: AppState, onResetView: () => void) {
  const modeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".mode-button"),
  );
  const cellCountElement = document.getElementById("cell-count") as HTMLElement | null;

  const updateModeButtons = () => {
    modeButtons.forEach((button) => {
      const buttonMode = button.dataset.mode as PolygonBooleanMode | undefined;
      if (!buttonMode) {
        return;
      }
      const isActive = appState.polygonMode === buttonMode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const updateCellCount = (value: number) => {
    if (cellCountElement) {
      cellCountElement.textContent = value.toString();
    }
  };

  modeButtons.forEach((button) => {
    const buttonMode = button.dataset.mode as PolygonBooleanMode | undefined;
    if (!buttonMode) {
      return;
    }
    button.addEventListener("click", () => {
      const nextMode: PolygonMode = appState.polygonMode === buttonMode ? null : buttonMode;
      appState.drawingPolygon = [];
      appState.drawingCursorWorld = null;
      appState.interactionMode = "idle";
      appState.hoveredFirstVertex = false;
      appState.polygonMode = nextMode;
      updateModeButtons();
    });
  });

  const clearButton = document.getElementById("clear-region");
  clearButton?.addEventListener("click", () => {
    appState.region = null;
    appState.drawingPolygon = [];
    appState.drawingCursorWorld = null;
    appState.interactionMode = "idle";
    appState.hoveredFirstVertex = false;
    appState.hoveredGizmo = null;
    rasterDirty = true;
    updateCellCount(0);
  });

  const resetButton = document.getElementById("reset-view");
  resetButton?.addEventListener("click", () => {
    onResetView();
  });

  return {
    updateModeButtons,
    updateCellCount,
  };
}

function setupCanvasSizing(
  canvasEl: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  appState: AppState,
) {
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
  appState.camera.offset.x = window.innerWidth / 2;
  appState.camera.offset.y = window.innerHeight / 2;
}

function setupInteractions(canvasEl: HTMLCanvasElement) {
  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointerup", onPointerUp);
  canvasEl.addEventListener("pointercancel", onPointerUp);
  canvasEl.addEventListener("pointerleave", onPointerLeave);
  canvasEl.addEventListener("wheel", onWheel, { passive: false });
  canvasEl.addEventListener("dblclick", (event) => {
    event.preventDefault();
    finalizePolygon();
  });
  canvasEl.addEventListener("contextmenu", (event) => event.preventDefault());
}

function onPointerDown(event: PointerEvent) {
  const pointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);

  if (event.pointerType === "touch") {
    activeTouchPoints.set(event.pointerId, pointer);
    if (activeTouchPoints.size >= 2) {
      beginTouchGesture();
      event.preventDefault();
      return;
    }
  }

  if (activePointerId === null) {
    activePointerId = event.pointerId;
    lastPointerPosition = pointer;
  }

  if (event.button === 1) {
    isPanning = true;
    event.preventDefault();
    return;
  }

  if (event.button === 2) {
    isPanning = true;
    event.preventDefault();
    return;
  }

  if (event.button !== 0) {
    return;
  }

  const gizmoHit = hitTestGridGizmo(pointer);
  if (gizmoHit) {
    state.interactionMode = gizmoHit;
    state.hoveredGizmo = gizmoHit === "dragging_grid_origin" ? "origin" : "axis";
    event.preventDefault();
    return;
  }

  if (!state.polygonMode) {
    state.interactionMode = "idle";
    state.drawingPolygon = [];
    state.drawingCursorWorld = null;
    state.hoveredFirstVertex = false;
    return;
  }

  const worldPoint = screenToWorld(pointer, state.camera);
  if (
    state.interactionMode === "drawing_polygon" &&
    state.drawingPolygon.length >= 3 &&
    isPointerNearFirstVertex(pointer, FIRST_VERTEX_CLICK_RADIUS)
  ) {
    finalizePolygon();
    event.preventDefault();
    return;
  }
  state.drawingPolygon.push(worldPoint);
  state.interactionMode = "drawing_polygon";
  state.drawingCursorWorld = worldPoint;
}

function onPointerMove(event: PointerEvent) {
  const pointer = { x: event.clientX, y: event.clientY };
  const pointerWorld = screenToWorld(pointer, state.camera);
  const isActivePointer = activePointerId === event.pointerId;

  if (event.pointerType === "touch") {
    activeTouchPoints.set(event.pointerId, pointer);
    if (touchGesture) {
      updateTouchGesture();
      event.preventDefault();
      return;
    }
    if (activeTouchPoints.size >= 2) {
      beginTouchGesture();
      event.preventDefault();
      return;
    }
  }

  if (isActivePointer && isPanning && lastPointerPosition) {
    const delta = {
      x: pointer.x - lastPointerPosition.x,
      y: pointer.y - lastPointerPosition.y,
    };
    state.camera.offset.x += delta.x;
    state.camera.offset.y += delta.y;
    lastPointerPosition = pointer;
    updatePointerHover(pointer, pointerWorld);
    return;
  }

  if (isActivePointer && state.interactionMode === "dragging_grid_origin" && lastPointerPosition) {
    const prevWorld = screenToWorld(lastPointerPosition, state.camera);
    const delta = {
      x: pointerWorld.x - prevWorld.x,
      y: pointerWorld.y - prevWorld.y,
    };
    state.grid.origin.x += delta.x;
    state.grid.origin.y += delta.y;
    lastPointerPosition = pointer;
    rasterDirty = true;
    updatePointerHover(pointer, pointerWorld);
    return;
  }

  if (isActivePointer && state.interactionMode === "rotating_grid") {
    const dir = {
      x: pointerWorld.x - state.grid.origin.x,
      y: pointerWorld.y - state.grid.origin.y,
    };
    state.grid.angle = Math.atan2(dir.y, dir.x);
    rasterDirty = true;
    updatePointerHover(pointer, pointerWorld);
    return;
  }

  if (isActivePointer) {
    lastPointerPosition = pointer;
  }

  updatePointerHover(pointer, pointerWorld);
}

function onPointerUp(event: PointerEvent) {
  const pointer = { x: event.clientX, y: event.clientY };
  const pointerWorld = screenToWorld(pointer, state.camera);

  if (event.pointerType === "touch") {
    activeTouchPoints.delete(event.pointerId);
    if (touchGesture && activeTouchPoints.size >= 2) {
      beginTouchGesture();
    } else if (touchGesture && activeTouchPoints.size < 2) {
      endTouchGesture();
    }
  }

  if (activePointerId === event.pointerId) {
    activePointerId = null;
    lastPointerPosition = null;
  }
  isPanning = false;
  if (state.interactionMode !== "drawing_polygon") {
    state.interactionMode = "idle";
    state.drawingCursorWorld = null;
  }
  updatePointerHover(pointer, pointerWorld);
}

function onPointerLeave(event?: PointerEvent) {
  if (event?.pointerType === "touch") {
    activeTouchPoints.delete(event.pointerId);
    if (touchGesture && activeTouchPoints.size < 2) {
      endTouchGesture();
    }
  }
  updatePointerHover(null, null);
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const zoomFactor = Math.exp(-event.deltaY * 0.001);
  const clampedZoom = clampZoom(state.camera.zoom * zoomFactor);
  const screenPoint = { x: event.clientX, y: event.clientY };
  const worldBefore = screenToWorld(screenPoint, state.camera);

  state.camera.zoom = clampedZoom;
  const worldAfter = worldBefore;
  const screenAfter = worldToScreen(worldAfter, state.camera);
  const deltaScreen = {
    x: screenPoint.x - screenAfter.x,
    y: screenPoint.y - screenAfter.y,
  };
  state.camera.offset.x += deltaScreen.x;
  state.camera.offset.y += deltaScreen.y;
  const worldPoint = screenToWorld(screenPoint, state.camera);
  updatePointerHover(screenPoint, worldPoint);
}

function hitTestGridGizmo(pointer: Vec2): InteractionMode | null {
  const handle = detectGizmoHandle(pointer);
  if (handle === "origin") {
    return "dragging_grid_origin";
  }
  if (handle === "axis") {
    return "rotating_grid";
  }
  return null;
}

function finalizePolygon() {
  const polygon = polylineToClipPolygon(state.drawingPolygon);
  state.drawingPolygon = [];
  state.drawingCursorWorld = null;
  state.hoveredFirstVertex = false;
  if (!polygon) {
    state.interactionMode = "idle";
    return;
  }
  if (!state.polygonMode) {
    state.interactionMode = "idle";
    return;
  }
  state.region = applyPolygonBoolean(state.region, polygon, state.polygonMode);
  state.interactionMode = "idle";
  rasterDirty = true;
}

function updatePointerHover(screenPoint: Vec2 | null, worldPoint: Vec2 | null) {
  updateDrawingCursor(worldPoint);
  updateHoverStates(screenPoint);
}

function updateDrawingCursor(worldPoint: Vec2 | null) {
  if (state.interactionMode === "drawing_polygon") {
    state.drawingCursorWorld = worldPoint;
  } else if (state.drawingCursorWorld) {
    state.drawingCursorWorld = null;
  }
}

function updateHoverStates(screenPoint: Vec2 | null) {
  const shouldHighlightFirst =
    !!screenPoint &&
    state.interactionMode === "drawing_polygon" &&
    state.drawingPolygon.length >= 3 &&
    isPointerNearFirstVertex(screenPoint, FIRST_VERTEX_HOVER_RADIUS);
  state.hoveredFirstVertex = shouldHighlightFirst;

  if (state.interactionMode === "dragging_grid_origin") {
    state.hoveredGizmo = "origin";
    return;
  }
  if (state.interactionMode === "rotating_grid") {
    state.hoveredGizmo = "axis";
    return;
  }
  if (!screenPoint) {
    state.hoveredGizmo = null;
    return;
  }
  state.hoveredGizmo = detectGizmoHandle(screenPoint);
}

function detectGizmoHandle(screenPoint: Vec2): GridGizmoHover {
  const originScreen = worldToScreen(state.grid.origin, state.camera);
  const originDistance = Math.hypot(screenPoint.x - originScreen.x, screenPoint.y - originScreen.y);
  if (originDistance <= ORIGIN_HANDLE_RADIUS) {
    return "origin";
  }

  const axisWorld = gridToWorld({ x: state.grid.spacing * 0.8, y: 0 }, state.grid);
  const axisScreen = worldToScreen(axisWorld, state.camera);
  const { distance, t } = distanceToSegment(screenPoint, originScreen, axisScreen);
  if (distance <= AXIS_HANDLE_DISTANCE && t >= ROTATION_HANDLE_MIN_T) {
    return "axis";
  }

  return null;
}

function isPointerNearFirstVertex(pointer: Vec2, radius: number): boolean {
  if (!state.drawingPolygon.length) {
    return false;
  }
  const first = state.drawingPolygon[0];
  const firstScreen = worldToScreen(first, state.camera);
  return Math.hypot(pointer.x - firstScreen.x, pointer.y - firstScreen.y) <= radius;
}

function distanceToSegment(
  point: Vec2,
  start: Vec2,
  end: Vec2,
): { distance: number; t: number; closest: Vec2 } {
  const abx = end.x - start.x;
  const aby = end.y - start.y;
  const abLenSq = abx * abx + aby * aby;
  let t = 0;
  if (abLenSq > 0) {
    t = ((point.x - start.x) * abx + (point.y - start.y) * aby) / abLenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const closest = { x: start.x + abx * t, y: start.y + aby * t };
  const distance = Math.hypot(point.x - closest.x, point.y - closest.y);
  return { distance, t, closest };
}

function beginTouchGesture() {
  if (activeTouchPoints.size < 2) {
    touchGesture = null;
    return;
  }
  const centroid = computeTouchCentroid();
  const distance = computeTouchDistance();
  if (!centroid || !distance) {
    touchGesture = null;
    return;
  }
  touchGesture = {
    prevCentroid: centroid,
    startDistance: distance,
    startZoom: state.camera.zoom,
    focusWorld: screenToWorld(centroid, state.camera),
  };
  state.drawingCursorWorld = null;
  state.hoveredFirstVertex = false;
}

function updateTouchGesture() {
  if (!touchGesture) {
    return;
  }
  if (activeTouchPoints.size < 2) {
    endTouchGesture();
    return;
  }
  const centroid = computeTouchCentroid();
  const distance = computeTouchDistance();
  if (!centroid || !distance || touchGesture.startDistance === 0) {
    endTouchGesture();
    return;
  }

  const delta = {
    x: centroid.x - touchGesture.prevCentroid.x,
    y: centroid.y - touchGesture.prevCentroid.y,
  };
  state.camera.offset.x += delta.x;
  state.camera.offset.y += delta.y;
  touchGesture.prevCentroid = centroid;

  const zoomFactor = distance / touchGesture.startDistance;
  const nextZoom = clampZoom(touchGesture.startZoom * zoomFactor);
  state.camera.zoom = nextZoom;
  const screenAfter = worldToScreen(touchGesture.focusWorld, state.camera);
  const adjust = {
    x: centroid.x - screenAfter.x,
    y: centroid.y - screenAfter.y,
  };
  state.camera.offset.x += adjust.x;
  state.camera.offset.y += adjust.y;

  state.drawingCursorWorld = null;
  state.hoveredFirstVertex = false;
}

function endTouchGesture() {
  touchGesture = null;
}

function computeTouchCentroid(): Vec2 | null {
  if (activeTouchPoints.size === 0) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  activeTouchPoints.forEach((point) => {
    sumX += point.x;
    sumY += point.y;
  });
  const count = activeTouchPoints.size;
  return { x: sumX / count, y: sumY / count };
}

function computeTouchDistance(): number | null {
  if (activeTouchPoints.size < 2) {
    return null;
  }
  const iterator = activeTouchPoints.values();
  const first = iterator.next();
  const second = iterator.next();
  if (first.done || second.done) {
    return null;
  }
  return Math.hypot(second.value.x - first.value.x, second.value.y - first.value.y);
}

function clampZoom(value: number): number {
  return Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, value));
}

function update() {
  if (rasterDirty) {
    state.raster = rasterizeRegion(state.region, state.grid);
    updateCellCountLabel(state.raster?.gridCellCount ?? 0);
    rasterDirty = false;
  }

  renderScene(ctx, state);
  requestAnimationFrame(update);
}

update();
