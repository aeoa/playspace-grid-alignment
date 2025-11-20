import { gridToWorld, screenToWorld, worldToGrid, worldToScreen } from "./geometry";
import { sampleRasterAtGridPoint } from "./raster";
import type { AppState, Vec2 } from "./state";

export function renderScene(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { canvas } = ctx;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  drawGrid(ctx, state, width, height);
  drawRegion(ctx, state);
  drawRasterOverlay(ctx, state);
  drawInProgressPolygon(ctx, state);
  drawGridGizmo(ctx, state);
}

function drawGrid(ctx: CanvasRenderingContext2D, state: AppState, width: number, height: number) {
  const camera = state.camera;
  const grid = state.grid;
  const spacing = grid.spacing;
  const halfSpacing = spacing / 2;

  const screenCorners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const gridCorners = screenCorners.map((corner) => worldToGrid(screenToWorld(corner, camera), grid));

  const gxMin = Math.min(...gridCorners.map((p) => p.x)) - spacing * 2;
  const gxMax = Math.max(...gridCorners.map((p) => p.x)) + spacing * 2;
  const gyMin = Math.min(...gridCorners.map((p) => p.y)) - spacing * 2;
  const gyMax = Math.max(...gridCorners.map((p) => p.y)) + spacing * 2;

  const startGX = Math.floor((gxMin - halfSpacing) / spacing);
  const endGX = Math.ceil((gxMax - halfSpacing) / spacing);
  const startGY = Math.floor((gyMin - halfSpacing) / spacing);
  const endGY = Math.ceil((gyMax - halfSpacing) / spacing);

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";

  for (let i = startGX; i <= endGX; i += 1) {
    const gx = i * spacing + halfSpacing;
    const p0 = worldToScreen(gridToWorld({ x: gx, y: gyMin }, grid), camera);
    const p1 = worldToScreen(gridToWorld({ x: gx, y: gyMax }, grid), camera);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  for (let j = startGY; j <= endGY; j += 1) {
    const gy = j * spacing + halfSpacing;
    const p0 = worldToScreen(gridToWorld({ x: gxMin, y: gy }, grid), camera);
    const p1 = worldToScreen(gridToWorld({ x: gxMax, y: gy }, grid), camera);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
}

function drawRegion(ctx: CanvasRenderingContext2D, state: AppState) {
  if (!state.region) {
    return;
  }

  ctx.fillStyle = "rgba(90, 183, 255, 0.25)";
  ctx.strokeStyle = "rgba(90, 183, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();

  state.region.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(([x, y], idx) => {
        const screen = worldToScreen({ x, y }, state.camera);
        if (idx === 0) {
          ctx.moveTo(screen.x, screen.y);
        } else {
          ctx.lineTo(screen.x, screen.y);
        }
      });
      ctx.closePath();
    });
  });

  ctx.fill("evenodd");
  ctx.stroke();
}

