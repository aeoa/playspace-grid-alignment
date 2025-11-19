import polygonClipping from "polygon-clipping";
import type {
  CameraState,
  ClipPolygon,
  GridState,
  MultiPolygon,
  PolygonBooleanMode,
  Vec2,
} from "./state";

/** Applies camera zoom + offset to map world coordinates into screen space. */
export function worldToScreen(point: Vec2, camera: CameraState): Vec2 {
  return {
    x: point.x * camera.zoom + camera.offset.x,
    y: point.y * camera.zoom + camera.offset.y,
  };
}

/** Inverse of worldToScreen. Screen pixels become world coordinates. */
export function screenToWorld(point: Vec2, camera: CameraState): Vec2 {
  return {
    x: (point.x - camera.offset.x) / camera.zoom,
    y: (point.y - camera.offset.y) / camera.zoom,
  };
}

/**
 * Converts a world point into the rotated grid reference frame. We first subtract the grid origin
 * then rotate by -angle to remove the grid rotation.
 */
export function worldToGrid(point: Vec2, grid: GridState): Vec2 {
  const translated = { x: point.x - grid.origin.x, y: point.y - grid.origin.y };
  return rotate(translated, -grid.angle);
}

/**
 * Converts grid coordinates (axis-aligned in grid space) back into world space by rotating them
 * by +angle and translating by the grid origin.
 */
export function gridToWorld(point: Vec2, grid: GridState): Vec2 {
  const rotated = rotate(point, grid.angle);
  return {
    x: rotated.x + grid.origin.x,
    y: rotated.y + grid.origin.y,
  };
}

export function rotate(vec: Vec2, angle: number): Vec2 {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  return {
    x: vec.x * c - vec.y * s,
    y: vec.x * s + vec.y * c,
  };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function polylineToClipPolygon(points: Vec2[]): ClipPolygon | null {
  if (points.length < 3) {
    return null;
  }
  const ring: ClipPolygon[0] = points.map((p) => [p.x, p.y]);
  const first = points[0];
  const last = points[points.length - 1];
  if (distance(first, last) > 1e-6) {
    ring.push([first.x, first.y]);
  }
  return [ring];
}

export function applyPolygonBoolean(
  region: MultiPolygon | null,
  polygon: ClipPolygon,
  mode: PolygonBooleanMode,
): MultiPolygon | null {
  const rhs = [polygon] as MultiPolygon;
  if (mode === "add") {
    if (!region) {
      return rhs;
    }
    const result = polygonClipping.union(region, rhs) as MultiPolygon;
    return normalizeClipResult(result);
  }

  if (!region) {
    return null;
  }

  const diff = polygonClipping.difference(region, rhs) as MultiPolygon;
  return normalizeClipResult(diff);
}

export function normalizeClipResult(result: MultiPolygon | null): MultiPolygon | null {
  if (!result || result.length === 0) {
    return null;
  }
  return result;
}
