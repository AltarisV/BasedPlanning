/**
 * State initialization and mutation helpers.
 * All functions are pure and return new state objects.
 */

import { AppState, Room, WallThickness, HistoryState, WallOpening, WallSide, OpeningType } from './types';
import { ObjectDef, PlacedObject } from './types';

export function createInitialState(): AppState {
  return {
    rooms: [],
    globalWallThicknessCm: 12,
    selectedRoomIds: [],
    panX: 50,
    panY: 50,
    zoom: 1,
    objectDefs: [],
    placedObjects: [],
    wallOpenings: [],
  };
}

/**
 * Create initial history state
 */
export function createInitialHistory(): HistoryState {
  return {
    past: [],
    present: createInitialState(),
    future: [],
  };
}

/**
 * Record a state change in history (for undo/redo)
 * Call this before applying mutations that should be undoable
 */
export function recordHistory(history: HistoryState, newState: AppState): HistoryState {
  return {
    past: [...history.past, history.present],
    present: newState,
    future: [], // clear redo stack on new action
  };
}

/**
 * Undo: move present to future, pop past to present
 */
export function undo(history: HistoryState): HistoryState {
  if (history.past.length === 0) return history;
  
  const previous = history.past[history.past.length - 1];
  const newPast = history.past.slice(0, -1);
  
  return {
    past: newPast,
    present: previous,
    future: [history.present, ...history.future],
  };
}

/**
 * Redo: move present to past, pop future to present
 */
export function redo(history: HistoryState): HistoryState {
  if (history.future.length === 0) return history;
  
  const next = history.future[0];
  const newFuture = history.future.slice(1);
  
  return {
    past: [...history.past, history.present],
    present: next,
    future: newFuture,
  };
}

/**
 * Check if undo is available
 */
export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

/**
 * Check if redo is available
 */
export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

/**
 * Add a new room to the state.
 */
export function addRoom(
  state: AppState,
  name: string,
  widthCm: number,
  heightCm: number
): AppState {
  const newRoom: Room = {
    id: `room-${Date.now()}`,
    name,
    xCm: 50, // default starting position
    yCm: 50,
    widthCm,
    heightCm,
  };

  return {
    ...state,
    rooms: [...state.rooms, newRoom],
    selectedRoomIds: [newRoom.id],
  };
}

/**
 * Add a new object definition to the library
 */
export function addObjectDef(state: AppState, name: string, widthCm: number, heightCm: number): AppState {
  const def: ObjectDef = {
    id: `objdef-${Date.now()}`,
    name,
    widthCm,
    heightCm,
  };

  return {
    ...state,
    objectDefs: [...(state.objectDefs ?? []), def],
  };
}

/**
 * Delete all objects: both object definitions and placed objects
 */
export function deleteAllObjects(state: AppState): AppState {
  return {
    ...state,
    objectDefs: [],
    placedObjects: [],
    selectedObjectId: undefined,
  };
}

/**
 * Place an object into a room at absolute coordinates (cm)
 */
export function placeObject(
  state: AppState,
  defId: string,
  roomId: string,
  xCm: number,
  yCm: number
): AppState {
  const placed: PlacedObject = {
    id: `placed-${Date.now()}`,
    defId,
    roomId,
    xCm,
    yCm,
  };

  return {
    ...state,
    placedObjects: [...(state.placedObjects ?? []), placed],
  };
}

export function duplicatePlacedObject(state: AppState, placedId: string, offsetCm = 20): AppState {
  const existing = (state.placedObjects ?? []).find((p) => p.id === placedId);
  if (!existing) return state;
  const copy: PlacedObject = {
    ...existing,
    id: `placed-${Date.now()}`,
    xCm: existing.xCm + offsetCm,
    yCm: existing.yCm + offsetCm,
  };
  return {
    ...state,
    placedObjects: [...(state.placedObjects ?? []), copy],
  };
}

export function updatePlacedObjectPosition(state: AppState, placedId: string, xCm: number, yCm: number): AppState {
  return {
    ...state,
    placedObjects: (state.placedObjects ?? []).map((p) => (p.id === placedId ? { ...p, xCm, yCm } : p)),
  };
}

