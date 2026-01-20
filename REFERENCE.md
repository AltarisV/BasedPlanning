// Quick Reference Guide for BasedPlanning Room Planner

/** ============================================================================
 * DEVELOPMENT QUICK START
 * ============================================================================ */

// Install dependencies:
// $ npm install

// Start development server (http://localhost:3000):
// $ npm run dev

// Build for production:
// $ npm run build
// $ npm start

/** ============================================================================
 * FILE ORGANIZATION
 * ============================================================================ */

/*
src/
├── model/
│   ├── types.ts         ← Room, AppState, WallThickness interfaces
│   └── state.ts         ← Pure state mutation functions
│
├── editor/
│   ├── Snap.ts          ← calculateSnap() for edge detection
│   ├── Renderer.ts      ← renderRoom(), renderSnapIndicators() for SVG
│   └── Interaction.ts   ← getSvgCoordinates(), findRoomAtPoint(), drag handling
│
├── storage/
│   └── localStorage.ts  ← saveState(), loadState(), export/import
│
└── utils/
    ├── scale.ts         ← cmToPixels(), pixelsToCm() (SCALE=5)
    └── geometry.ts      ← Rect, overlap detection, distance calc

app/
├── page.tsx             ← RoomEditor component (left/center/right panels)
└── layout.tsx           ← Root layout with metadata

styles/
├── globals.css          ← Global styles
└── tailwind.css         ← Tailwind directives

Root:
├── package.json         ← Dependencies
├── tsconfig.json        ← TypeScript config
├── tailwind.config.ts   ← Tailwind config
├── postcss.config.js    ← PostCSS config
├── next.config.ts       ← Next.js config
├── README.md            ← Full documentation
└── SETUP.md             ← Setup instructions
*/

/** ============================================================================
 * KEY CONCEPTS
 * ============================================================================ */

/* STATE MANAGEMENT
 * ──────────────────────────────────────────────────────────────────────── */

// AppState is the single source of truth:
interface AppState {
  rooms: Room[];                  // Array of rooms
  globalWallThicknessCm: number;  // Default wall thickness (12cm)
  selectedRoomId: string | null;  // Currently selected room
  panX: number;                   // Viewport pan X (pixels)
  panY: number;                   // Viewport pan Y (pixels)
  zoom: number;                   // Zoom level (1 = 100%)
}

// All mutations are pure functions in src/model/state.ts:
// - addRoom(state, name, widthCm, heightCm) → new AppState
// - deleteRoom(state, roomId) → new AppState
// - updateRoomPosition(state, roomId, xCm, yCm) → new AppState
// - updateRoomDimensions(state, roomId, widthCm, heightCm) → new AppState
// - updateGlobalWallThickness(state, thickness) → new AppState
// - ... and more

/* ROOM DATA MODEL
 * ──────────────────────────────────────────────────────────────────────── */

interface Room {
  id: string;              // Unique identifier
  name: string;            // Room name (e.g., "Living Room")
  xCm: number;             // Left edge position (centimeters)
  yCm: number;             // Top edge position (centimeters)
  widthCm: number;         // Width in centimeters
  heightCm: number;        // Height in centimeters
  wallThickness?: {        // Optional per-wall overrides
    north?: number;        // North wall thickness (cm)
    south?: number;        // South wall thickness (cm)
    east?: number;         // East wall thickness (cm)
    west?: number;         // West wall thickness (cm)
  };
}

// When a wall field is undefined, use globalWallThicknessCm

/* SCALING
 * ──────────────────────────────────────────────────────────────────────── */

// Scale factor: 1 cm = 5 pixels (defined in src/utils/scale.ts)
const SCALE = 5;

// All internal logic works in centimeters
// Conversion happens only during rendering
import { cmToPixels, pixelsToCm } from '@/src/utils/scale';

// Example:
const roomWidthPx = room.widthCm * SCALE;  // Convert to pixels for SVG
const svgXCm = svgXPx / SCALE;             // Convert back to cm for logic

/* SNAPPING
 * ──────────────────────────────────────────────────────────────────────── */

// Snap tolerance: 2 cm (defined in src/editor/Snap.ts)
const SNAP_TOLERANCE_CM = 2;  // = 10 pixels

// When dragging a room:
// 1. Calculate target position (xCm, yCm)
// 2. Call calculateSnap(movingRoom, allRooms, targetXCm, targetYCm)
// 3. Returns adjusted position with snap flags
// 4. Use adjusted position; render snap indicator lines if snapped

import { calculateSnap } from '@/src/editor/Snap';

const snapResult = calculateSnap(
  room,           // Room being moved
  allRooms,       // All rooms (for edge detection)
  newXCm,         // Target X position
  newYCm          // Target Y position
);
// snapResult.xCm, snapResult.yCm = final snapped position
// snapResult.snappedX, snapResult.snappedY = snap flags

/* PERSISTENCE
 * ──────────────────────────────────────────────────────────────────────── */

