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

/** Opening type (door or window) */
export type OpeningType = 'door' | 'window';

/** A door or window opening in a wall */
export interface WallOpening {
  id: string;
  roomId: string;
  wall: WallSide; // which wall the opening is on
  type: OpeningType;
  positionCm: number; // distance from the left/top edge of the wall (cm)
  widthCm: number; // width of the opening (cm)
  // For doors: swing direction could be added later
}

export interface Room {
  id: string;
  name: string;
  xCm: number; // left edge position in cm
  yCm: number; // top edge position in cm
  widthCm: number; // width in cm
  heightCm: number; // height in cm
  wallThickness?: WallThickness; // optional per-wall overrides
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
