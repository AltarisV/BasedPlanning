'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AppState, DragState, Room, HistoryState, ExtendedDragState, ResizeHandle, ToolMode, MeasurePoint, WallSide, WallOpening } from '@/src/model/types';
import * as State from '@/src/model/state';
import * as Interaction from '@/src/editor/Interaction';
import * as Snap from '@/src/editor/Snap';
import * as Renderer from '@/src/editor/Renderer';
import {
  saveState,
  loadState,
  exportStateAsJson,
  importStateFromJson,
} from '@/src/storage/localStorage';

const SCALE = 5; // 1cm = 5px
const NUDGE_AMOUNT = 5; // cm per arrow key press
const NUDGE_AMOUNT_SHIFT = 20; // cm per Shift+arrow key press
const DEFAULT_DOOR_WIDTH = 90; // cm (standard door width)

/**
 * Main room editor component with three-panel layout:
 * - Left: Add room form + global settings
 * - Center: SVG editor with pan, zoom, drag
 * - Right: Selected room properties
 */
export default function RoomEditor() {
  // Use history state for undo/redo
  const [history, setHistory] = useState<HistoryState>(() => State.createInitialHistory());
  const appState = history.present;
  
  // Tool mode state
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
  
  // Helper to update state with history tracking
  const updateState = useCallback((newState: AppState, recordInHistory = true) => {
    setHistory((prev) => {
      if (recordInHistory) {
        return State.recordHistory(prev, newState);
      }
      // Update present without recording (for viewport changes, drags in progress)
      return { ...prev, present: newState };
    });
  }, []);
  
  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    setHistory((prev) => State.undo(prev));
  }, []);
  
  const handleRedo = useCallback(() => {
    setHistory((prev) => State.redo(prev));
  }, []);
  
  const [dragState, setDragState] = useState<ExtendedDragState | null>(null);
  const [currentSnapResult, setCurrentSnapResult] = useState<Snap.SnapResult | null>(null);
  const [svgDimensions, setSvgDimensions] = useState({ width: 1000, height: 1000 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Types for label positions
  type RoomLabelPos = { roomId: string; x: number; y: number; isSelected: boolean };
  type PlacedLabelPos = { placedId: string; x: number; y: number };

  // Calculate label positions in screen pixels accounting for SVG viewBox mapping
  const { roomLabelPositions, placedLabelPositions } = useMemo((): { roomLabelPositions: RoomLabelPos[]; placedLabelPositions: PlacedLabelPos[] } => {
    const vbSize = 10000; // viewBox 0..10000
    const svgEl = svgRef.current;
    if (!svgEl) return { roomLabelPositions: [], placedLabelPositions: [] };

    const rect = svgEl.getBoundingClientRect();
    const scaleToScreen = Math.min(rect.width / vbSize, rect.height / vbSize);
    const offsetX = (rect.width - vbSize * scaleToScreen) / 2;
    const offsetY = (rect.height - vbSize * scaleToScreen) / 2;

    const rooms: RoomLabelPos[] = appState.rooms.map((room) => {
      const contentX = room.xCm * SCALE + (room.widthCm * SCALE) / 2; // center X in content-space
      const contentY = room.yCm * SCALE; // top Y in content-space

      // apply <g transform="translate(panX panY) scale(zoom)">
      const transformedX = appState.panX + appState.zoom * contentX;
      const transformedY = appState.panY + appState.zoom * contentY;

      const screenX = offsetX + transformedX * scaleToScreen;
      const screenY = offsetY + transformedY * scaleToScreen;

      return { roomId: room.id, x: screenX, y: screenY, isSelected: appState.selectedRoomIds.includes(room.id) };
    });

    const placed: PlacedLabelPos[] = (appState.placedObjects ?? []).map((p) => {
      const def = appState.objectDefs?.find((d) => d.id === p.defId);
      if (!def) return null;
      const contentX = p.xCm * SCALE + (def.widthCm * SCALE) / 2;
      const contentY = p.yCm * SCALE + (def.heightCm * SCALE) / 2;
      const transformedX = appState.panX + appState.zoom * contentX;
      const transformedY = appState.panY + appState.zoom * contentY;
      const screenX = offsetX + transformedX * scaleToScreen;
      const screenY = offsetY + transformedY * scaleToScreen;
      return { placedId: p.id, x: screenX, y: screenY };
    }).filter((p): p is PlacedLabelPos => p !== null);

    return { roomLabelPositions: rooms, placedLabelPositions: placed };
  }, [appState.rooms, appState.placedObjects, appState.objectDefs, appState.panX, appState.panY, appState.zoom, appState.selectedRoomIds, svgDimensions]);

  // Load state from localStorage on mount
  useEffect(() => {
    const loaded = loadState() as any; // Cast to any for backward compatibility
    // Migrate old selectedRoomId to selectedRoomIds if needed
    const migratedState: AppState = {
      ...loaded,
      selectedRoomIds: loaded.selectedRoomIds ?? (loaded.selectedRoomId ? [loaded.selectedRoomId] : []),
    };
    setHistory({ past: [], present: migratedState, future: [] });
  }, []);

  // Measure SVG dimensions
  useEffect(() => {
    const measureSvg = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setSvgDimensions({ width: rect.width, height: rect.height });
      }
    };

    measureSvg();
    window.addEventListener('resize', measureSvg);
    return () => window.removeEventListener('resize', measureSvg);
  }, []);

  // Save state to localStorage on change
  useEffect(() => {
    saveState(appState);
  }, [appState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Select All: Ctrl+A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        updateState(State.selectAllRooms(appState), false);
        return;
      }

      // Delete selected rooms or object: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete selected object first (if any)
        if (appState.selectedObjectId) {
          e.preventDefault();
          updateState(State.deleteSelectedObject(appState));
          return;
        }
        // Otherwise delete selected rooms
        if (appState.selectedRoomIds.length > 0) {
          e.preventDefault();
          updateState(State.deleteRooms(appState, appState.selectedRoomIds));
        }
        return;
      }

      // Arrow keys: nudge selected rooms
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (arrowKeys.includes(e.key) && appState.selectedRoomIds.length > 0) {
        e.preventDefault();
        const amount = e.shiftKey ? NUDGE_AMOUNT_SHIFT : NUDGE_AMOUNT;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowUp') dy = -amount;
        if (e.key === 'ArrowDown') dy = amount;
        if (e.key === 'ArrowLeft') dx = -amount;
        if (e.key === 'ArrowRight') dx = amount;
        updateState(State.nudgeSelectedRooms(appState, dx, dy));
        return;
      }

      // M key: toggle measure tool
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setToolMode(toolMode === 'measure' ? 'select' : 'measure');
        setMeasurePoints([]);
        return;
      }

      // Escape: clear selection/tool mode
      if (e.key === 'Escape') {
        if (toolMode !== 'select') {
          setToolMode('select');
          setMeasurePoints([]);
        } else {
          updateState(State.clearSelection(appState), false);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, handleUndo, handleRedo, updateState, toolMode]);

  // Handle add room form submission
  const handleAddRoom = (name: string, widthCm: number, heightCm: number) => {
    const newState = State.addRoom(appState, name, widthCm, heightCm);
    updateState(newState);
  };

  // Handle delete room
  const handleDeleteRoom = (roomId: string) => {
    const newState = State.deleteRoom(appState, roomId);
    updateState(newState);
  };

  // Handle delete selected rooms or object
  const handleDeleteSelected = () => {
    if (appState.selectedObjectId) {
      updateState(State.deleteSelectedObject(appState));
    } else if (appState.selectedRoomIds.length > 0) {
      updateState(State.deleteRooms(appState, appState.selectedRoomIds));
    }
  };

  // Handle select room (with optional multi-select)
  const handleSelectRoom = (roomId: string | null, addToSelection = false) => {
    if (roomId === null) {
      updateState(State.clearSelection(appState), false);
    } else if (addToSelection) {
      updateState(State.toggleRoomSelection(appState, roomId), false);
    } else {
      updateState(State.selectRoom(appState, roomId), false);
    }
  };

  // Handle update room name
  const handleUpdateRoomName = (roomId: string, name: string) => {
    const newState = State.updateRoomName(appState, roomId, name);
    updateState(newState);
  };

  // Handle update room dimensions
  const handleUpdateRoomDimensions = (roomId: string, widthCm: number, heightCm: number) => {
    const newState = State.updateRoomDimensions(appState, roomId, widthCm, heightCm);
    updateState(newState);
  };

  // Handle update global wall thickness
  const handleUpdateGlobalWallThickness = (thickness: number) => {
    const newState = State.updateGlobalWallThickness(appState, thickness);
    updateState(newState);
  };

  // Handle update room wall thickness
  const handleUpdateRoomWallThickness = (roomId: string, wallThickness: any) => {
    const newState = State.updateRoomWallThickness(appState, roomId, wallThickness);
    updateState(newState);
  };

  // Objects: add definition, place, duplicate
  const handleAddObjectDef = (name: string, widthCm: number, heightCm: number) => {
    const newState = State.addObjectDef(appState, name, widthCm, heightCm);
    updateState(newState);
  };

  const handlePlaceObjectDef = (defId: string) => {
    const def = appState.objectDefs?.find((d) => d.id === defId);
    const selectedRoomId = appState.selectedRoomIds[0];
    const room = selectedRoomId ? State.getRoomById(appState, selectedRoomId) : undefined;
    if (!def || !room) return;

    // place at room center
    const xCm = room.xCm + (room.widthCm - def.widthCm) / 2;
    const yCm = room.yCm + (room.heightCm - def.heightCm) / 2;

    const newState = State.placeObject(appState, defId, room.id, xCm, yCm);
    updateState(newState);
  };

  const handleDuplicatePlaced = (placedId: string) => {
    const newState = State.duplicatePlacedObject(appState, placedId);
    updateState(newState);
  };

  // Door/opening handlers
  const handleAddDoor = (roomId: string, wall: WallSide, positionCm: number, widthCm: number = DEFAULT_DOOR_WIDTH) => {
    const newState = State.addWallOpening(appState, roomId, wall, 'door', positionCm, widthCm);
    updateState(newState);
  };

  const handleUpdateDoor = (openingId: string, updates: Partial<WallOpening>) => {
    const newState = State.updateWallOpening(appState, openingId, updates.positionCm, updates.widthCm);
    updateState(newState);
  };

  const handleDeleteDoor = (openingId: string) => {
    const newState = State.deleteWallOpening(appState, openingId);
    updateState(newState);
  };

  // Calculate measurement distance
  const measureDistance = useMemo(() => {
    if (measurePoints.length !== 2) return null;
    const [p1, p2] = measurePoints;
    const dx = p2.xCm - p1.xCm;
    const dy = p2.yCm - p1.yCm;
    return Math.sqrt(dx * dx + dy * dy);
  }, [measurePoints]);

  /**
   * Pointer handlers:
   * - Use event delegation (data-room-id)
   * - Use pointer capture so dragging keeps working even if cursor leaves SVG
   *
   * IMPORTANT:
   * Your Interaction.getSvgCoordinates() should accept a PointerEvent (or a union)
   * and should return coordinates in the same "content space" as the <g transform="translate(pan) scale(zoom)">.
   */
  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    // Convert pointer to SVG/content-space, then to cm
    const { x, y } = Interaction.getSvgCoordinates(
      e,
      svgRef.current,
      appState.panX,
      appState.panY,
      appState.zoom
    );
    const { xCm, yCm } = Interaction.svgPixelsToCm(x, y);

    // Handle measurement tool
    if (toolMode === 'measure') {
      if (measurePoints.length === 0) {
        setMeasurePoints([{ xCm, yCm }]);
      } else if (measurePoints.length === 1) {
        setMeasurePoints([measurePoints[0], { xCm, yCm }]);
      } else {
        // Start new measurement
        setMeasurePoints([{ xCm, yCm }]);
      }
      return;
    }

    // Capture pointer so we keep receiving move events
    svgRef.current.setPointerCapture(e.pointerId);

    // Find if pointer is on a resize handle first
    const target = e.target as Element;
    const resizeEl = target.closest?.('[data-resize-handle]') as Element | null;
    const resizeHandle = resizeEl?.getAttribute('data-resize-handle') as ResizeHandle | null;
    const resizeRoomId = resizeEl?.getAttribute('data-room-id');

    // Find if pointer is on a placed object first, then a room (event delegation)
    const placedEl = target.closest?.('[data-placed-id]') as Element | null;
    const placedId = placedEl?.getAttribute('data-placed-id');
    const roomEl = target.closest?.('[data-room-id]') as Element | null;
    const roomId = roomEl?.getAttribute('data-room-id');

    // If clicked on a resize handle, start resize
    if (resizeHandle && resizeRoomId) {
      const room = State.getRoomById(appState, resizeRoomId);
      if (room) {
        setDragState({
          roomId: resizeRoomId,
          startX: x,
          startY: y,
          roomStartX: room.xCm,
          roomStartY: room.yCm,
          targetType: 'resize',
          resizeHandle,
          initialRoom: { ...room },
        });
        return;
      }
    }

    // If clicked on a placed object, start placed-object drag
    if (placedId) {
      const placed = (appState.placedObjects ?? []).find((p) => p.id === placedId);
      if (placed) {
        // Select the object (not the room)
        updateState(State.selectObject(appState, placed.id), false);
        const ds = Interaction.startPlacedDrag(placed, x, y) as ExtendedDragState;
        ds.targetType = 'placed';
        setDragState(ds);
        return;
      }
    }

    if (roomId) {
      const room = State.getRoomById(appState, roomId);
      if (!room) return;

      // Handle multi-select with Shift key
      const addToSelection = e.shiftKey;
      
      // If room is already selected and we're starting a drag (not shift-clicking), 
      // drag all selected rooms
      const isAlreadySelected = appState.selectedRoomIds.includes(room.id);
      
      if (addToSelection) {
        handleSelectRoom(room.id, true);
        return; // Don't start drag on shift-click
      }
      
      // If not already selected, select only this room
      if (!isAlreadySelected) {
        handleSelectRoom(room.id);
      }

      // Start dragging - if multiple selected, prepare multi-drag
      const selectedIds = isAlreadySelected ? appState.selectedRoomIds : [room.id];
      const multiDragRooms = selectedIds.map((id) => {
        const r = State.getRoomById(appState, id);
        return r ? { id: r.id, startXCm: r.xCm, startYCm: r.yCm } : null;
      }).filter(Boolean) as Array<{ id: string; startXCm: number; startYCm: number }>;

      const ds: ExtendedDragState = {
        roomId: room.id,
        startX: x,
        startY: y,
        roomStartX: room.xCm,
        roomStartY: room.yCm,
        targetType: 'room',
        multiDragRooms,
      };
      setDragState(ds);
      return;
    }

    // Empty space: start panning
    setDragState({
      roomId: '__pan__',
      startX: e.clientX,
      startY: e.clientY,
      roomStartX: appState.panX,
      roomStartY: appState.panY,
    });
    handleSelectRoom(null);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || !dragState) return;

    // Panning
    if (dragState.roomId === '__pan__') {
      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;
      const newPanX = dragState.roomStartX + deltaX;
      const newPanY = dragState.roomStartY + deltaY;

      updateState(State.updateViewport(appState, newPanX, newPanY, appState.zoom), false);
      return;
    }

    // Drag room or placed object
    const { x, y } = Interaction.getSvgCoordinates(
      e,
      svgRef.current,
      appState.panX,
      appState.panY,
      appState.zoom
    );

    const { xCm, yCm } = Interaction.calculateDragPosition(dragState, x, y);

    // Handle resize
    if (dragState.targetType === 'resize' && dragState.initialRoom && dragState.resizeHandle) {
      const initial = dragState.initialRoom;
      const handle = dragState.resizeHandle;
      const deltaCmX = xCm - Interaction.svgPixelsToCm(dragState.startX, 0).xCm;
      const deltaCmY = yCm - Interaction.svgPixelsToCm(0, dragState.startY).yCm;

      let newX = initial.xCm;
      let newY = initial.yCm;
      let newW = initial.widthCm;
      let newH = initial.heightCm;

      // Handle each resize direction
      if (handle.includes('e')) {
        newW = Math.max(10, initial.widthCm + deltaCmX);
      }
      if (handle.includes('w')) {
        const delta = Math.min(deltaCmX, initial.widthCm - 10);
        newX = initial.xCm + delta;
        newW = initial.widthCm - delta;
      }
      if (handle.includes('s')) {
        newH = Math.max(10, initial.heightCm + deltaCmY);
      }
      if (handle.includes('n')) {
        const delta = Math.min(deltaCmY, initial.heightCm - 10);
        newY = initial.yCm + delta;
        newH = initial.heightCm - delta;
      }

      updateState(State.resizeRoom(appState, dragState.roomId, newX, newY, newW, newH), false);
      return;
    }

    // If dragging a placed object
    if (dragState.targetType === 'placed') {
      const placed = (appState.placedObjects ?? []).find((p) => p.id === dragState.roomId);
      if (!placed) return;
      const def = (appState.objectDefs ?? []).find((d) => d.id === placed.defId);
      const room = appState.rooms.find((r) => r.id === placed.roomId);
      if (!def || !room) return;

      // Helper to get the visual bounding box of a rotated object
      // When rotating around center, the bounding box top-left shifts
      const getVisualBounds = (objXCm: number, objYCm: number, origW: number, origH: number, rotationDeg: number) => {
        const isRotated = rotationDeg % 180 !== 0;
        if (!isRotated) {
          return { x: objXCm, y: objYCm, w: origW, h: origH };
        }
        // For 90/270 rotation: the center stays the same, but bounding box dimensions swap
        const centerX = objXCm + origW / 2;
        const centerY = objYCm + origH / 2;
        // New bounding box has swapped dimensions, centered at the same point
        const newW = origH;
        const newH = origW;
        return {
          x: centerX - newW / 2,
          y: centerY - newH / 2,
          w: newW,
          h: newH,
        };
      };

      // Helper to convert visual bounds back to storage coordinates
      const visualToStorage = (visualX: number, visualY: number, origW: number, origH: number, rotationDeg: number) => {
        const isRotated = rotationDeg % 180 !== 0;
        if (!isRotated) {
          return { xCm: visualX, yCm: visualY };
        }
        // For 90/270: given the visual bounding box top-left, find storage coords
        const newW = origH;  // visual width when rotated
        const newH = origW;  // visual height when rotated
        const centerX = visualX + newW / 2;
        const centerY = visualY + newH / 2;
        // Storage coords are for the unrotated rect centered at this point
        return {
          xCm: centerX - origW / 2,
          yCm: centerY - origH / 2,
        };
      };

      const currentRotation = placed.rotationDeg ?? 0;
      
      // Build list of other objects in the same room for snapping (using visual bounds)
      const otherObjectsInRoom: Snap.PlacedObjectForSnap[] = (appState.placedObjects ?? [])
        .filter((p) => p.roomId === room.id && p.id !== placed.id)
        .map((p) => {
          const objDef = (appState.objectDefs ?? []).find((d) => d.id === p.defId);
          if (!objDef) return null;
          const visual = getVisualBounds(p.xCm, p.yCm, objDef.widthCm, objDef.heightCm, p.rotationDeg ?? 0);
          return {
            id: p.id,
            xCm: visual.x,
            yCm: visual.y,
            widthCm: visual.w,
            heightCm: visual.h,
          };
        })
        .filter((p): p is Snap.PlacedObjectForSnap => p !== null);

      // Get visual bounds for the dragged object
      const visualBounds = getVisualBounds(xCm, yCm, def.widthCm, def.heightCm, currentRotation);

      const snapRes = Snap.calculatePlacedObjectSnap(
        visualBounds.w,
        visualBounds.h,
        room,
        visualBounds.x,
        visualBounds.y,
        Snap.OBJECT_SNAP_TOLERANCE_CM,
        otherObjectsInRoom,
        placed.id
      );
      
      // Convert snapped visual position back to storage coordinates
      const storageCoords = visualToStorage(snapRes.xCm, snapRes.yCm, def.widthCm, def.heightCm, currentRotation);
      
      setCurrentSnapResult(snapRes);

      updateState(State.updatePlacedObjectPosition(appState, placed.id, storageCoords.xCm, storageCoords.yCm), false);
      return;
    }

    // Dragging room(s) - handle multi-select
    if (dragState.targetType === 'room' && dragState.multiDragRooms && dragState.multiDragRooms.length > 0) {
      const room = State.getRoomById(appState, dragState.roomId);
      if (!room) return;

      // Calculate snap for the primary room
      const snap = Snap.calculateSnap(room, appState.rooms, xCm, yCm, appState.globalWallThicknessCm);
      setCurrentSnapResult(snap);

      const constrained = Interaction.constrainRoomPosition(snap.xCm, snap.yCm);
      const deltaX = constrained.xCm - dragState.roomStartX;
      const deltaY = constrained.yCm - dragState.roomStartY;

      // Apply delta to all selected rooms
      const roomMoves = dragState.multiDragRooms.map((r) => ({
        id: r.id,
        xCm: Math.max(0, r.startXCm + deltaX),
        yCm: Math.max(0, r.startYCm + deltaY),
      }));

      updateState(State.moveRooms(appState, roomMoves), false);
      return;
    }
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    // Record final position in history if we were dragging/resizing
    if (dragState && dragState.roomId !== '__pan__') {
      // Record the current state in history
      setHistory((prev) => State.recordHistory({ ...prev, present: appState }, appState));
    }
    
    if (svgRef.current) {
      try {
        svgRef.current.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setDragState(null);
    setCurrentSnapResult(null);
  };

  // Handle SVG wheel (zoom)
  const handleSvgWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();

    const deltaY = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(3, appState.zoom * deltaY));

    const newState = State.updateViewport(appState, appState.panX, appState.panY, newZoom);
    updateState(newState, false);
  };

  // Handle export
  const handleExport = () => {
    exportStateAsJson(appState);
  };

  // Handle import
  const handleImport = async (file: File) => {
    try {
      const imported = await importStateFromJson(file) as any; // Cast to any for backward compatibility
      // Migrate old format if needed
      const migratedState: AppState = {
        ...imported,
        selectedRoomIds: imported.selectedRoomIds ?? (imported.selectedRoomId ? [imported.selectedRoomId] : []),
      };
      setHistory({ past: [], present: migratedState, future: [] });
    } catch (error) {
      alert('Failed to import file: ' + (error as Error).message);
    }
  };

  // Get first selected room for properties panel (or undefined if multi-select)
  const selectedRoom = appState.selectedRoomIds.length === 1
    ? State.getRoomById(appState, appState.selectedRoomIds[0])
    : undefined;

  const isDraggingRoom = dragState && dragState.roomId !== '__pan__';

  const snap = currentSnapResult;

  return (
    <div className="h-screen flex bg-gray-50" ref={containerRef} tabIndex={-1}>
      {/* Left Panel: Add Room Form + Settings */}
      <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">OpenHome</h1>

        {/* Undo/Redo Buttons */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={handleUndo}
            disabled={!State.canUndo(history)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
              State.canUndo(history)
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                : 'bg-gray-50 text-gray-400 cursor-not-allowed'
            }`}
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={!State.canRedo(history)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
              State.canRedo(history)
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                : 'bg-gray-50 text-gray-400 cursor-not-allowed'
            }`}
            title="Redo (Ctrl+Y)"
          >
            ↷ Redo
          </button>
        </div>

        {/* Add Room Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Room</h2>
          <AddRoomForm onAddRoom={handleAddRoom} />
        </div>

        {/* Global Wall Thickness */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Settings</h2>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Wall Thickness (cm)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={appState.globalWallThicknessCm}
            onChange={(e) => handleUpdateGlobalWallThickness(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Import/Export */}
        <div className="mb-8 space-y-3">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Data</h2>
          <button
            onClick={handleExport}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition"
          >
            Export JSON
          </button>
          <label className="block">
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleImport(e.target.files[0]);
                }
              }}
              className="hidden"
            />
            <span className="w-full block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition text-center cursor-pointer">
              Import JSON
            </span>
          </label>
        </div>

        {/* Rooms List */}
          {/* Objects Library */}
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Objects</h2>
          <ObjectDefForm onAdd={handleAddObjectDef} />
          <div className="mt-3">
            {(appState.objectDefs ?? []).map((def) => (
              <div key={def.id} className="flex items-center gap-2 mb-2">
                <div className="flex-1 text-sm">{def.name} ({def.widthCm}×{def.heightCm}cm)</div>
                <button
                  onClick={() => handlePlaceObjectDef(def.id)}
                  disabled={appState.selectedRoomIds.length === 0}
                  title={appState.selectedRoomIds.length > 0 ? `Place in selected room` : 'Select a room first'}
                  className={`px-2 py-1 rounded text-xs ${appState.selectedRoomIds.length > 0 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
                >
                  Place
                </button>
              </div>
            ))}
          </div>

          {/* Placed Objects */}
          <h3 className="text-sm font-medium text-gray-700 mt-4 mb-2">Placed Objects</h3>
          <div className="space-y-2">
            {(appState.placedObjects ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <div className="flex-1 text-sm">{(appState.objectDefs ?? []).find((d)=>d.id===p.defId)?.name}</div>
                <button onClick={() => handleDuplicatePlaced(p.id)} className="px-2 py-1 bg-gray-200 rounded text-xs">Duplicate</button>
                <button
                  onClick={() => {
                    const current = p.rotationDeg ?? 0;
                    const newState = State.updatePlacedObjectRotation(appState, p.id, (current + 90) % 360);
                    updateState(newState);
                  }}
                  className="px-2 py-1 bg-gray-200 rounded text-xs"
                >
                  Rotate
                </button>
              </div>
            ))}
          </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Rooms ({appState.rooms.length})</h2>
          <p className="text-xs text-gray-500 mb-2">Shift+click to multi-select</p>
          <div className="space-y-2">
            {appState.rooms.map((room) => (
              <button
                key={room.id}
                onClick={(e) => handleSelectRoom(room.id, e.shiftKey)}
                className={`w-full text-left px-3 py-2 rounded-lg transition font-medium text-sm ${
                  appState.selectedRoomIds.includes(room.id)
                    ? 'bg-blue-100 text-blue-900 border border-blue-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {room.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Center Panel: SVG Editor */}
      <div className="flex-1 bg-white overflow-hidden flex flex-col">
        {/* Zoom Controls */}
        <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => {
              const newZoom = Math.max(0.1, appState.zoom - 0.2);
              updateState(State.updateViewport(appState, appState.panX, appState.panY, newZoom), false);
            }}
            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium"
          >
            −
          </button>
          <span className="text-sm font-medium text-gray-600 w-16 text-center">
            {Math.round(appState.zoom * 100)}%
          </span>
          <button
            onClick={() => {
              const newZoom = Math.min(3, appState.zoom + 0.2);
              updateState(State.updateViewport(appState, appState.panX, appState.panY, newZoom), false);
            }}
            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium"
          >
            +
          </button>
          <button
            onClick={() => {
              updateState(State.updateViewport(appState, 50, 50, 1), false);
            }}
            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium ml-2"
          >
            Reset
          </button>

          {/* Tool mode buttons */}
          <div className="flex items-center gap-1 ml-4 border-l border-gray-300 pl-4">
            <button
              onClick={() => { setToolMode('select'); setMeasurePoints([]); }}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                toolMode === 'select'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 hover:bg-gray-50'
              }`}
              title="Select tool (Esc)"
            >
              ↖ Select
            </button>
            <button
              onClick={() => { setToolMode('measure'); setMeasurePoints([]); }}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                toolMode === 'measure'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 hover:bg-gray-50'
              }`}
              title="Measure tool (M)"
            >
              📏 Measure
            </button>
          </div>

          {/* Show measurement result */}
          {measureDistance !== null && (
            <div className="ml-4 px-3 py-1 bg-yellow-100 border border-yellow-300 rounded text-sm font-medium text-yellow-800">
              Distance: {measureDistance.toFixed(1)} cm ({(measureDistance / 100).toFixed(2)} m)
            </div>
          )}

          <span className="text-xs text-gray-500 ml-4">
            {appState.selectedRoomIds.length > 1 && `${appState.selectedRoomIds.length} rooms selected`}
          </span>
          <span className="text-xs text-gray-500 ml-auto">Scroll to zoom • M: Measure</span>
        </div>

        {/* SVG canvas container with overlay */}
        <div className="relative flex-1 w-full h-full">
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className={`absolute inset-0 bg-gray-50 ${
              toolMode === 'measure' ? 'cursor-crosshair' : isDraggingRoom ? 'cursor-grabbing' : 'cursor-move'
            }`}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={handleSvgPointerUp}
            onPointerLeave={handleSvgPointerUp}
            onWheel={handleSvgWheel}
            viewBox="0 0 10000 10000"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Use SVG transform attribute (reliable), not CSS transform */}
            <g transform={`translate(${appState.panX} ${appState.panY}) scale(${appState.zoom})`}>
              {/* Background grid (optional) */}
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="10000" height="10000" fill="url(#grid)" />

              {/* Rooms with walls */}
              {appState.rooms.map((room) => {
                const wallThickness = {
                  north: room.wallThickness?.north ?? appState.globalWallThicknessCm,
                  south: room.wallThickness?.south ?? appState.globalWallThicknessCm,
                  east: room.wallThickness?.east ?? appState.globalWallThicknessCm,
                  west: room.wallThickness?.west ?? appState.globalWallThicknessCm,
                };

                const scale = SCALE;
                const x = room.xCm * scale;
                const y = room.yCm * scale;
                const w = room.widthCm * scale;
                const h = room.heightCm * scale;

                const selected = appState.selectedRoomIds.includes(room.id);
                const draggingThis = dragState?.roomId === room.id;
                
                // Resize handle size (in SVG units - needs to be large enough to see in viewBox)
                // Base size of 40 SVG units, scaled inversely with zoom so handles stay consistent on screen
                const handleSize = 40 / appState.zoom;

                // Get openings for this room
                const roomOpenings = State.getOpeningsForRoom(appState, room.id);

                // Check for adjacent rooms on each wall
                const adjacentNorth = State.findAdjacentRoom(appState, room, 'north');
                const adjacentSouth = State.findAdjacentRoom(appState, room, 'south');
                const adjacentEast = State.findAdjacentRoom(appState, room, 'east');
                const adjacentWest = State.findAdjacentRoom(appState, room, 'west');

                return (
                  <React.Fragment key={room.id}>
                    {/* Wall rectangles with door openings */}
                    {(() => {
                      const n = wallThickness.north * scale;
                      const s = wallThickness.south * scale;
                      const eT = wallThickness.east * scale;
                      const wT = wallThickness.west * scale;

                      // Outer extents:
                      // West wall sits left of x, East wall sits right of x+w
                      // North wall sits above y, South wall sits below y+h
                      const outerX = x - wT;
                      const outerY = y - n;
                      const outerW = w + wT + eT;
                      const outerH = h + n + s;

                      const wallFill = '#8b7355';

                      // Helper to render wall segments with openings
                      const renderWallWithOpenings = (
                        wallSide: WallSide,
                        baseX: number,
                        baseY: number,
                        wallWidth: number,
                        wallHeight: number,
                        isHorizontal: boolean,
                        adjacentRoom: ReturnType<typeof State.findAdjacentRoom>
                      ) => {
                        // If there's an adjacent room, check if this room should render the shared wall
                        if (adjacentRoom && !State.shouldRenderSharedWall(room, adjacentRoom.otherRoom)) {
                          // The other room will render this wall - skip it
                          return null;
                        }

                        // Get openings for this wall
                        let openings: WallOpening[];
                        if (adjacentRoom) {
                          // Combine openings from both rooms on shared wall
                          openings = State.getCombinedWallOpenings(appState, room, wallSide, adjacentRoom);
                        } else {
                          openings = roomOpenings.filter((o) => o.wall === wallSide);
                        }
                        
                        if (openings.length === 0) {
                          // No openings, render solid wall
                          return (
                            <rect
                              key={wallSide}
                              x={baseX}
                              y={baseY}
                              width={wallWidth}
                              height={wallHeight}
                              fill={wallFill}
                              opacity="0.6"
                              pointerEvents="none"
                            />
                          );
                        }

                        // Sort openings by position
                        const sortedOpenings = [...openings].sort((a, b) => a.positionCm - b.positionCm);
                        const segments: React.ReactNode[] = [];
                        let currentPos = 0;

                        sortedOpenings.forEach((opening, i) => {
                          const openingStart = opening.positionCm * scale;
                          const openingWidth = opening.widthCm * scale;

                          // Wall segment before this opening
                          if (openingStart > currentPos) {
                            if (isHorizontal) {
                              segments.push(
                                <rect
                                  key={`${wallSide}-seg-${i}-before`}
                                  x={baseX + currentPos}
                                  y={baseY}
                                  width={openingStart - currentPos}
                                  height={wallHeight}
                                  fill={wallFill}
                                  opacity="0.6"
                                  pointerEvents="none"
                                />
                              );
                            } else {
                              segments.push(
                                <rect
                                  key={`${wallSide}-seg-${i}-before`}
                                  x={baseX}
                                  y={baseY + currentPos}
                                  width={wallWidth}
                                  height={openingStart - currentPos}
                                  fill={wallFill}
                                  opacity="0.6"
                                  pointerEvents="none"
                                />
                              );
                            }
                          }

                          // Door opening visual (floor line)
                          if (isHorizontal) {
                            segments.push(
                              <line
                                key={`${wallSide}-door-${i}`}
                                x1={baseX + openingStart}
                                y1={baseY + wallHeight / 2}
                                x2={baseX + openingStart + openingWidth}
                                y2={baseY + wallHeight / 2}
                                stroke="#4ade80"
                                strokeWidth={3}
                                strokeDasharray="8,4"
                                pointerEvents="none"
                              />
                            );
                          } else {
                            segments.push(
                              <line
                                key={`${wallSide}-door-${i}`}
                                x1={baseX + wallWidth / 2}
                                y1={baseY + openingStart}
                                x2={baseX + wallWidth / 2}
                                y2={baseY + openingStart + openingWidth}
                                stroke="#4ade80"
                                strokeWidth={3}
                                strokeDasharray="8,4"
                                pointerEvents="none"
                              />
                            );
                          }

                          currentPos = openingStart + openingWidth;
                        });

                        // Wall segment after last opening
                        const totalLength = isHorizontal ? wallWidth : wallHeight;
                        if (currentPos < totalLength) {
                          if (isHorizontal) {
                            segments.push(
                              <rect
                                key={`${wallSide}-seg-after`}
                                x={baseX + currentPos}
                                y={baseY}
                                width={totalLength - currentPos}
                                height={wallHeight}
                                fill={wallFill}
                                opacity="0.6"
                                pointerEvents="none"
                              />
                            );
                          } else {
                            segments.push(
                              <rect
                                key={`${wallSide}-seg-after`}
                                x={baseX}
                                y={baseY + currentPos}
                                width={wallWidth}
                                height={totalLength - currentPos}
                                fill={wallFill}
                                opacity="0.6"
                                pointerEvents="none"
                              />
                            );
                          }
                        }

                        return <>{segments}</>;
                      };

                      return (
                        <>
                          {/* North wall (above room, spans full outer width) */}
                          {renderWallWithOpenings('north', outerX, y - n, outerW, n, true, adjacentNorth)}

                          {/* South wall (below room, spans full outer width) */}
                          {renderWallWithOpenings('south', outerX, y + h, outerW, s, true, adjacentSouth)}

                          {/* West wall (left of room, spans full outer height) */}
                          {renderWallWithOpenings('west', x - wT, outerY, wT, outerH, false, adjacentWest)}

                          {/* East wall (right of room, spans full outer height) */}
                          {renderWallWithOpenings('east', x + w, outerY, eT, outerH, false, adjacentEast)}
                        </>
                      );
                    })()}

                    {/* Room rectangle (clickable, with data-room-id for event delegation) */}
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      data-room-id={room.id}
                      fill={selected ? 'rgba(37, 99, 235, 0.1)' : 'rgba(229, 231, 235, 0.5)'}
                      stroke={selected ? '#2563eb' : '#d1d5db'}
                      strokeWidth={selected ? 3 : 2}
                      style={{ cursor: draggingThis ? 'grabbing' : 'grab' }}
                    />

                    {/* Resize handles (only show for selected rooms) */}
                    {selected && (
                      <>
                        {/* Corner handles */}
                        <rect
                          x={x - handleSize / 2} y={y - handleSize / 2}
                          width={handleSize} height={handleSize}
                          fill="#2563eb" stroke="#fff" strokeWidth={1}
                          data-resize-handle="nw" data-room-id={room.id}
                          style={{ cursor: 'nwse-resize' }}
                        />
                        <rect
                          x={x + w - handleSize / 2} y={y - handleSize / 2}
                          width={handleSize} height={handleSize}
                          fill="#2563eb" stroke="#fff" strokeWidth={1}
                          data-resize-handle="ne" data-room-id={room.id}
                          style={{ cursor: 'nesw-resize' }}
                        />
                        <rect
                          x={x - handleSize / 2} y={y + h - handleSize / 2}
                          width={handleSize} height={handleSize}
                          fill="#2563eb" stroke="#fff" strokeWidth={1}
                          data-resize-handle="sw" data-room-id={room.id}
                          style={{ cursor: 'nesw-resize' }}
                        />
                        <rect
                          x={x + w - handleSize / 2} y={y + h - handleSize / 2}
                          width={handleSize} height={handleSize}
                          fill="#2563eb" stroke="#fff" strokeWidth={1}
                          data-resize-handle="se" data-room-id={room.id}
                          style={{ cursor: 'nwse-resize' }}
                        />
                        {/* Edge handles */}
                        <rect
                          x={x + w / 2 - handleSize / 2} y={y - handleSize / 2}
                          width={handleSize} height={handleSize}
                          fill="#2563eb" stroke="#fff" strokeWidth={1}
                          data-resize-handle="n" data-room-id={room.id}
                          style={{ cursor: 'ns-resize' }}
                        />
                        <rect
                          x={x + w / 2 - handleSize / 2} y={y + h - handleSize / 2}
                          width={handleSize} height={handleSize}
                          fill="#2563eb" stroke="#fff" strokeWidth={1}
                          data-resize-handle="s" data-room-id={room.id}
                          style={{ cursor: 'ns-resize' }}
                        />
                        <rect
                          x={x - handleSize / 2} y={y + h / 2 - handleSize / 2}
                          width={handleSize} height={handleSize}
                          fill="#2563eb" stroke="#fff" strokeWidth={1}
                          data-resize-handle="w" data-room-id={room.id}
                          style={{ cursor: 'ew-resize' }}
                        />
                        <rect
                          x={x + w - handleSize / 2} y={y + h / 2 - handleSize / 2}
                          width={handleSize} height={handleSize}
                          fill="#2563eb" stroke="#fff" strokeWidth={1}
                          data-resize-handle="e" data-room-id={room.id}
                          style={{ cursor: 'ew-resize' }}
                        />
                      </>
                    )}

                    {/* Placed objects inside this room */}
                    {(appState.placedObjects ?? []).filter((p) => p.roomId === room.id).map((p) => {
                      const def = appState.objectDefs?.find((d) => d.id === p.defId);
                      if (!def) return null;
                      const ox = p.xCm * scale;
                      const oy = p.yCm * scale;
                      const ow = def.widthCm * scale;
                      const oh = def.heightCm * scale;
                      const draggingPlaced = dragState?.roomId === p.id && dragState?.targetType === 'placed';
                      const isSelectedObject = appState.selectedObjectId === p.id;
                      const rotation = p.rotationDeg ?? 0;
                      return (
                        <g key={p.id} data-placed-id={p.id} transform={`rotate(${rotation} ${ox + ow / 2} ${oy + oh / 2})`} style={{ cursor: draggingPlaced ? 'grabbing' : 'grab' }}>
                          <rect 
                            x={ox} 
                            y={oy} 
                            width={ow} 
                            height={oh} 
                            fill={isSelectedObject ? "#93c5fd" : "#c7e1ff"} 
                            stroke={isSelectedObject ? "#2563eb" : "#0369a1"} 
                            strokeWidth={isSelectedObject ? 2 : 1} 
                          />
                          <text x={ox + ow/2} y={oy + oh/2} textAnchor="middle" dominantBaseline="middle" fontSize={10} pointerEvents="none" fill="#023047">{def.name}</text>
                        </g>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {/* Snap indicators */}
              {snap && snap.snappedX && (
                <line
                  x1={(snap.xGuideCm ?? snap.xCm)! * SCALE}
                  y1="0"
                  x2={(snap.xGuideCm ?? snap.xCm)! * SCALE}
                  y2="10000"
                  stroke="#ec4899"
                  strokeWidth="1"
                  strokeDasharray="4,4"
                  opacity="0.6"
                  pointerEvents="none"
                />
              )}
              {snap && snap.snappedY && (
                <line
                  x1="0"
                  y1={(snap.yGuideCm ?? snap.yCm)! * SCALE}
                  x2="10000"
                  y2={(snap.yGuideCm ?? snap.yCm)! * SCALE}
                  stroke="#ec4899"
                  strokeWidth="1"
                  strokeDasharray="4,4"
                  opacity="0.6"
                  pointerEvents="none"
                />
              )}

              {/* Measurement line and points */}
              {measurePoints.length > 0 && (
                <>
                  {/* First point marker */}
                  <circle
                    cx={measurePoints[0].xCm * SCALE}
                    cy={measurePoints[0].yCm * SCALE}
                    r={8 / appState.zoom}
                    fill="#f59e0b"
                    stroke="#fff"
                    strokeWidth={2 / appState.zoom}
                    pointerEvents="none"
                  />
                  
                  {/* If we have two points, show line and second marker */}
                  {measurePoints.length === 2 && (
                    <>
                      <line
                        x1={measurePoints[0].xCm * SCALE}
                        y1={measurePoints[0].yCm * SCALE}
                        x2={measurePoints[1].xCm * SCALE}
                        y2={measurePoints[1].yCm * SCALE}
                        stroke="#f59e0b"
                        strokeWidth={3 / appState.zoom}
                        strokeDasharray={`${10 / appState.zoom},${5 / appState.zoom}`}
                        pointerEvents="none"
                      />
                      <circle
                        cx={measurePoints[1].xCm * SCALE}
                        cy={measurePoints[1].yCm * SCALE}
                        r={8 / appState.zoom}
                        fill="#f59e0b"
                        stroke="#fff"
                        strokeWidth={2 / appState.zoom}
                        pointerEvents="none"
                      />
                      {/* Distance label in middle of line */}
                      <text
                        x={(measurePoints[0].xCm + measurePoints[1].xCm) / 2 * SCALE}
                        y={(measurePoints[0].yCm + measurePoints[1].yCm) / 2 * SCALE - 15 / appState.zoom}
                        textAnchor="middle"
                        fontSize={16 / appState.zoom}
                        fill="#f59e0b"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {measureDistance?.toFixed(1)} cm
                      </text>
                    </>
                  )}
                </>
              )}
            </g>
          </svg>

          {/* HTML overlay for room name labels (fixed font-size, always readable) */}
          <div className="pointer-events-none absolute inset-0 z-10">
            {roomLabelPositions.map((label) => {
              const room = appState.rooms.find((r) => r.id === label.roomId);
              return (
                <div
                  key={label.roomId}
                  style={{
                    position: 'absolute',
                    left: `${label.x}px`,
                    top: `${label.y}px`,
                    transform: 'translate(-50%, -110%)',
                    fontSize: '13px',
                    lineHeight: '16px',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                    zIndex: 20,
                  }}
                  className={`rounded-md px-2 py-1 shadow-sm border ${
                    label.isSelected ? 'bg-blue-50 border-blue-300 text-blue-900' : 'bg-white/90 border-gray-200 text-gray-700'
                  }`}
                >
                  <div>{room?.name}</div>
                </div>
              );
            })}

            {placedLabelPositions.map((label) => {
              const placed = (appState.placedObjects ?? []).find((p) => p.id === label.placedId);
              const def = placed ? (appState.objectDefs ?? []).find((d) => d.id === placed.defId) : undefined;
              if (!placed || !def) return null;
              return (
                <div
                  key={label.placedId}
                  style={{
                    position: 'absolute',
                    left: `${label.x}px`,
                    top: `${label.y}px`,
                    transform: 'translate(-50%, -50%)',
                    fontSize: '13px',
                    lineHeight: '16px',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                    zIndex: 20,
                  }}
                >
                  <div className="rounded-md px-2 py-1 shadow-sm border bg-white/90 border-gray-200 text-gray-700">{def.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Panel: Selected Room Properties */}
      <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto p-6 shadow-sm">
        {appState.selectedRoomIds.length > 1 ? (
          // Multi-select panel
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              {appState.selectedRoomIds.length} Rooms Selected
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Use arrow keys to nudge all selected rooms.
            </p>
            <div className="space-y-2 mb-6">
              {appState.selectedRoomIds.map((id) => {
                const r = State.getRoomById(appState, id);
                return r ? (
                  <div key={id} className="px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-900">
                    {r.name}
                  </div>
                ) : null;
              })}
            </div>
            <button
              onClick={() => {
                if (confirm(`Delete ${appState.selectedRoomIds.length} rooms?`)) {
                  handleDeleteSelected();
                }
              }}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
            >
              Delete All Selected
            </button>
          </div>
        ) : appState.selectedObjectId ? (
          // Selected object panel
          (() => {
            const selectedObject = (appState.placedObjects ?? []).find(p => p.id === appState.selectedObjectId);
            const objectDef = selectedObject ? appState.objectDefs?.find(d => d.id === selectedObject.defId) : null;
            const containingRoom = selectedObject ? appState.rooms.find(r => r.id === selectedObject.roomId) : null;
            if (!selectedObject || !objectDef) return null;
            return (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Object Properties</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800">{objectDef.name}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Def Width</label>
                      <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800 text-sm">{objectDef.widthCm} cm</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Def Height</label>
                      <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800 text-sm">{objectDef.heightCm} cm</div>
                    </div>
                  </div>
                  
                  {/* Editable Position */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">X Position (cm)</label>
                      <input
                        type="number"
                        value={Math.round(selectedObject.xCm)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            updateState(State.updatePlacedObjectPosition(appState, selectedObject.id, val, selectedObject.yCm));
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">Y Position (cm)</label>
                      <input
                        type="number"
                        value={Math.round(selectedObject.yCm)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            updateState(State.updatePlacedObjectPosition(appState, selectedObject.id, selectedObject.xCm, val));
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  {/* Editable Rotation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Rotation</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={selectedObject.rotationDeg ?? 0}
                        step={90}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            updateState(State.updatePlacedObjectRotation(appState, selectedObject.id, val % 360));
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="text-gray-500">°</span>
                      <button
                        onClick={() => {
                          const current = selectedObject.rotationDeg ?? 0;
                          updateState(State.updatePlacedObjectRotation(appState, selectedObject.id, (current + 90) % 360));
                        }}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition"
                        title="Rotate 90°"
                      >
                        ↻ 90°
                      </button>
                    </div>
                  </div>
                  
                  {/* Room (read-only for now) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">In Room</label>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800">{containingRoom?.name ?? 'Unknown'}</div>
                  </div>
                  
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${objectDef.name}?`)) {
                        handleDeleteSelected();
                      }
                    }}
                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
                  >
                    Delete Object
                  </button>
                </div>
              </div>
            );
          })()
        ) : selectedRoom ? (
          <>
            <RoomPropertiesPanel
              room={selectedRoom}
              globalWallThickness={appState.globalWallThicknessCm}
              onUpdateName={handleUpdateRoomName}
              onUpdateDimensions={handleUpdateRoomDimensions}
              onUpdateWallThickness={handleUpdateRoomWallThickness}
              onDelete={handleDeleteRoom}
            />
            
            {/* Door Openings Section */}
            <DoorOpeningsPanel
              room={selectedRoom}
              openings={State.getOpeningsForRoom(appState, selectedRoom.id)}
              onAddDoor={handleAddDoor}
              onUpdateDoor={handleUpdateDoor}
              onDeleteDoor={handleDeleteDoor}
            />
          </>
        ) : (
          <div className="text-center text-gray-500 py-8">
            <p>Select a room to edit its properties</p>
            <p className="text-xs mt-2">Shift+click to multi-select</p>
          </div>
        )}
      </div>

      {/* Keyboard shortcuts help tooltip */}
      <div className="fixed bottom-4 right-4 bg-gray-800 text-white text-xs px-3 py-2 rounded-lg opacity-70 pointer-events-none">
        <div><strong>Shortcuts:</strong></div>
        <div>Ctrl+Z: Undo • Ctrl+Y: Redo</div>
        <div>Del: Delete • M: Measure</div>
        <div>Ctrl+A: Select All • Esc: Deselect</div>
      </div>
    </div>
  );
}

/**
 * Add Room Form Component
 */
interface AddRoomFormProps {
  onAddRoom: (name: string, widthCm: number, heightCm: number) => void;
}

function AddRoomForm({ onAddRoom }: AddRoomFormProps) {
  const [name, setName] = useState('');
  const [widthCm, setWidthCm] = useState(300);
  const [heightCm, setHeightCm] = useState(400);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && widthCm > 0 && heightCm > 0) {
      onAddRoom(name, widthCm, heightCm);
      setName('');
      setWidthCm(300);
      setHeightCm(400);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Living Room"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Width (cm)</label>
        <input
          type="number"
          min="1"
          value={widthCm}
          onChange={(e) => setWidthCm(Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
        <input
          type="number"
          min="1"
          value={heightCm}
          onChange={(e) => setHeightCm(Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
      >
        Add Room
      </button>
    </form>
  );
}

/**
 * Object Definition Form
 */
interface ObjectDefFormProps {
  onAdd: (name: string, widthCm: number, heightCm: number) => void;
}

function ObjectDefForm({ onAdd }: ObjectDefFormProps) {
  const [name, setName] = useState('New Object');
  const [widthCm, setWidthCm] = useState(50);
  const [heightCm, setHeightCm] = useState(50);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), widthCm, heightCm);
    setName('New Object');
    setWidthCm(50);
    setHeightCm(50);
  };

  return (
    <form onSubmit={submit} className="space-y-2 mb-2">
      <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-2 py-1 border rounded text-sm" />
      <div className="flex gap-2">
        <input type="number" min={1} value={widthCm} onChange={(e)=>setWidthCm(Number(e.target.value))} className="w-1/2 px-2 py-1 border rounded text-sm" />
        <input type="number" min={1} value={heightCm} onChange={(e)=>setHeightCm(Number(e.target.value))} className="w-1/2 px-2 py-1 border rounded text-sm" />
      </div>
      <button type="submit" className="w-full px-2 py-1 bg-green-600 text-white rounded text-sm">Add Object</button>
    </form>
  );
}

/**
 * Room Properties Panel Component
 */
interface RoomPropertiesPanelProps {
  room: Room;
  globalWallThickness: number;
  onUpdateName: (roomId: string, name: string) => void;
  onUpdateDimensions: (roomId: string, widthCm: number, heightCm: number) => void;
  onUpdateWallThickness: (roomId: string, wallThickness: any) => void;
  onDelete: (roomId: string) => void;
}

function RoomPropertiesPanel({
  room,
  globalWallThickness,
  onUpdateName,
  onUpdateDimensions,
  onUpdateWallThickness,
  onDelete,
}: RoomPropertiesPanelProps) {
  const [name, setName] = useState(room.name);
  const [widthCm, setWidthCm] = useState(room.widthCm);
  const [heightCm, setHeightCm] = useState(room.heightCm);
  const [wallNorth, setWallNorth] = useState(room.wallThickness?.north ?? '');
  const [wallSouth, setWallSouth] = useState(room.wallThickness?.south ?? '');
  const [wallEast, setWallEast] = useState(room.wallThickness?.east ?? '');
  const [wallWest, setWallWest] = useState(room.wallThickness?.west ?? '');

  // Keep panel inputs in sync when selecting another room
  useEffect(() => {
    setName(room.name);
    setWidthCm(room.widthCm);
    setHeightCm(room.heightCm);
    setWallNorth(room.wallThickness?.north ?? '');
    setWallSouth(room.wallThickness?.south ?? '');
    setWallEast(room.wallThickness?.east ?? '');
    setWallWest(room.wallThickness?.west ?? '');
  }, [room.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameChange = () => {
    if (name !== room.name) {
      onUpdateName(room.id, name);
    }
  };

  const handleDimensionsChange = () => {
    if (widthCm !== room.widthCm || heightCm !== room.heightCm) {
      onUpdateDimensions(room.id, widthCm, heightCm);
    }
  };

  const handleWallThicknessChange = () => {
    const walls = {
      north: wallNorth ? Number(wallNorth) : undefined,
      south: wallSouth ? Number(wallSouth) : undefined,
      east: wallEast ? Number(wallEast) : undefined,
      west: wallWest ? Number(wallWest) : undefined,
    };
    onUpdateWallThickness(room.id, walls);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Room Properties</h2>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Dimensions */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Width (cm)</label>
        <input
          type="number"
          min="1"
          step="10"
          value={widthCm}
          onChange={(e) => setWidthCm(Number(e.target.value))}
          onBlur={handleDimensionsChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
        <input
          type="number"
          min="1"
          step="10"
          value={heightCm}
          onChange={(e) => setHeightCm(Number(e.target.value))}
          onBlur={handleDimensionsChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Wall Thickness */}
      <div className="mb-6 border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Wall Thickness (cm)</h3>
        <p className="text-xs text-gray-500 mb-3">
          Leave empty to use global default ({globalWallThickness}cm)
        </p>

        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">North</label>
            <input
              type="number"
              min="0"
              step="1"
              value={wallNorth}
              onChange={(e) => setWallNorth(e.target.value)}
              onBlur={handleWallThicknessChange}
              placeholder="Default"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">South</label>
            <input
              type="number"
              min="0"
              step="1"
              value={wallSouth}
              onChange={(e) => setWallSouth(e.target.value)}
              onBlur={handleWallThicknessChange}
              placeholder="Default"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">East</label>
            <input
              type="number"
              min="0"
              step="1"
              value={wallEast}
              onChange={(e) => setWallEast(e.target.value)}
              onBlur={handleWallThicknessChange}
              placeholder="Default"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">West</label>
            <input
              type="number"
              min="0"
              step="1"
              value={wallWest}
              onChange={(e) => setWallWest(e.target.value)}
              onBlur={handleWallThicknessChange}
              placeholder="Default"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Delete Button */}
      <button
        onClick={() => {
          if (confirm('Delete this room?')) {
            onDelete(room.id);
          }
        }}
        className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
      >
        Delete Room
      </button>
    </div>
  );
}

// Door Openings Panel Component
interface DoorOpeningsPanelProps {
  room: Room;
  openings: WallOpening[];
  onAddDoor: (roomId: string, wall: WallSide, positionCm: number, widthCm: number) => void;
  onUpdateDoor: (openingId: string, updates: Partial<WallOpening>) => void;
  onDeleteDoor: (openingId: string) => void;
}

function DoorOpeningsPanel({ room, openings, onAddDoor, onUpdateDoor, onDeleteDoor }: DoorOpeningsPanelProps) {
  const [selectedWall, setSelectedWall] = useState<WallSide>('north');
  const [positionCm, setPositionCm] = useState('50');
  const [widthCm, setWidthCm] = useState('90');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPosition, setEditPosition] = useState('');
  const [editWidth, setEditWidth] = useState('');

  // Get wall length for validation
  const getWallLengthCm = (wall: WallSide): number => {
    const isHorizontal = wall === 'north' || wall === 'south';
    return isHorizontal ? room.widthCm : room.heightCm;
  };

  const handleAddDoor = () => {
    const pos = parseFloat(positionCm);
    const width = parseFloat(widthCm);
    const wallLength = getWallLengthCm(selectedWall);

    if (isNaN(pos) || isNaN(width) || pos < 0 || width < 10) {
      alert('Please enter valid position and width values');
      return;
    }

    if (pos + width > wallLength) {
      alert(`Door extends beyond wall. Wall length is ${wallLength}cm`);
      return;
    }

    onAddDoor(room.id, selectedWall, pos, width);
    setPositionCm('50');
    setWidthCm('90');
  };

  const handleStartEdit = (opening: WallOpening) => {
    setEditingId(opening.id);
    setEditPosition(opening.positionCm.toString());
    setEditWidth(opening.widthCm.toString());
  };

  const handleSaveEdit = (opening: WallOpening) => {
    const pos = parseFloat(editPosition);
    const width = parseFloat(editWidth);
    const wallLength = getWallLengthCm(opening.wall);

    if (isNaN(pos) || isNaN(width) || pos < 0 || width < 10) {
      alert('Please enter valid position and width values');
      return;
    }

    if (pos + width > wallLength) {
      alert(`Door extends beyond wall. Wall length is ${wallLength}cm`);
      return;
    }

    onUpdateDoor(opening.id, { positionCm: pos, widthCm: width });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const wallLabels: Record<WallSide, string> = {
    north: 'North (Top)',
    south: 'South (Bottom)',
    east: 'East (Right)',
    west: 'West (Left)',
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-800 border-b pb-2">Door Openings</h3>

      {/* Add New Door */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-3">
        <p className="text-xs font-medium text-gray-600">Add New Door</p>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Wall</label>
          <select
            value={selectedWall}
            onChange={(e) => setSelectedWall(e.target.value as WallSide)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {(['north', 'south', 'east', 'west'] as WallSide[]).map((wall) => (
              <option key={wall} value={wall}>
                {wallLabels[wall]} - {getWallLengthCm(wall)}cm
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Position (cm)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={positionCm}
              onChange={(e) => setPositionCm(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Width (cm)</label>
            <input
              type="number"
              min="10"
              step="1"
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        <button
          onClick={handleAddDoor}
          className="w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition"
        >
          Add Door
        </button>

        <p className="text-xs text-gray-400">
          Tip: Use the Measure tool (M) to find the exact position for your door.
        </p>
      </div>

      {/* Existing Doors List */}
      {openings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Existing Doors ({openings.length})</p>

          {openings.map((opening) => (
            <div
              key={opening.id}
              className="bg-white border border-gray-200 rounded-lg p-2 text-sm"
            >
              {editingId === opening.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 w-16">{wallLabels[opening.wall].split(' ')[0]}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400">Position</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editPosition}
                        onChange={(e) => setEditPosition(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400">Width</label>
                      <input
                        type="number"
                        min="10"
                        step="1"
                        value={editWidth}
                        onChange={(e) => setEditWidth(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleSaveEdit(opening)}
                      className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex-1 px-2 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 text-xs rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-700">{wallLabels[opening.wall].split(' ')[0]}</span>
                    <span className="text-gray-500 ml-2">
                      {opening.positionCm}cm → {opening.positionCm + opening.widthCm}cm
                    </span>
                    <span className="text-gray-400 text-xs ml-1">({opening.widthCm}cm wide)</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleStartEdit(opening)}
                      className="px-2 py-1 text-blue-600 hover:bg-blue-50 text-xs rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteDoor(opening.id)}
                      className="px-2 py-1 text-red-600 hover:bg-red-50 text-xs rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {openings.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">
          No doors added yet. Use the form above to add door openings to walls.
        </p>
      )}
    </div>
  );
}
