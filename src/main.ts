import "./style.css";

import { setupCanvasSizing, resetCamera, resetGrid } from "./camera";
import { setupInteractions } from "./interactions";
import { renderScene } from "./render";
import { rasterizeRegion } from "./raster";
import { setupToolbar } from "./toolbar";
import { createInitialState } from "./state";
import type { PolygonBooleanMode } from "./state";

const canvas = document.getElementById("main-canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d");
if (!context) {
  throw new Error("Missing drawing context");
}
const ctx = context;

const state = createInitialState();
let rasterDirty = true;

const toolbarControls = setupToolbar({
  isModeActive: (mode) => state.polygonMode === mode,
  onModeToggle: (mode) => handleModeToggle(mode),
  onClear: () => clearRegion(),
  onResetCamera: () => {
    resetCamera(state);
    markRasterDirty();
  },
  onResetGrid: () => {
    resetGrid(state);
    markRasterDirty();
  },
});

const updateCellCountLabel = toolbarControls.updateCellCount;

setupCanvasSizing(canvas, ctx, state);
setupInteractions({
  canvas,
  state,
  toolbar: toolbarControls,
  markRasterDirty,
});

toolbarControls.updateModeButtons();
updateCellCountLabel(0);

function markRasterDirty() {
  rasterDirty = true;
}

function handleModeToggle(mode: PolygonBooleanMode) {
  const nextMode = state.polygonMode === mode ? null : mode;
  state.drawingPolygon = [];
  state.drawingCursorWorld = null;
  state.interactionMode = "idle";
  state.hoveredFirstVertex = false;
  state.polygonMode = nextMode;
  toolbarControls.updateModeButtons();
}

function clearRegion() {
  state.region = null;
  state.drawingPolygon = [];
  state.drawingCursorWorld = null;
  state.interactionMode = "idle";
  state.hoveredFirstVertex = false;
  state.hoveredGizmo = null;
  markRasterDirty();
  toolbarControls.updateCellCount(0);
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