function drawInProgressPolygon(ctx: CanvasRenderingContext2D, state: AppState) {
  if (!state.drawingPolygon.length) {
    return;
  }
  ctx.lineWidth = 2;
  const isSubtracting = state.polygonMode === "subtract";
  const strokeColor = isSubtracting ? "rgba(255, 120, 120, 0.95)" : "rgba(120, 255, 180, 0.95)";
  ctx.strokeStyle = strokeColor;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();

  state.drawingPolygon.forEach((point, index) => {
    const screen = worldToScreen(point, state.camera);
    if (index === 0) {
      ctx.moveTo(screen.x, screen.y);
    } else {
      ctx.lineTo(screen.x, screen.y);
    }
  });

  ctx.stroke();
  ctx.setLineDash([]);

  if (state.drawingCursorWorld && state.interactionMode === "drawing_polygon") {
    const last = state.drawingPolygon[state.drawingPolygon.length - 1];
    const lastScreen = worldToScreen(last, state.camera);
    const cursorScreen = worldToScreen(state.drawingCursorWorld, state.camera);
    ctx.strokeStyle = isSubtracting ? "rgba(255, 140, 140, 0.7)" : "rgba(120, 255, 190, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(lastScreen.x, lastScreen.y);
    ctx.lineTo(cursorScreen.x, cursorScreen.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const first = state.drawingPolygon[0];
  const firstScreen = worldToScreen(first, state.camera);
  const handleRadius = state.hoveredFirstVertex ? 8 : 6;
  const handleFill = isSubtracting ? "rgba(255, 150, 150, 0.95)" : "rgba(170, 255, 200, 0.95)";
  const handleFillHover = isSubtracting ? "rgba(255, 175, 175, 1)" : "rgba(185, 255, 215, 1)";
  ctx.fillStyle = state.hoveredFirstVertex ? handleFillHover : handleFill;
  ctx.strokeStyle = state.hoveredFirstVertex ? "rgba(32, 32, 32, 0.9)" : "rgba(12, 12, 12, 0.8)";
  ctx.lineWidth = state.hoveredFirstVertex ? 2 : 1;
  ctx.beginPath();
  ctx.arc(firstScreen.x, firstScreen.y, handleRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (state.hoveredFirstVertex) {
    ctx.strokeStyle = isSubtracting ? "rgba(255, 150, 150, 0.6)" : "rgba(170, 255, 200, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(firstScreen.x, firstScreen.y, handleRadius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGridGizmo(ctx: CanvasRenderingContext2D, state: AppState) {
  const originScreen = worldToScreen(state.grid.origin, state.camera);
  const axisWorld = gridToWorld({ x: state.grid.spacing * 0.8, y: 0 }, state.grid);
  const axisScreen = worldToScreen(axisWorld, state.camera);

  const originActive =
    state.hoveredGizmo === "origin" || state.interactionMode === "dragging_grid_origin";
  const axisActive = state.hoveredGizmo === "axis" || state.interactionMode === "rotating_grid";

  if (originActive) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.arc(originScreen.x, originScreen.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = originActive ? "rgba(255, 255, 255, 1)" : "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = originActive ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(originScreen.x - 6, originScreen.y);
  ctx.lineTo(originScreen.x + 6, originScreen.y);
  ctx.moveTo(originScreen.x, originScreen.y - 6);
  ctx.lineTo(originScreen.x, originScreen.y + 6);
  ctx.stroke();

  ctx.strokeStyle = axisActive ? "rgba(255, 186, 110, 0.95)" : "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = axisActive ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(originScreen.x, originScreen.y);
  ctx.lineTo(axisScreen.x, axisScreen.y);
  ctx.stroke();

  if (axisActive) {
    ctx.fillStyle = "rgba(255, 186, 110, 0.25)";
    ctx.beginPath();
    ctx.arc(axisScreen.x, axisScreen.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 186, 110, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(axisScreen.x, axisScreen.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawRasterOverlay(ctx: CanvasRenderingContext2D, state: AppState) {
  const raster = state.raster;
  if (!raster) {
    return;
  }
  const grid = state.grid;
  const half = grid.spacing / 2;

  ctx.fillStyle = "rgba(94, 255, 154, 0.35)";
  ctx.strokeStyle = "rgba(94, 255, 154, 0.8)";

  for (let iy = raster.gridSampleBounds.minY; iy <= raster.gridSampleBounds.maxY; iy += 1) {
    for (let ix = raster.gridSampleBounds.minX; ix <= raster.gridSampleBounds.maxX; ix += 1) {
      const gridCenter: Vec2 = { x: ix * grid.spacing, y: iy * grid.spacing };
      const value = sampleRasterAtGridPoint(raster, gridCenter);
      if (!value) {
        continue;
      }
      const cornersGrid: Vec2[] = [
        { x: gridCenter.x - half, y: gridCenter.y - half },
        { x: gridCenter.x + half, y: gridCenter.y - half },
        { x: gridCenter.x + half, y: gridCenter.y + half },
        { x: gridCenter.x - half, y: gridCenter.y + half },
      ];
      ctx.beginPath();
      cornersGrid.forEach((corner, index) => {
        const world = gridToWorld(corner, grid);
        const screen = worldToScreen(world, state.camera);
        if (index === 0) {
          ctx.moveTo(screen.x, screen.y);
        } else {
          ctx.lineTo(screen.x, screen.y);
        }
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}
