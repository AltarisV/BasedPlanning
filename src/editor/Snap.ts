/**
 * Snapping logic for room edges.
 * Snap tolerance: 2 cm
 *
 * WALL OVERLAP MODE:
 * When rooms are snapped together, their walls should overlap (share the same space).
 * This means we snap INNER edges together, so both rooms' walls occupy the same area.
 * 
 * Example: Room A's east wall and Room B's west wall overlap when:
 * - Room A's inner right edge (xCm + widthCm) equals Room B's inner left edge (xCm)
 */

import { Room } from '../model/types';

export const SNAP_TOLERANCE_CM = 2;
export const WALL_SNAP_TOLERANCE_CM = 15; // Larger tolerance for wall-overlap snapping (intended behavior)

export interface SnapResult {
  xCm: number;
  yCm: number;
  snappedX: boolean;
  snappedY: boolean;
  // Optional: expose the snapped guide positions for indicator lines
  xGuideCm?: number;
  yGuideCm?: number;
}

type WallSides = { north: number; south: number; east: number; west: number };

function getWallThicknessCm(room: Room, globalWallThicknessCm: number): WallSides {
  return {
    north: room.wallThickness?.north ?? globalWallThicknessCm,
    south: room.wallThickness?.south ?? globalWallThicknessCm,
    east: room.wallThickness?.east ?? globalWallThicknessCm,
    west: room.wallThickness?.west ?? globalWallThicknessCm,
  };
}

/**
 * Get inner bounds of a room (the floor area, not including walls)
 */
function innerBoundsCm(
  room: Room,
  xCm: number = room.xCm,
  yCm: number = room.yCm
) {
  return {
    left: xCm,
    right: xCm + room.widthCm,
    top: yCm,
    bottom: yCm + room.heightCm,
  };
}

/**
 * Get outer bounds of a room (including walls)
 */
function outerBoundsCm(
  room: Room,
  globalWallThicknessCm: number,
  xCm: number = room.xCm,
  yCm: number = room.yCm
) {
  const w = getWallThicknessCm(room, globalWallThicknessCm);
  return {
    left: xCm - w.west,
    right: xCm + room.widthCm + w.east,
    top: yCm - w.north,
    bottom: yCm + room.heightCm + w.south,
    w,
  };
}

/**
 * Calculate snap points for a moving room against all other rooms.
 * 
 * WALL OVERLAP SNAPPING:
 * Rooms snap so their walls overlap. When moving room's right edge approaches
 * another room's left edge, the walls will share the same space.
 */
