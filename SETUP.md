#!/bin/bash

# BasedPlanning Room Planner - Quick Setup Guide

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build for Production

```bash
npm run build
npm start
```

---

## 📂 Project Files Created

### Core Logic (TypeScript, Framework-Agnostic)
- `src/model/types.ts` - Data interfaces (Room, AppState, etc.)
- `src/model/state.ts` - Immutable state mutations
- `src/editor/Snap.ts` - Edge-snapping logic (2cm tolerance)
- `src/editor/Renderer.ts` - SVG rendering helpers
- `src/editor/Interaction.ts` - Mouse/drag event handlers
- `src/storage/localStorage.ts` - Persistence (load/save/export/import)
- `src/utils/scale.ts` - Unit conversion (cm ↔ pixels, SCALE=5)
- `src/utils/geometry.ts` - Geometric utilities

### React Components
- `app/page.tsx` - Main RoomEditor component (3-panel layout)
- `app/layout.tsx` - Root layout with fonts and metadata

### Configuration & Styling
- `tailwind.config.ts` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS configuration
- `tsconfig.json` - TypeScript configuration
- `next.config.ts` - Next.js configuration
- `styles/globals.css` - Global styles
- `styles/tailwind.css` - Tailwind directives
- `package.json` - Dependencies and scripts

### Documentation
- `README.md` - Full documentation

---

## ✨ Key Features Implemented

✅ **Room Management**
- Create rooms with real-world cm measurements
- Drag & drop to move rooms in the SVG editor
- Click to select, properties panel to edit

✅ **Smart Snapping**
- Automatic edge snapping (2cm tolerance)
- Visual feedback with dashed pink lines
- Works on x/y axes independently

✅ **Wall Thickness**
- Global default setting (12cm)
- Optional per-wall overrides (north/south/east/west)
- UI inputs for all configurations

✅ **SVG Editor**
- Zoom with scroll wheel
- Pan with mouse drag on empty space
- Room labels with dimensions

✅ **Data Persistence**
- Auto-saves to localStorage on every change
- JSON export (download floor plan)
- JSON import (load saved floor plan)

---

## 🛠️ Architecture Overview

### State Management
```
AppState (single source of truth)
├── rooms[] (Room objects)
├── globalWallThicknessCm
├── selectedRoomId
├── panX, panY, zoom (viewport)
```

All mutations are pure functions that return new state.

### Editor Logic
- **Snap.ts**: `calculateSnap()` - detects nearby edges
- **Renderer.ts**: `renderRoom()`, `renderSnapIndicators()` - SVG generation
- **Interaction.ts**: `getSvgCoordinates()`, `findRoomAtPoint()` - mouse handling
- **Scale.ts**: `cmToPixels()`, `pixelsToCm()` - unit conversion

### React Layer
- Hooks orchestrate state and event handling
- Auto-persists to localStorage on state change
- Loads initial state from localStorage on mount

---

## 📊 Scaling Details

- **1 cm = 5 pixels** (configurable in `src/utils/scale.ts`)
- All internal logic works in centimeters
- Rendering converts to pixels for SVG display
- Snap tolerance: 2cm (10 pixels)

---

## 🔧 Configuration

### Change Pixel Scale
Edit `src/utils/scale.ts`:
```typescript
export const SCALE = 5; // Change this to adjust cm→px ratio
```

### Change Default Wall Thickness
Edit `src/model/state.ts`:
```typescript
globalWallThicknessCm: 12, // Change default
```

### Change Snap Tolerance
Edit `src/editor/Snap.ts`:
```typescript
export const SNAP_TOLERANCE_CM = 2; // Change tolerance in cm
```

---

## 📦 Dependencies

Only essential packages:
- `next` (15.x) - Framework
- `react` (19.x) - UI library
- `react-dom` (19.x) - React DOM bindings
- `tailwindcss` (4.x) - CSS framework
- `postcss` + `autoprefixer` - CSS processing
- `typescript` - Type checking

---

## 🎯 Next Steps (Future Extensions)

The architecture supports easy additions:
- **Grid snapping** - Add grid detection to Snap.ts
- **Furniture** - Extend Room model with furniture items
- **Rotation** - Add rotation angle to Room
- **Undo/Redo** - Implement action history
- **Backend API** - Add API routes for cloud sync
- **3D View** - Use Three.js for 3D visualization
- **PDF Export** - Generate downloadable floor plans

---

## 📝 Notes

- **No backend required** - Fully client-side
- **No database** - All data in localStorage (5-10MB limit)
- **Pure TypeScript** - Strict mode enabled
- **Optimized for 100+ rooms** - Use Canvas/WebGL for 1000+

---

**Happy planning!** 🏠

Made with ❤️ as a complete, production-ready room planner.
