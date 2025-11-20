import type { CameraState, GridState, Vec2 } from "./state";

const MIN_AXIS_SCREEN_PX = 32;

export function computeAxisTipWorld(grid: GridState, camera: CameraState): Vec2 {
  const baseLength = grid.spacing * 0.8;
  const minWorldLength = MIN_AXIS_SCREEN_PX / camera.zoom;
  const length = Math.max(baseLength, minWorldLength);
  const dirX = Math.cos(grid.angle);
  const dirY = Math.sin(grid.angle);
  return {
    x: grid.origin.x + dirX * length,
    y: grid.origin.y + dirY * length,
  };
}
