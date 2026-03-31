/**
 * Geometric utilities for room planning.
 */

import { Room } from '../model/types';
import { SCALE } from './scale';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Get the effective wall lengths for a room.
 * Returns the actual wall lengths, falling back to widthCm/heightCm.
 */
export function getEffectiveWallLengths(room: Room): { north: number; south: number; east: number; west: number } {
  return {
    north: room.wallLengths?.north ?? room.widthCm,
    south: room.wallLengths?.south ?? room.widthCm,
    east: room.wallLengths?.east ?? room.heightCm,
    west: room.wallLengths?.west ?? room.heightCm,
  };
}

/**
 * Check if a room is rectangular (all wall lengths match the bounding rect).
 */
export function isRoomRectangular(room: Room): boolean {
  if (!room.wallLengths) return true;
  const wl = getEffectiveWallLengths(room);
  return wl.north === wl.south && wl.east === wl.west;
}

/**
 * Compute the 4 corners of a room in absolute coordinates (cm).
 * NW is anchored at (xCm, yCm). For rectangular rooms, returns the simple rectangle corners.
 * For non-rectangular rooms, computes the quadrilateral from wall lengths.
 *
 * Corner layout (viewed from above):
 *   NW ---- north wall ---- NE
 *   |                        |
 *   west                   east
 *   |                        |
 *   SW ---- south wall ---- SE
 */
export function getRoomCorners(room: Room): { nw: Point2D; ne: Point2D; sw: Point2D; se: Point2D } {
  const wl = getEffectiveWallLengths(room);
  const N = wl.north, S = wl.south, E = wl.east, W = wl.west;

  // NW corner is the anchor
  const nw: Point2D = { x: room.xCm, y: room.yCm };
  // NE: north wall extends to the right from NW
  const ne: Point2D = { x: room.xCm + N, y: room.yCm };
  // SW: west wall extends downward from NW
  const sw: Point2D = { x: room.xCm, y: room.yCm + W };

  // For rectangular rooms, SE is trivial
  if (N === S && E === W) {
    return { nw, ne, sw, se: { x: room.xCm + N, y: room.yCm + W } };
  }

  // Compute SE from intersection of:
  //   circle(SW, radius=S) and circle(NE, radius=E)
  // Using relative coords where NW = (0, 0):
  //   SW_rel = (0, W), NE_rel = (N, 0)
  //   SE_rel = (sx, sy) where:
  //     sx^2 + (sy - W)^2 = S^2
  //     (sx - N)^2 + sy^2 = E^2
  const K = E * E - S * S - N * N + W * W;
  const M = K - 2 * W * W; // = E^2 - S^2 - N^2 - W^2

  const a = 4 * (W * W + N * N);
  const b = 4 * M * N;
  const c = M * M - 4 * W * W * S * S;

  const discriminant = b * b - 4 * a * c;

  let sx: number, sy: number;
  if (discriminant < 0 || a === 0) {
    // No valid intersection - fallback to simple positioning
    sx = S;
    sy = W;
  } else {
    const sqrtD = Math.sqrt(discriminant);
    const sx1 = (-b + sqrtD) / (2 * a);
    const sx2 = (-b - sqrtD) / (2 * a);
    // Pick the solution in the positive quadrant (SE should be right and below NW)
    sx = sx1 > 0 ? sx1 : sx2;
    sy = W === 0 ? E : (K + 2 * N * sx) / (2 * W);
  }

  const se: Point2D = { x: room.xCm + sx, y: room.yCm + sy };
  return { nw, ne, sw, se };
}

/**
 * Get the axis-aligned bounding box of a room's polygon corners.
 */
export function getRoomBoundingBox(room: Room): Rect {
  if (isRoomRectangular(room)) {
    return {
      x: room.xCm,
      y: room.yCm,
      width: room.widthCm,
      height: room.heightCm,
    };
  }
  const c = getRoomCorners(room);
  const xs = [c.nw.x, c.ne.x, c.sw.x, c.se.x];
  const ys = [c.nw.y, c.ne.y, c.sw.y, c.se.y];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute the axis-aligned bounding box of a rotated rectangle.
 * Used for free-rotation object snapping.
 */
export function getRotatedBoundingBox(
  widthCm: number,
  heightCm: number,
  angleDeg: number
): { width: number; height: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  return {
    width: widthCm * cosA + heightCm * sinA,
    height: widthCm * sinA + heightCm * cosA,
  };
}

/**
 * Convert a room from cm to a pixel-based rectangle.
 */
export function roomToRect(room: Room): Rect {
  return {
    x: room.xCm * SCALE,
    y: room.yCm * SCALE,
    width: room.widthCm * SCALE,
    height: room.heightCm * SCALE,
  };
}

/**
 * Check if two rectangles overlap.
 */
export function rectsOverlap(rect1: Rect, rect2: Rect): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

/**
 * Check if a point is inside a rectangle.
 */
export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

/**
 * Get the center of a rectangle.
 */
export function getRectCenter(rect: Rect): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

/**
 * Calculate distance between two points.
 */
export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
