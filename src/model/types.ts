/**
 * Core TypeScript types for the room planning app.
 * All dimensions are in centimeters (cm).
 */

export interface WallThickness {
  north?: number; // cm, optional override
  south?: number; // cm, optional override
  east?: number; // cm, optional override
  west?: number; // cm, optional override
}

/** Which wall of a room */
export type WallSide = 'north' | 'south' | 'east' | 'west';

/** Opening type (door, window, or passage) */
export type OpeningType = 'door' | 'window' | 'passage';

/** A door or window opening in a wall */
export interface WallOpening {
  id: string;
  roomId: string;
  wall: WallSide; // which wall the opening is on
  type: OpeningType;
  positionCm: number; // distance from the left/top edge of the wall (cm)
  widthCm: number; // width of the opening (cm)
  // Door swing properties
  swingSide?: 'left' | 'right'; // which end of the opening is the hinge (default: 'left')
  swingDirection?: 'inward' | 'outward'; // swing into or out of the room (default: 'inward')
}

/** Per-wall length overrides for non-rectangular rooms */
export interface WallLengths {
  north?: number; // cm, top wall length (defaults to widthCm)
  south?: number; // cm, bottom wall length (defaults to widthCm)
  east?: number;  // cm, right wall length (defaults to heightCm)
  west?: number;  // cm, left wall length (defaults to heightCm)
}

export interface Room {
  id: string;
  name: string;
  xCm: number; // left edge position in cm (NW corner anchor)
  yCm: number; // top edge position in cm (NW corner anchor)
  widthCm: number; // bounding box width in cm
  heightCm: number; // bounding box height in cm
  wallThickness?: WallThickness; // optional per-wall overrides
  wallLengths?: WallLengths; // optional per-wall length overrides for non-rectangular rooms
  locked?: boolean; // if true, room cannot be moved or resized
}

export interface ObjectDef {
  id: string;
  name: string;
  widthCm: number;
  heightCm: number;
  // future: shape type, metadata
}

export interface PlacedObject {
  id: string;
  defId: string;
  roomId: string; // which room it's placed in
  xCm: number; // position in cm (absolute, same coordinate space as rooms)
  yCm: number;
  rotationDeg?: number;
  widthCm?: number; // optional size override (defaults to ObjectDef size)
  heightCm?: number;
}

export interface AppState {
  rooms: Room[];
  globalWallThicknessCm: number; // default wall thickness in cm
  selectedRoomIds: string[]; // multi-select support (array of selected room IDs)
  selectedObjectId?: string; // selected placed object ID (mutually exclusive with room selection)
  panX: number; // SVG pan offset in pixels
  panY: number; // SVG pan offset in pixels
  zoom: number; // zoom level (1 = 100%)
  objectDefs?: ObjectDef[];
  placedObjects?: PlacedObject[];
  wallOpenings?: WallOpening[]; // doors and windows
}

/** Active tool mode */
export type ToolMode = 'select' | 'measure' | 'addDoor';

/** Measurement point for the measure tool */
export interface MeasurePoint {
  xCm: number;
  yCm: number;
}

/** History state for undo/redo functionality */
export interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

export interface DragState {
  roomId: string; // Can be a real room ID or '__pan__' for panning
  startX: number; // starting mouse X in SVG coords (or clientX for pan)
  startY: number; // starting mouse Y in SVG coords (or clientY for pan)
  roomStartX: number; // room's xCm at drag start (or panX for pan)
  roomStartY: number; // room's yCm at drag start (or panY for pan)
}

export type DragTargetType = 'room' | 'placed' | 'pan' | 'resize';

/** Resize handle positions */
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface ExtendedDragState extends DragState {
  targetType?: DragTargetType;
  resizeHandle?: ResizeHandle; // which handle is being dragged
  initialRoom?: Room; // room state at drag start (for resize)
  /** For multi-select drag: initial positions of all selected rooms */
  multiDragRooms?: Array<{ id: string; startXCm: number; startYCm: number }>;
}

export interface SnapPoint {
  xCm?: number;
  yCm?: number;
  snap: boolean;
}