import {
  saveState,         // Save AppState to localStorage
  loadState,         // Load AppState from localStorage (or initial state)
  exportStateAsJson, // Download as JSON file
  importStateFromJson // Load from JSON file
} from '@/src/storage/localStorage';

// Auto-save on every state change:
// useEffect(() => { saveState(appState); }, [appState]);

// Manual export/import:
// handleExport() → exportStateAsJson(state)
// handleImport(file) → importStateFromJson(file)

/** ============================================================================
 * COMMON TASKS
 * ============================================================================ */

/* ADD A NEW FEATURE
 * ──────────────────────────────────────────────────────────────────────── */

// Example: Add room color

// 1. Extend the Room interface in src/model/types.ts:
interface Room {
  // ... existing fields ...
  color?: string;  // e.g., "#FF5733"
}

// 2. Add mutation functions in src/model/state.ts:
export function updateRoomColor(state: AppState, roomId: string, color: string): AppState {
  return {
    ...state,
    rooms: state.rooms.map(r => r.id === roomId ? { ...r, color } : r)
  };
}

// 3. Update the React component in app/page.tsx to:
//    - Add color input to RoomPropertiesPanel
//    - Call handleUpdateRoomColor() on change
//    - Pass color to SVG rendering

// 4. Update SVG rendering to use the color:
// <rect ... fill={room.color || 'rgba(229, 231, 235, 0.5)'} />

/* CHANGE SCALING
 * ──────────────────────────────────────────────────────────────────────── */

// Edit src/utils/scale.ts:
export const SCALE = 10;  // Now 1 cm = 10 pixels (instead of 5)

// Update SNAP_TOLERANCE_PX in src/editor/Snap.ts:
export const SNAP_TOLERANCE_PX = cmToPixels(SNAP_TOLERANCE_CM);
// This auto-adjusts based on new SCALE

/* CHANGE DEFAULT WALL THICKNESS
 * ──────────────────────────────────────────────────────────────────────── */

// Edit src/model/state.ts:
export function createInitialState(): AppState {
  return {
    // ...
    globalWallThicknessCm: 15,  // Changed from 12
    // ...
  };
}

/* ADD UNDO/REDO
 * ──────────────────────────────────────────────────────────────────────── */

// 1. Create src/history/History.ts with action history stack
// 2. Track mutations (create, delete, move, rename)
// 3. Implement undo/redo state mutations
// 4. Add UI buttons in RoomEditor
// 5. Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z)

/** ============================================================================
 * DEBUGGING TIPS
 * ============================================================================ */

// Console log in React component:
console.log('Current state:', appState);
console.log('Selected room:', selectedRoom);

// DevTools for localStorage:
// Open DevTools → Application → Local Storage → http://localhost:3000
// Look for key 'basedplanning_app_state' to inspect saved data

// Export state for debugging:
// Click "Export JSON" button, open downloaded file in text editor

// Check TypeScript errors:
// $ npm run build  // Shows all type errors

// Check Tailwind classes:
// Build includes all Tailwind utilities
// Check globals.css for custom styles

/** ============================================================================
 * TESTING
 * ============================================================================ */

// Snap logic test (src/editor/Snap.ts):
// 1. Create two rooms: Room A (0,0,100,100) and Room B (200,0,100,100)
// 2. Drag Room A toward Room B
// 3. When within 2cm (10px) of Room B's left edge, it should snap
// 4. Visual feedback: pink dashed line appears

// Persistence test:
// 1. Add a room
// 2. Refresh the page (F5)
// 3. Room should still be there (loaded from localStorage)

// Import/Export test:
// 1. Create a floor plan
// 2. Export to JSON
// 3. Clear localStorage (DevTools)
// 4. Refresh page (should be empty)
// 5. Import the JSON file
// 6. Floor plan should be restored

/** ============================================================================
 * PERFORMANCE NOTES
 * ============================================================================ */

// SVG rendering is efficient for:
// ✓ 10-100 rooms: No issues
// ✓ 100-500 rooms: Still smooth
// ✓ 500+ rooms: May start to lag (consider Canvas)

// localStorage limits:
// - Typical: 5-10MB per domain
// - Sufficient for most floor plans
// - Export to JSON if you need a backup

// Optimization opportunities:
// - Memoize room components with React.memo()
// - Use useCallback for event handlers
// - Consider Canvas rendering for huge plans
// - Implement virtual scrolling for room list

/** ============================================================================
 * RESOURCES
 * ============================================================================ */

// Documentation:
// - README.md     → Features & architecture overview
// - SETUP.md      → Installation & configuration
// - This file     → Quick reference

// Code organization:
// - Framework-agnostic logic in src/
// - React components in app/
// - Configuration in root (tsconfig, tailwind, etc.)

// Next.js App Router docs:
// https://nextjs.org/docs/app

// Tailwind CSS docs:
// https://tailwindcss.com/docs

// React docs:
// https://react.dev

// TypeScript docs:
// https://www.typescriptlang.org/docs/