export function updatePlacedObjectRotation(state: AppState, placedId: string, rotationDeg: number): AppState {
  return {
    ...state,
    placedObjects: (state.placedObjects ?? []).map((p) => (p.id === placedId ? { ...p, rotationDeg } : p)),
  };
}

/**
 * Update the size of a placed object
 */
export function updatePlacedObjectSize(state: AppState, placedId: string, widthCm: number, heightCm: number): AppState {
  return {
    ...state,
    placedObjects: (state.placedObjects ?? []).map((p) => (p.id === placedId ? { ...p, widthCm, heightCm } : p)),
  };
}

/**
 * Get the effective size of a placed object (uses override or falls back to ObjectDef)
 */
export function getPlacedObjectSize(state: AppState, placedId: string): { widthCm: number; heightCm: number } | null {
  const placed = (state.placedObjects ?? []).find(p => p.id === placedId);
  if (!placed) return null;
  
  const def = state.objectDefs?.find(d => d.id === placed.defId);
  if (!def) return null;
  
  return {
    widthCm: placed.widthCm ?? def.widthCm,
    heightCm: placed.heightCm ?? def.heightCm,
  };
}

/**
 * Nudge the selected object by a delta amount (with automatic room detection)
 */
export function nudgeSelectedObject(state: AppState, dxCm: number, dyCm: number): AppState {
  if (!state.selectedObjectId) return state;
  
  const placed = (state.placedObjects ?? []).find(p => p.id === state.selectedObjectId);
  if (!placed) return state;
  
  const objectDef = state.objectDefs?.find(d => d.id === placed.defId);
  const newX = placed.xCm + dxCm;
  const newY = placed.yCm + dyCm;
  
  // Find room at new position
  const newRoomId = findRoomAtPosition(state, newX, newY, objectDef?.widthCm ?? 0, objectDef?.heightCm ?? 0);
  
  return {
    ...state,
    placedObjects: (state.placedObjects ?? []).map((p) => 
      p.id === state.selectedObjectId 
        ? { ...p, xCm: newX, yCm: newY, roomId: newRoomId ?? p.roomId } 
        : p
    ),
  };
}

/**
 * Update the room that a placed object belongs to
 */
export function updatePlacedObjectRoom(state: AppState, placedId: string, roomId: string): AppState {
  return {
    ...state,
    placedObjects: (state.placedObjects ?? []).map((p) => (p.id === placedId ? { ...p, roomId } : p)),
  };
}

/**
 * Find which room contains the given point (object center)
 * Returns the room id or null if no room contains the point
 */
export function findRoomAtPosition(state: AppState, xCm: number, yCm: number, objectWidthCm: number = 0, objectHeightCm: number = 0): string | null {
  // Check from the center of the object
  const centerX = xCm + objectWidthCm / 2;
  const centerY = yCm + objectHeightCm / 2;
  
  for (const room of state.rooms) {
    if (
      centerX >= room.xCm &&
      centerX <= room.xCm + room.widthCm &&
      centerY >= room.yCm &&
      centerY <= room.yCm + room.heightCm
    ) {
      return room.id;
    }
  }
  return null;
}

/**
 * Update placed object position and automatically detect & update its room
 */
export function updatePlacedObjectPositionWithRoomDetection(
  state: AppState,
  placedId: string,
  xCm: number,
  yCm: number
): AppState {
  const placed = (state.placedObjects ?? []).find((p) => p.id === placedId);
  if (!placed) return state;
  
  const def = (state.objectDefs ?? []).find((d) => d.id === placed.defId);
  if (!def) return state;
  
  // Find which room the object is now in
  const newRoomId = findRoomAtPosition(state, xCm, yCm, def.widthCm, def.heightCm);
  
  return {
    ...state,
    placedObjects: (state.placedObjects ?? []).map((p) =>
      p.id === placedId
        ? { ...p, xCm, yCm, roomId: newRoomId ?? p.roomId }
        : p
    ),
  };
}

export function deletePlacedObject(state: AppState, placedId: string): AppState {
  return {
    ...state,
    placedObjects: (state.placedObjects ?? []).filter((p) => p.id !== placedId),
  };
}