export function calculateSnap(
  movingRoom: Room,
  allRooms: Room[],
  targetXCm: number,
  targetYCm: number,
  globalWallThicknessCm: number
): SnapResult {
  const others = allRooms.filter((r) => r.id !== movingRoom.id);

  const movingInner = innerBoundsCm(movingRoom, targetXCm, targetYCm);
  const movingOuter = outerBoundsCm(movingRoom, globalWallThicknessCm, targetXCm, targetYCm);
  const movingWalls = movingOuter.w;

  let snappedXCm = targetXCm;
  let snappedYCm = targetYCm;
  let snappedX = false;
  let snappedY = false;
  let xGuideCm: number | undefined;
  let yGuideCm: number | undefined;

  for (const other of others) {
    const otherInner = innerBoundsCm(other);
    const otherOuter = outerBoundsCm(other, globalWallThicknessCm);
    const otherWalls = otherOuter.w;

    // === SNAP X ===
    if (!snappedX) {
      // WALL OVERLAP: Moving room's OUTER RIGHT to other's INNER LEFT
      // This makes moving room's east wall overlap with other's west wall
      // Moving outer right = movingInner.right + movingWalls.east
      let dist = Math.abs(movingOuter.right - otherInner.left);
      if (dist <= WALL_SNAP_TOLERANCE_CM) {
        // We want: movingInner.right + movingWalls.east = otherInner.left
        // So: movingXCm + movingRoom.widthCm + movingWalls.east = otherInner.left
        // So: movingXCm = otherInner.left - movingRoom.widthCm - movingWalls.east
        snappedXCm = otherInner.left - movingRoom.widthCm - movingWalls.east;
        snappedX = true;
        xGuideCm = otherInner.left;
      }

      // WALL OVERLAP: Moving room's OUTER LEFT to other's INNER RIGHT
      // This makes moving room's west wall overlap with other's east wall
      if (!snappedX) {
        dist = Math.abs(movingOuter.left - otherInner.right);
        if (dist <= WALL_SNAP_TOLERANCE_CM) {
          // We want: movingInner.left - movingWalls.west = otherInner.right
          // So: movingXCm - movingWalls.west = otherInner.right
          // So: movingXCm = otherInner.right + movingWalls.west
          snappedXCm = otherInner.right + movingWalls.west;
          snappedX = true;
          xGuideCm = otherInner.right;
        }
      }

      // Alignment: outer left to outer left
      if (!snappedX) {
        dist = Math.abs(movingOuter.left - otherOuter.left);
        if (dist <= SNAP_TOLERANCE_CM) {
          snappedXCm = otherOuter.left + movingWalls.west;
          snappedX = true;
          xGuideCm = otherOuter.left;
        }
      }

      // Alignment: outer right to outer right
      if (!snappedX) {
        dist = Math.abs(movingOuter.right - otherOuter.right);
        if (dist <= SNAP_TOLERANCE_CM) {
          snappedXCm = otherOuter.right - movingRoom.widthCm - movingWalls.east;
          snappedX = true;
          xGuideCm = otherOuter.right;
        }
      }
    }

    // === SNAP Y ===
    if (!snappedY) {
      // WALL OVERLAP: Moving room's OUTER BOTTOM to other's INNER TOP
      // This makes moving room's south wall overlap with other's north wall
      let dist = Math.abs(movingOuter.bottom - otherInner.top);
      if (dist <= WALL_SNAP_TOLERANCE_CM) {
        snappedYCm = otherInner.top - movingRoom.heightCm - movingWalls.south;
        snappedY = true;
        yGuideCm = otherInner.top;
      }

      // WALL OVERLAP: Moving room's OUTER TOP to other's INNER BOTTOM
      // This makes moving room's north wall overlap with other's south wall
      if (!snappedY) {
        dist = Math.abs(movingOuter.top - otherInner.bottom);
        if (dist <= WALL_SNAP_TOLERANCE_CM) {
          snappedYCm = otherInner.bottom + movingWalls.north;
          snappedY = true;
          yGuideCm = otherInner.bottom;
        }
      }

      // Alignment: outer top to outer top
      if (!snappedY) {
        dist = Math.abs(movingOuter.top - otherOuter.top);
        if (dist <= SNAP_TOLERANCE_CM) {
          snappedYCm = otherOuter.top + movingWalls.north;
          snappedY = true;
          yGuideCm = otherOuter.top;
        }
      }

      // Outer bottom to outer bottom (align rooms)
      if (!snappedY) {
        dist = Math.abs(movingOuter.bottom - otherOuter.bottom);
        if (dist <= SNAP_TOLERANCE_CM) {
          snappedYCm = otherOuter.bottom - movingRoom.heightCm - movingWalls.south;
          snappedY = true;
          yGuideCm = otherOuter.bottom;
        }
      }
    }

    if (snappedX && snappedY) break;
  }

  return {
    xCm: snappedXCm,
    yCm: snappedYCm,
    snappedX,
    snappedY,
    xGuideCm,
    yGuideCm,
  };
}

/** Snap tolerance for objects against walls - generous for easy wall placement */
export const OBJECT_SNAP_TOLERANCE_CM = 25;
/** Snap tolerance for object-to-object alignment - tighter for precision */
export const OBJECT_TO_OBJECT_SNAP_TOLERANCE_CM = 15;

export interface PlacedObjectForSnap {
  id: string;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
}

/**
 * Calculate snapping for a placed object inside a room.
 * Snaps to:
 * 1. Room inner edges (walls) - with generous tolerance
 * 2. Other objects in the same room - for alignment
 */
