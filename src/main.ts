import "./style.css";

import { setupCanvasSizing, resetCamera } from "./camera";
import { setupInteractions } from "./interactions";
import { renderScene } from "./render";
import { rasterizeRegion } from "./raster";
import { setupToolbar } from "./toolbar";
import { createInitialState } from "./state";
import type { PolygonBooleanMode } from "./state";
import { findBestGridAlignmentAsync } from "./gridAlignment";

const canvas = document.getElementById("main-canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d");
if (!context) {
  throw new Error("Missing drawing context");
}
const ctx = context;

const state = createInitialState();
let rasterDirty = true;
let alignAbortController: AbortController | null = null;
let lastAlignStatsText = "";

const toolbarControls = setupToolbar({
  isModeActive: (mode) => state.polygonMode === mode,
  onModeToggle: (mode) => handleModeToggle(mode),
  onClear: () => clearRegion(),
  onResetCamera: () => {
    resetCamera(state);
    markRasterDirty();
  },
  onToggleAutoAlign: (enabled) => {
    state.autoAlignEnabled = enabled;
    if (enabled) {
      triggerAutoAlign();
    }
  },
});

const updateCellCountLabel = toolbarControls.updateCellCount;

setupCanvasSizing(canvas, ctx, state);
resetCamera(state);
markRasterDirty();
setupInteractions({
  canvas,
  state,
  toolbar: toolbarControls,
  markRasterDirty,
  cancelAlignment,
  triggerAutoAlign,
});

toolbarControls.updateModeButtons();
updateCellCountLabel(0);
toolbarControls.setAutoAlignChecked(state.autoAlignEnabled);
if (state.autoAlignEnabled && state.region) {
  triggerAutoAlign();
}

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
  cancelAlignment();
  state.autoAlignEnabled = false;
  state.region = null;
  state.drawingPolygon = [];
  state.drawingCursorWorld = null;
  state.interactionMode = "idle";
  state.hoveredFirstVertex = false;
  state.hoveredGizmo = null;
  markRasterDirty();
  toolbarControls.updateCellCount(0);
  toolbarControls.setAlignStats("");
  toolbarControls.setAutoAlignChecked(false);
}

function cancelAlignment() {
  if (!alignAbortController) {
    return;
  }
  alignAbortController.abort();
  alignAbortController = null;
  toolbarControls.setAligning(false);
  toolbarControls.setAlignStats(lastAlignStatsText);
}

function autoAlignGrid() {
  if (!state.region) {
    return;
  }
  cancelAlignment();
  const controller = new AbortController();
  alignAbortController = controller;
  toolbarControls.setAligning(true);
  toolbarControls.setAlignStats("Aligning…");
  findBestGridAlignmentAsync(state.region, state.grid, {
    signal: controller.signal,
  })
    .then((best) => {
      if (controller.signal.aborted) {
        return;
      }
      alignAbortController = null;
      toolbarControls.setAligning(false);
      lastAlignStatsText = "";
      toolbarControls.setAlignStats(lastAlignStatsText);
      if (!best) {
        return;
      }
      state.grid.origin.x = best.origin.x;
      state.grid.origin.y = best.origin.y;
      state.grid.angle = best.angle;
      markRasterDirty();
    })
    .catch((error) => {
      if (controller.signal.aborted) {
        return;
      }
      alignAbortController = null;
      toolbarControls.setAligning(false);
      toolbarControls.setAlignStats(lastAlignStatsText);
      // eslint-disable-next-line no-console
      console.error("Grid alignment failed", error);
    });
}

function triggerAutoAlign() {
  if (!state.autoAlignEnabled) {
    return;
  }
  autoAlignGrid();
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