/**
 * Delete a room from the state.
 */
export function deleteRoom(state: AppState, roomId: string): AppState {
  return {
    ...state,
    rooms: state.rooms.filter((r) => r.id !== roomId),
    selectedRoomIds: state.selectedRoomIds.filter((id) => id !== roomId),
  };
}

/**
 * Delete multiple rooms from the state.
 */
export function deleteRooms(state: AppState, roomIds: string[]): AppState {
  const idsSet = new Set(roomIds);
  return {
    ...state,
    rooms: state.rooms.filter((r) => !idsSet.has(r.id)),
    selectedRoomIds: state.selectedRoomIds.filter((id) => !idsSet.has(id)),
  };
}

/**
 * Update a room's position (when dragging).
 */
export function updateRoomPosition(
  state: AppState,
  roomId: string,
  xCm: number,
  yCm: number
): AppState {
  return {
    ...state,
    rooms: state.rooms.map((r) =>
      r.id === roomId ? { ...r, xCm, yCm } : r
    ),
  };
}

/**
 * Update a room's dimensions.
 */
export function updateRoomDimensions(
  state: AppState,
  roomId: string,
  widthCm: number,
  heightCm: number
): AppState {
  return {
    ...state,
    rooms: state.rooms.map((r) =>
      r.id === roomId ? { ...r, widthCm, heightCm } : r
    ),
  };
}

/**
 * Update a room's name.
 */
export function updateRoomName(
  state: AppState,
  roomId: string,
  name: string
): AppState {
  return {
    ...state,
    rooms: state.rooms.map((r) =>
      r.id === roomId ? { ...r, name } : r
    ),
  };
}

/**
 * Update a room's wall thickness overrides.
 */
export function updateRoomWallThickness(
  state: AppState,
  roomId: string,
  wallThickness: WallThickness | undefined
): AppState {
  return {
    ...state,
    rooms: state.rooms.map((r) =>
      r.id === roomId ? { ...r, wallThickness } : r
    ),
  };
}

/**
 * Update the global default wall thickness.
 */
export function updateGlobalWallThickness(
  state: AppState,
  thickness: number
): AppState {
  return {
    ...state,
    globalWallThicknessCm: thickness,
  };
}

/**
 * Select a single room (replaces current selection, clears object selection).
 */
export function selectRoom(state: AppState, roomId: string | null): AppState {
  return {
    ...state,
    selectedRoomIds: roomId ? [roomId] : [],
    selectedObjectId: undefined, // Clear object selection
  };
}

/**
 * Toggle room selection (for multi-select with Shift+click).
 */
export function toggleRoomSelection(state: AppState, roomId: string): AppState {
  const isSelected = state.selectedRoomIds.includes(roomId);
  return {
    ...state,
    selectedRoomIds: isSelected
      ? state.selectedRoomIds.filter((id) => id !== roomId)
      : [...state.selectedRoomIds, roomId],
    selectedObjectId: undefined, // Clear object selection
  };
}

/**
 * Add room to selection (for multi-select).
 */
export function addToSelection(state: AppState, roomId: string): AppState {
  if (state.selectedRoomIds.includes(roomId)) return state;
  return {
    ...state,
    selectedRoomIds: [...state.selectedRoomIds, roomId],
    selectedObjectId: undefined, // Clear object selection
  };
}

/**
 * Clear all room selection.
 */
export function clearSelection(state: AppState): AppState {
  return {
    ...state,
    selectedRoomIds: [],
    selectedObjectId: undefined, // Also clear object selection
  };
}

/**
 * Select all rooms.
 */
export function selectAllRooms(state: AppState): AppState {
  return {
    ...state,
    selectedRoomIds: state.rooms.map((r) => r.id),
    selectedObjectId: undefined, // Clear object selection
  };
}

/**
 * Select a placed object (clears room selection).
 */
export function selectObject(state: AppState, objectId: string | null): AppState {
  return {
    ...state,
    selectedRoomIds: [], // Clear room selection
    selectedObjectId: objectId ?? undefined,
  };
}

/**
 * Delete selected placed object.
 */