export function calculatePlacedObjectSnap(
  objWidthCm: number,
  objHeightCm: number,
  room: Room,
  targetXCm: number,
  targetYCm: number,
  toleranceCm: number = OBJECT_SNAP_TOLERANCE_CM,
  otherObjects: PlacedObjectForSnap[] = [],
  currentObjectId?: string
): SnapResult {
  let snappedX = false;
  let snappedY = false;
  let snappedXCm = targetXCm;
  let snappedYCm = targetYCm;
  let xGuideCm: number | undefined;
  let yGuideCm: number | undefined;

  // Room inner edges
  const leftEdge = room.xCm;
  const rightEdge = room.xCm + room.widthCm;
  const topEdge = room.yCm;
  const bottomEdge = room.yCm + room.heightCm;

  // Object edges at target
  const objLeft = targetXCm;
  const objRight = targetXCm + objWidthCm;
  const objTop = targetYCm;
  const objBottom = targetYCm + objHeightCm;

  // Track best snap distances
  let bestSnapDistX = toleranceCm + 1;
  let bestSnapDistY = toleranceCm + 1;

  // === SNAP TO ROOM WALLS ===
  
  // Snap left edge to room left
  const distLeftToWall = Math.abs(objLeft - leftEdge);
  if (distLeftToWall <= toleranceCm && distLeftToWall < bestSnapDistX) {
    snappedXCm = leftEdge;
    snappedX = true;
    xGuideCm = leftEdge;
    bestSnapDistX = distLeftToWall;
  }

  // Snap right edge to room right
  const distRightToWall = Math.abs(objRight - rightEdge);
  if (distRightToWall <= toleranceCm && distRightToWall < bestSnapDistX) {
    snappedXCm = rightEdge - objWidthCm;
    snappedX = true;
    xGuideCm = rightEdge;
    bestSnapDistX = distRightToWall;
  }

  // Snap top edge to room top
  const distTopToWall = Math.abs(objTop - topEdge);
  if (distTopToWall <= toleranceCm && distTopToWall < bestSnapDistY) {
    snappedYCm = topEdge;
    snappedY = true;
    yGuideCm = topEdge;
    bestSnapDistY = distTopToWall;
  }

  // Snap bottom edge to room bottom
  const distBottomToWall = Math.abs(objBottom - bottomEdge);
  if (distBottomToWall <= toleranceCm && distBottomToWall < bestSnapDistY) {
    snappedYCm = bottomEdge - objHeightCm;
    snappedY = true;
    yGuideCm = bottomEdge;
    bestSnapDistY = distBottomToWall;
  }

  // === SNAP TO OTHER OBJECTS (use tighter tolerance) ===
  const objSnapTolerance = OBJECT_TO_OBJECT_SNAP_TOLERANCE_CM;
  
  for (const other of otherObjects) {
    if (currentObjectId && other.id === currentObjectId) continue;

    const otherLeft = other.xCm;
    const otherRight = other.xCm + other.widthCm;
    const otherTop = other.yCm;
    const otherBottom = other.yCm + other.heightCm;

    // X snapping: align edges with other object
    // My left to other's right (place next to it)
    const distLeftToOtherRight = Math.abs(objLeft - otherRight);
    if (distLeftToOtherRight <= objSnapTolerance && distLeftToOtherRight < bestSnapDistX) {
      snappedXCm = otherRight;
      snappedX = true;
      xGuideCm = otherRight;
      bestSnapDistX = distLeftToOtherRight;
    }

    // My right to other's left (place next to it)
    const distRightToOtherLeft = Math.abs(objRight - otherLeft);
    if (distRightToOtherLeft <= objSnapTolerance && distRightToOtherLeft < bestSnapDistX) {
      snappedXCm = otherLeft - objWidthCm;
      snappedX = true;
      xGuideCm = otherLeft;
      bestSnapDistX = distRightToOtherLeft;
    }

    // My left to other's left (align edges)
    const distLeftToOtherLeft = Math.abs(objLeft - otherLeft);
    if (distLeftToOtherLeft <= objSnapTolerance && distLeftToOtherLeft < bestSnapDistX) {
      snappedXCm = otherLeft;
      snappedX = true;
      xGuideCm = otherLeft;
      bestSnapDistX = distLeftToOtherLeft;
    }

    // My right to other's right (align edges)
    const distRightToOtherRight = Math.abs(objRight - otherRight);
    if (distRightToOtherRight <= objSnapTolerance && distRightToOtherRight < bestSnapDistX) {
      snappedXCm = otherRight - objWidthCm;
      snappedX = true;
      xGuideCm = otherRight;
      bestSnapDistX = distRightToOtherRight;
    }

    // Y snapping: align edges with other object
    // My top to other's bottom (place below it)
    const distTopToOtherBottom = Math.abs(objTop - otherBottom);
    if (distTopToOtherBottom <= objSnapTolerance && distTopToOtherBottom < bestSnapDistY) {
      snappedYCm = otherBottom;
      snappedY = true;
      yGuideCm = otherBottom;
      bestSnapDistY = distTopToOtherBottom;
    }

    // My bottom to other's top (place above it)
    const distBottomToOtherTop = Math.abs(objBottom - otherTop);
    if (distBottomToOtherTop <= objSnapTolerance && distBottomToOtherTop < bestSnapDistY) {
      snappedYCm = otherTop - objHeightCm;
      snappedY = true;
      yGuideCm = otherTop;
      bestSnapDistY = distBottomToOtherTop;
    }

    // My top to other's top (align edges)
    const distTopToOtherTop = Math.abs(objTop - otherTop);
    if (distTopToOtherTop <= objSnapTolerance && distTopToOtherTop < bestSnapDistY) {
      snappedYCm = otherTop;
      snappedY = true;
      yGuideCm = otherTop;
      bestSnapDistY = distTopToOtherTop;
    }

    // My bottom to other's bottom (align edges)
    const distBottomToOtherBottom = Math.abs(objBottom - otherBottom);
    if (distBottomToOtherBottom <= objSnapTolerance && distBottomToOtherBottom < bestSnapDistY) {
      snappedYCm = otherBottom - objHeightCm;
      snappedY = true;
      yGuideCm = otherBottom;
      bestSnapDistY = distBottomToOtherBottom;
    }
  }

  return {
    xCm: snappedXCm,
    yCm: snappedYCm,
    snappedX,
    snappedY,
    xGuideCm,
    yGuideCm,
  };
}
