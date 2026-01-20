# BasedPlanning - Room Planner

A no-bullshit room planning web app built with Next.js, React, TypeScript, and Tailwind CSS.

## Features

- **Room Creation**: Add rooms with real-world measurements in centimeters
- **SVG Editor**: Drag & drop rooms, pan, and zoom
- **Smart Snapping**: Automatic edge snapping when dragging rooms (2cm tolerance)
- **Wall Thickness**: Global default + per-wall per-room overrides (north/south/east/west)
- **Persistence**: Auto-save to localStorage, manual JSON export/import
- **No Backend**: Fully client-side, no database required
- **Pure TypeScript**: Framework-agnostic editor logic, easy to extend

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Rendering**: SVG
- **Storage**: Browser localStorage + JSON import/export

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Features in Detail

### Room Creation
- Add rooms with name, width, and height in centimeters
- Default starting position at (50cm, 50cm)

### SVG Editor
- Drag rooms to move them
- Click to select rooms
- Scroll to zoom in/out
- Pan and viewport tracking

### Smart Snapping
- Rooms snap to nearby edges (2cm tolerance)
- Visual feedback with pink dashed lines during drag
- Prevents overlapping layouts

### Wall Thickness
- Global default setting (12cm by default)
- Optional per-wall overrides per room (north/south/east/west)
- Easy configuration via UI

### Persistence
- Auto-saves to browser localStorage on every change
- Manual JSON export (download floor plan)
- Manual JSON import (load saved floor plan)

## Architecture

### State Management
- Single immutable `AppState` object
- Pure mutation functions (no side effects)
- React hooks for UI orchestration

### Editor Logic
- Framework-agnostic TypeScript modules:
  - **Snap.ts**: Edge detection & snapping
  - **Renderer.ts**: SVG generation
  - **Interaction.ts**: Mouse event handling
  - **Scale.ts**: Unit conversion (cm ↔ px)
  - **Geometry.ts**: Math utilities

### Scaling
- SCALE factor: 1 cm = 5 pixels
- All internal logic in centimeters
- Configurable in `src/utils/scale.ts`

## File Structure

```
├── app/
│   ├── page.tsx          # Main RoomEditor component
│   └── layout.tsx        # Root layout
├── src/
│   ├── model/
│   │   ├── types.ts      # Core interfaces
│   │   └── state.ts      # Immutable state mutations
│   ├── editor/
│   │   ├── Snap.ts       # Snapping logic
│   │   ├── Renderer.ts   # SVG rendering
│   │   └── Interaction.ts # Mouse/drag handling
│   ├── storage/
│   │   └── localStorage.ts # Persistence
│   └── utils/
│       ├── scale.ts      # Unit conversion
│       └── geometry.ts   # Geometric helpers
├── styles/
│   ├── globals.css
│   └── tailwind.css
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
└── next.config.ts
```

## Future Extensions

The clean architecture makes it easy to add:

- Grid snapping
- Furniture objects
- Room rotation
- Undo/redo
- Backend API integration
- Real-time collaboration
- 3D visualization
- PDF export

## Notes

- Fully client-side (no backend required)
- localStorage limited to ~5-10MB per domain
- Optimized for 100+ rooms; consider Canvas for 1000+
- All code is TypeScript with strict type checking

---

**Happy planning!** 🏠