export function deleteSelectedObject(state: AppState): AppState {
  if (!state.selectedObjectId) return state;
  return {
    ...state,
    placedObjects: (state.placedObjects ?? []).filter((p) => p.id !== state.selectedObjectId),
    selectedObjectId: undefined,
  };
}

/**
 * Move multiple rooms by delta (for multi-select drag).
 * Respects locked rooms - they won't be moved.
 */
export function moveRooms(
  state: AppState,
  roomMoves: Array<{ id: string; xCm: number; yCm: number }>
): AppState {
  const movesMap = new Map(roomMoves.map((m) => [m.id, m]));
  return {
    ...state,
    rooms: state.rooms.map((r) => {
      if (r.locked) return r; // Don't move locked rooms
      const move = movesMap.get(r.id);
      return move ? { ...r, xCm: move.xCm, yCm: move.yCm } : r;
    }),
  };
}

/**
 * Nudge selected rooms by delta (for arrow key movement).
 * Respects locked rooms - they won't be moved.
 */
export function nudgeSelectedRooms(
  state: AppState,
  deltaXCm: number,
  deltaYCm: number
): AppState {
  const selectedSet = new Set(state.selectedRoomIds);
  return {
    ...state,
    rooms: state.rooms.map((r) =>
      selectedSet.has(r.id) && !r.locked
        ? { ...r, xCm: Math.max(0, r.xCm + deltaXCm), yCm: Math.max(0, r.yCm + deltaYCm) }
        : r
    ),
  };
}

/**
 * Resize a room (for drag-to-resize).
 * Respects locked rooms - they won't be resized.
 */
export function resizeRoom(
  state: AppState,
  roomId: string,
  xCm: number,
  yCm: number,
  widthCm: number,
  heightCm: number
): AppState {
  const room = state.rooms.find(r => r.id === roomId);
  if (room?.locked) return state; // Don't resize locked rooms
  
  return {
    ...state,
    rooms: state.rooms.map((r) =>
      r.id === roomId
        ? { ...r, xCm, yCm, widthCm: Math.max(10, widthCm), heightCm: Math.max(10, heightCm) }
        : r
    ),
  };
}

/**
 * Update pan/zoom.
 */
export function updateViewport(
  state: AppState,
  panX: number,
  panY: number,
  zoom: number
): AppState {
  return {
    ...state,
    panX,
    panY,
    zoom,
  };
}

/**
 * Get a room by ID.
 */
export function getRoomById(state: AppState, roomId: string): Room | undefined {
  return state.rooms.find((r) => r.id === roomId);
}

/**
 * Toggle room locked state.
 */
export function toggleRoomLock(state: AppState, roomId: string): AppState {
  return {
    ...state,
    rooms: state.rooms.map((r) =>
      r.id === roomId ? { ...r, locked: !r.locked } : r
    ),
  };
}

/**
 * Lock or unlock all rooms at once.
 */
export function setAllRoomsLocked(state: AppState, locked: boolean): AppState {
  return {
    ...state,
    rooms: state.rooms.map((r) => ({ ...r, locked })),
  };
}

/**
 * Check if all rooms are locked.
 */
export function areAllRoomsLocked(state: AppState): boolean {
  return state.rooms.length > 0 && state.rooms.every((r) => r.locked);
}

/**
 * Replace entire state (for loading from storage).
 */
export function loadState(state: AppState): AppState {
  return state;
}

// ============================================================
// Wall Openings (Doors/Windows)
// ============================================================

/**
 * Add a wall opening (door or window) to a room.
 */
export function addWallOpening(
  state: AppState,
  roomId: string,
  wall: WallSide,
  type: OpeningType,
  positionCm: number,
  widthCm: number
): AppState {
  const opening: WallOpening = {
    id: `opening-${Date.now()}`,
    roomId,
    wall,
    type,
    positionCm,
    widthCm,
  };

  return {
    ...state,
    wallOpenings: [...(state.wallOpenings ?? []), opening],
  };
}

/**
 * Update a wall opening's position, width, and/or type.
 */
export function updateWallOpening(
  state: AppState,
  openingId: string,
  positionCm?: number,
  widthCm?: number,
  type?: OpeningType
): AppState {
  return {
    ...state,
    wallOpenings: (state.wallOpenings ?? []).map((o) =>
      o.id === openingId
        ? {
            ...o,
            ...(positionCm !== undefined && { positionCm }),
            ...(widthCm !== undefined && { widthCm }),
            ...(type !== undefined && { type }),
          }
        : o
    ),
  };
}

/**
 * Delete a wall opening.
 */
export function deleteWallOpening(state: AppState, openingId: string): AppState {
  return {
    ...state,
    wallOpenings: (state.wallOpenings ?? []).filter((o) => o.id !== openingId),
  };
}

/**
 * Get all openings for a specific room.
 */
export function getOpeningsForRoom(state: AppState, roomId: string): WallOpening[] {
  return (state.wallOpenings ?? []).filter((o) => o.roomId === roomId);
}

/**
 * Get all openings for a specific wall of a room.
 */
export function getOpeningsForWall(state: AppState, roomId: string, wall: WallSide): WallOpening[] {
  return (state.wallOpenings ?? []).filter((o) => o.roomId === roomId && o.wall === wall);
}

/**
 * Get the maximum position for a wall opening (depends on wall length).
 */
export function getWallLength(room: Room, wall: WallSide): number {
  if (wall === 'north' || wall === 'south') {
    return room.widthCm;
  }
  return room.heightCm;
}

/**
 * Information about a shared wall between two rooms.
 */
export interface SharedWallInfo {
  otherRoom: Room;
  otherWall: WallSide;
  /** The overlap range in cm along the wall (relative to this room's wall) */
  overlapStart: number;
  overlapEnd: number;
}

/**
 * Get the opposite wall side.
 */
export function getOppositeWall(wall: WallSide): WallSide {
  switch (wall) {
    case 'north': return 'south';
    case 'south': return 'north';
    case 'east': return 'west';
    case 'west': return 'east';
  }
}

/**
 * Check if two 1D ranges overlap significantly.
 * Returns the overlap range or null if no overlap or overlap is too small.
 * Requires at least minOverlap to count as overlapping.
 */
function rangesOverlap(
  start1: number, end1: number,
  start2: number, end2: number,
  minOverlap: number = 1
): { start: number; end: number } | null {
  const overlapStart = Math.max(start1, start2);
  const overlapEnd = Math.min(end1, end2);
  if (overlapEnd - overlapStart >= minOverlap) {
    return { start: overlapStart, end: overlapEnd };
  }
  return null;
}

/**
 * Check if two rooms' walls actually overlap (occupy the same space).
 * Walls overlap when one room's OUTER wall edge meets another room's INNER edge.
 * We check both directions since either room could have been the one that snapped.
 */
export function findAdjacentRoom(
  state: AppState,
  room: Room,
  wall: WallSide
): SharedWallInfo | null {
  // Get this room's wall thickness for the specific wall
  const myWallThickness = room.wallThickness?.[wall] ?? state.globalWallThicknessCm;
  
  // Calculate this room's inner bounds
  const roomLeft = room.xCm;
  const roomRight = room.xCm + room.widthCm;
  const roomTop = room.yCm;
  const roomBottom = room.yCm + room.heightCm;
  
  for (const other of state.rooms) {
    if (other.id === room.id) continue;
    
    const otherWall = getOppositeWall(wall);
    const otherWallThickness = other.wallThickness?.[otherWall] ?? state.globalWallThicknessCm;
    
    const otherLeft = other.xCm;
    const otherRight = other.xCm + other.widthCm;
    const otherTop = other.yCm;
    const otherBottom = other.yCm + other.heightCm;
    
    // Check if walls overlap - check BOTH directions since either room could have snapped
    let isAdjacent = false;
    let parallelOverlap: { start: number; end: number } | null = null;
    
    switch (wall) {
      case 'north':
        // Check: my outer top meets other's inner bottom OR other's outer bottom meets my inner top
        {
          const myOuterTop = roomTop - myWallThickness;
          const otherOuterBottom = otherBottom + otherWallThickness;
          if (Math.abs(myOuterTop - otherBottom) < 1 || Math.abs(otherOuterBottom - roomTop) < 1) {
            parallelOverlap = rangesOverlap(roomLeft, roomRight, otherLeft, otherRight, 5);
            isAdjacent = parallelOverlap !== null;
          }
        }
        break;
        
      case 'south':
        // Check: my outer bottom meets other's inner top OR other's outer top meets my inner bottom
        {
          const myOuterBottom = roomBottom + myWallThickness;
          const otherOuterTop = otherTop - otherWallThickness;
          if (Math.abs(myOuterBottom - otherTop) < 1 || Math.abs(otherOuterTop - roomBottom) < 1) {
            parallelOverlap = rangesOverlap(roomLeft, roomRight, otherLeft, otherRight, 5);
            isAdjacent = parallelOverlap !== null;
          }
        }
        break;
        
      case 'east':
        // Check: my outer right meets other's inner left OR other's outer left meets my inner right
        {
          const myOuterRight = roomRight + myWallThickness;
          const otherOuterLeft = otherLeft - otherWallThickness;
          if (Math.abs(myOuterRight - otherLeft) < 1 || Math.abs(otherOuterLeft - roomRight) < 1) {
            parallelOverlap = rangesOverlap(roomTop, roomBottom, otherTop, otherBottom, 5);
            isAdjacent = parallelOverlap !== null;
          }
        }
        break;
        
      case 'west':
        // Check: my outer left meets other's inner right OR other's outer right meets my inner left
        {
          const myOuterLeft = roomLeft - myWallThickness;
          const otherOuterRight = otherRight + otherWallThickness;
          if (Math.abs(myOuterLeft - otherRight) < 1 || Math.abs(otherOuterRight - roomLeft) < 1) {
            parallelOverlap = rangesOverlap(roomTop, roomBottom, otherTop, otherBottom, 5);
            isAdjacent = parallelOverlap !== null;
          }
        }
        break;
    }
    
    if (isAdjacent && parallelOverlap) {
      const isHorizontal = wall === 'north' || wall === 'south';
      let overlapStart: number;
      let overlapEnd: number;
      
      if (isHorizontal) {
        overlapStart = parallelOverlap.start - roomLeft;
        overlapEnd = parallelOverlap.end - roomLeft;
      } else {
        overlapStart = parallelOverlap.start - roomTop;
        overlapEnd = parallelOverlap.end - roomTop;
      }
      
      return {
        otherRoom: other,
        otherWall,
        overlapStart,
        overlapEnd,
      };
    }
  }
  
  return null;
}

/**
 * Determine if this room should render a shared wall.
 * Uses room ID comparison to ensure only one room renders the shared wall.
 * The room with the lexicographically smaller ID renders the wall.
 */
export function shouldRenderSharedWall(room: Room, otherRoom: Room): boolean {
  return room.id < otherRoom.id;
}

/**
 * Get combined openings for a shared wall (from both rooms).
 * Translates the other room's openings to this room's coordinate system.
 */
export function getCombinedWallOpenings(
  state: AppState,
  room: Room,
  wall: WallSide,
  sharedWall: SharedWallInfo
): WallOpening[] {
  const myOpenings = getOpeningsForWall(state, room.id, wall);
  const otherOpenings = getOpeningsForWall(state, sharedWall.otherRoom.id, sharedWall.otherWall);
  
  // Translate other room's openings to this room's coordinate system
  const isHorizontal = wall === 'north' || wall === 'south';
  const myWallLength = isHorizontal ? room.widthCm : room.heightCm;
  const otherWallLength = isHorizontal ? sharedWall.otherRoom.widthCm : sharedWall.otherRoom.heightCm;
  
  // Calculate offset between the two rooms' walls
  let offset: number;
  if (isHorizontal) {
    offset = sharedWall.otherRoom.xCm - room.xCm;
  } else {
    offset = sharedWall.otherRoom.yCm - room.yCm;
  }
  
  const translatedOpenings: WallOpening[] = otherOpenings.map(o => ({
    ...o,
    positionCm: o.positionCm + offset,
  })).filter(o => {
    // Only include openings that fall within the shared overlap
    return o.positionCm >= 0 && o.positionCm + o.widthCm <= myWallLength;
  });
  
  return [...myOpenings, ...translatedOpenings];
}
