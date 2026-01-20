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
    <div className="h-screen flex bg-slate-100" ref={containerRef} tabIndex={-1}>
      {/* Left Panel: Tools & Library */}
      <div className="w-72 bg-white border-r border-slate-200 overflow-y-auto flex flex-col shadow-sm">
        {/* Header */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">O</span>
            </div>
            <h1 className="text-xl font-bold text-slate-800">OpenHome</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Undo/Redo */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={handleUndo}
              disabled={!State.canUndo(history)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                State.canUndo(history)
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-50 text-slate-300 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H3M3 10l6-6M3 10l6 6"/></svg>
              Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={!State.canRedo(history)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                State.canRedo(history)
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-50 text-slate-300 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Y)"
            >
              Redo
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H11a5 5 0 00-5 5v0a5 5 0 005 5h10M21 10l-6-6M21 10l-6 6"/></svg>
            </button>
          </div>

          {/* Add Room Section */}
          <div className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 last:mb-0 last:pb-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Add Room</h2>
            <AddRoomForm onAddRoom={handleAddRoom} />
          </div>

          {/* Settings */}
          <div className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 last:mb-0 last:pb-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Settings</h2>
            <label className="block text-sm font-medium text-slate-600 mb-2">
              Default Wall Thickness
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={appState.globalWallThicknessCm}
                onChange={(e) => handleUpdateGlobalWallThickness(Number(e.target.value))}
                className="input-field flex-1"
              />
              <span className="text-sm text-slate-400">cm</span>
            </div>
          </div>

          {/* Import/Export */}
          <div className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 last:mb-0 last:pb-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Data</h2>
            <div className="space-y-2">
              <button
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
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
                <span className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all cursor-pointer">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  Import JSON
                </span>
              </label>
            </div>
          </div>

          {/* Objects Library */}
          <div className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 last:mb-0 last:pb-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Objects Library</h2>
            <ObjectDefForm onAdd={handleAddObjectDef} />
            <div className="mt-4 space-y-2">
              {(appState.objectDefs ?? []).map((def) => (
                <div key={def.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-all">
                  <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">{def.name}</div>
                    <div className="text-xs text-slate-400">{def.widthCm} × {def.heightCm} cm</div>
                  </div>
                  <button
                    onClick={() => handlePlaceObjectDef(def.id)}
                    disabled={appState.selectedRoomIds.length === 0}
                    title={appState.selectedRoomIds.length > 0 ? `Place in selected room` : 'Select a room first'}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      appState.selectedRoomIds.length > 0 
                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Place
                  </button>
                </div>
              ))}
              {(appState.objectDefs ?? []).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No objects defined yet</p>
              )}
            </div>
          </div>

          {/* Placed Objects */}
          {(appState.placedObjects ?? []).length > 0 && (
            <div className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 last:mb-0 last:pb-0">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Placed Objects</h2>
              <div className="space-y-2">
                {(appState.placedObjects ?? []).map((p) => {
                  const def = (appState.objectDefs ?? []).find((d) => d.id === p.defId);
                  const room = appState.rooms.find((r) => r.id === p.roomId);
                  const isSelected = appState.selectedObjectId === p.id;
                  return (
                    <div 
                      key={p.id} 
                      onClick={() => updateState(State.selectObject(appState, p.id), false)}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                        isSelected ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 hover:bg-slate-100 border border-transparent'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">{def?.name}</div>
                        <div className="text-xs text-slate-400">{room?.name} • {p.rotationDeg ?? 0}°</div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDuplicatePlaced(p.id); }} 
                        className="p-1.5 hover:bg-slate-200 rounded transition-all"
                        title="Duplicate"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const current = p.rotationDeg ?? 0;
                          const newState = State.updatePlacedObjectRotation(appState, p.id, (current + 90) % 360);
                          updateState(newState);
                        }}
                        className="p-1.5 hover:bg-slate-200 rounded transition-all"
                        title="Rotate 90°"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rooms List */}
          <div className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 last:mb-0 last:pb-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Rooms ({appState.rooms.length})</h2>
            <p className="text-xs text-slate-400 mb-3">Shift+click to multi-select</p>
            <div className="space-y-1.5">
              {appState.rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={(e) => handleSelectRoom(room.id, e.shiftKey)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${
                    appState.selectedRoomIds.includes(room.id)
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${appState.selectedRoomIds.includes(room.id) ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                    <span className="flex-1 truncate">{room.name}</span>
                    <span className="text-xs text-slate-400">{room.widthCm}×{room.heightCm}</span>
                  </div>
                </button>
              ))}
              {appState.rooms.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No rooms yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Center Panel: SVG Editor */}
      <div className="flex-1 bg-white overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => {
                const newZoom = Math.max(0.1, appState.zoom - 0.2);
                updateState(State.updateViewport(appState, appState.panX, appState.panY, newZoom), false);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-slate-600 font-medium transition-all"
            >
              −
            </button>
            <span className="text-sm font-medium text-slate-600 w-14 text-center">
              {Math.round(appState.zoom * 100)}%
            </span>
            <button
              onClick={() => {
                const newZoom = Math.min(3, appState.zoom + 0.2);
                updateState(State.updateViewport(appState, appState.panX, appState.panY, newZoom), false);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-slate-600 font-medium transition-all"
            >
              +
            </button>
          </div>
          
          <button
            onClick={() => {
              updateState(State.updateViewport(appState, 50, 50, 1), false);
            }}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          >
            Reset View
          </button>

          <div className="w-px h-6 bg-slate-200 mx-1"></div>

          {/* Tool mode buttons */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => { setToolMode('select'); setMeasurePoints([]); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all duration-150 cursor-pointer ${
                toolMode === 'select' 
                  ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200' 
                  : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800 active:bg-slate-300'
              }`}
              title="Select tool (Esc)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
              Select
            </button>
            <button
              onClick={() => { setToolMode('measure'); setMeasurePoints([]); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all duration-150 cursor-pointer ${
                toolMode === 'measure' 
                  ? 'bg-white text-amber-600 shadow-sm ring-1 ring-slate-200' 
                  : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800 active:bg-slate-300'
              }`}
              title="Measure tool (M)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20M2 12l4-4m-4 4l4 4m16-4l-4-4m4 4l-4 4"/></svg>
              Measure
            </button>
          </div>

          {/* Show measurement result */}
          {measureDistance !== null && (
            <div className="ml-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-sm font-medium text-amber-700 flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20M2 12l4-4m-4 4l4 4m16-4l-4-4m4 4l-4 4"/></svg>
              {measureDistance.toFixed(1)} cm <span className="text-amber-500">({(measureDistance / 100).toFixed(2)} m)</span>
            </div>
          )}

          <span className="text-xs text-gray-500 ml-4">
            {appState.selectedRoomIds.length > 1 && `${appState.selectedRoomIds.length} rooms selected`}
          </span>
          {appState.selectedRoomIds.length > 1 && (
            <span className="badge badge-blue ml-2">{appState.selectedRoomIds.length} rooms selected</span>
          )}

          <div className="ml-auto flex items-center gap-4 text-xs text-slate-400">
            <span>Scroll to zoom</span>
            <span className="text-slate-300">•</span>
            <span>M for measure</span>
          </div>
        </div>

        {/* SVG canvas container with overlay */}
        <div className="relative flex-1 w-full h-full">
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className={`absolute inset-0 bg-slate-50 ${
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
              {/* Background grid */}
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                </pattern>
                <pattern id="gridLarge" width="250" height="250" patternUnits="userSpaceOnUse">
                  <path d="M 250 0 L 0 0 0 250" fill="none" stroke="#cbd5e1" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="10000" height="10000" fill="url(#grid)" />
              <rect width="10000" height="10000" fill="url(#gridLarge)" />

              {/* Pre-compute which walls have openings for z-ordering */}
              {(() => {
                // Collect all wall render data
                type WallRenderData = {
                  key: string;
                  roomId: string;
                  wallSide: WallSide;
                  baseX: number;
                  baseY: number;
                  wallWidth: number;
                  wallHeight: number;
                  isHorizontal: boolean;
                  hasOpenings: boolean;
                  openings: WallOpening[];
                  shouldRender: boolean;
                  openingOffset: number; // Offset for door positions (wall extends beyond room)
                };
                
                const wallsWithoutOpenings: WallRenderData[] = [];
                const wallsWithOpenings: WallRenderData[] = [];
                
                appState.rooms.forEach((room) => {
                  const wallThicknessData = {
                    north: room.wallThickness?.north ?? appState.globalWallThicknessCm,
                    south: room.wallThickness?.south ?? appState.globalWallThicknessCm,
                    east: room.wallThickness?.east ?? appState.globalWallThicknessCm,
                    west: room.wallThickness?.west ?? appState.globalWallThicknessCm,
                  };
                  
                  const x = room.xCm * SCALE;
                  const y = room.yCm * SCALE;
                  const w = room.widthCm * SCALE;
                  const h = room.heightCm * SCALE;
                  
                  const n = wallThicknessData.north * SCALE;
                  const s = wallThicknessData.south * SCALE;
                  const eT = wallThicknessData.east * SCALE;
                  const wT = wallThicknessData.west * SCALE;
                  
                  const outerX = x - wT;
                  const outerY = y - n;
                  const outerW = w + wT + eT;
                  const outerH = h + n + s;
                  
                  const roomOpenings = State.getOpeningsForRoom(appState, room.id);
                  
                  const adjacentNorth = State.findAdjacentRoom(appState, room, 'north');
                  const adjacentSouth = State.findAdjacentRoom(appState, room, 'south');
                  const adjacentEast = State.findAdjacentRoom(appState, room, 'east');
                  const adjacentWest = State.findAdjacentRoom(appState, room, 'west');
                  
                  const wallConfigs: Array<{
                    side: WallSide;
                    baseX: number;
                    baseY: number;
                    width: number;
                    height: number;
                    isHorizontal: boolean;
                    adjacent: ReturnType<typeof State.findAdjacentRoom>;
                    openingOffset: number;
                  }> = [
                    { side: 'north', baseX: outerX, baseY: y - n, width: outerW, height: n, isHorizontal: true, adjacent: adjacentNorth, openingOffset: wT },
                    { side: 'south', baseX: outerX, baseY: y + h, width: outerW, height: s, isHorizontal: true, adjacent: adjacentSouth, openingOffset: wT },
                    { side: 'west', baseX: x - wT, baseY: outerY, width: wT, height: outerH, isHorizontal: false, adjacent: adjacentWest, openingOffset: n },
                    { side: 'east', baseX: x + w, baseY: outerY, width: eT, height: outerH, isHorizontal: false, adjacent: adjacentEast, openingOffset: n },
                  ];
                  
                  wallConfigs.forEach((config) => {
                    let shouldRender = true;
                    let openings: WallOpening[] = [];
                    
                    if (config.adjacent) {
                      // Get combined openings from both rooms on shared wall
                      openings = State.getCombinedWallOpenings(appState, room, config.side, config.adjacent);
                      
                      // For shared walls: if there are openings, the room that "owns" the opening should render
                      // Otherwise, use the standard ID-based logic
                      const myOpenings = roomOpenings.filter((o) => o.wall === config.side);
                      const otherRoomOpenings = State.getOpeningsForWall(appState, config.adjacent.otherRoom.id, config.adjacent.otherWall);
                      
                      if (myOpenings.length > 0 || otherRoomOpenings.length > 0) {
                        // There are openings on this shared wall
                        // Only one room should render: prefer the one with openings
                        // If both have openings, use ID-based logic
                        if (myOpenings.length > 0 && otherRoomOpenings.length > 0) {
                          // Both have openings - use standard ID logic
                          shouldRender = State.shouldRenderSharedWall(room, config.adjacent.otherRoom);
                        } else {
                          // Only one has openings - that one renders
                          shouldRender = myOpenings.length > 0;
                        }
                      } else {
                        // No openings on either side - use standard ID logic
                        shouldRender = State.shouldRenderSharedWall(room, config.adjacent.otherRoom);
                      }
                    } else {
                      openings = roomOpenings.filter((o) => o.wall === config.side);
                    }
                    
                    const wallData: WallRenderData = {
                      key: `${room.id}-${config.side}`,
                      roomId: room.id,
                      wallSide: config.side,
                      baseX: config.baseX,
                      baseY: config.baseY,
                      wallWidth: config.width,
                      wallHeight: config.height,
                      isHorizontal: config.isHorizontal,
                      hasOpenings: openings.length > 0,
                      openings,
                      shouldRender,
                      openingOffset: config.openingOffset,
                    };
                    
                    if (shouldRender) {
                      if (openings.length > 0) {
                        wallsWithOpenings.push(wallData);
                      } else {
                        wallsWithoutOpenings.push(wallData);
                      }
                    }
                  });
                });
                
                const wallFill = '#8b7355';
                
                const renderWall = (wall: WallRenderData) => {
                  if (wall.openings.length === 0) {
                    return (
                      <rect
                        key={wall.key}
                        x={wall.baseX}
                        y={wall.baseY}
                        width={wall.wallWidth}
                        height={wall.wallHeight}
                        fill={wallFill}
                        opacity="0.6"
                        pointerEvents="none"
                      />
                    );
                  }
                  
                  const sortedOpenings = [...wall.openings].sort((a, b) => a.positionCm - b.positionCm);
                  const segments: React.ReactNode[] = [];
                  let currentPos = 0;
                  
                  sortedOpenings.forEach((opening, i) => {
                    // Add offset because wall extends beyond room (includes corner overlaps)
                    const openingStart = opening.positionCm * SCALE + wall.openingOffset;
                    const openingWidth = opening.widthCm * SCALE;
                    
                    if (openingStart > currentPos) {
                      if (wall.isHorizontal) {
                        segments.push(
                          <rect
                            key={`${wall.key}-seg-${i}-before`}
                            x={wall.baseX + currentPos}
                            y={wall.baseY}
                            width={openingStart - currentPos}
                            height={wall.wallHeight}
                            fill={wallFill}
                            opacity="0.6"
                            pointerEvents="none"
                          />
                        );
                      } else {
                        segments.push(
                          <rect
                            key={`${wall.key}-seg-${i}-before`}
                            x={wall.baseX}
                            y={wall.baseY + currentPos}
                            width={wall.wallWidth}
                            height={openingStart - currentPos}
                            fill={wallFill}
                            opacity="0.6"
                            pointerEvents="none"
                          />
                        );
                      }
                    }
                    
                    if (wall.isHorizontal) {
                      // Background rect to cover any wall underneath
                      segments.push(
                        <rect
                          key={`${wall.key}-door-bg-${i}`}
                          x={wall.baseX + openingStart}
                          y={wall.baseY}
                          width={openingWidth}
                          height={wall.wallHeight}
                          fill="#f8fafc"
                          pointerEvents="none"
                        />
                      );
                      segments.push(
                        <line
                          key={`${wall.key}-door-${i}`}
                          x1={wall.baseX + openingStart}
                          y1={wall.baseY + wall.wallHeight / 2}
                          x2={wall.baseX + openingStart + openingWidth}
                          y2={wall.baseY + wall.wallHeight / 2}
                          stroke="#4ade80"
                          strokeWidth={3}
                          strokeDasharray="8,4"
                          pointerEvents="none"
                        />
                      );
                    } else {
                      // Background rect to cover any wall underneath
                      segments.push(
                        <rect
                          key={`${wall.key}-door-bg-${i}`}
                          x={wall.baseX}
                          y={wall.baseY + openingStart}
                          width={wall.wallWidth}
                          height={openingWidth}
                          fill="#f8fafc"
                          pointerEvents="none"
                        />
                      );
                      segments.push(
                        <line
                          key={`${wall.key}-door-${i}`}
                          x1={wall.baseX + wall.wallWidth / 2}
                          y1={wall.baseY + openingStart}
                          x2={wall.baseX + wall.wallWidth / 2}
                          y2={wall.baseY + openingStart + openingWidth}
                          stroke="#4ade80"
                          strokeWidth={3}
                          strokeDasharray="8,4"
                          pointerEvents="none"
                        />
                      );
                    }
                    
                    currentPos = openingStart + openingWidth;
                  });
                  
                  const totalLength = wall.isHorizontal ? wall.wallWidth : wall.wallHeight;
                  if (currentPos < totalLength) {
                    if (wall.isHorizontal) {
                      segments.push(
                        <rect
                          key={`${wall.key}-seg-after`}
                          x={wall.baseX + currentPos}
                          y={wall.baseY}
                          width={totalLength - currentPos}
                          height={wall.wallHeight}
                          fill={wallFill}
                          opacity="0.6"
                          pointerEvents="none"
                        />
                      );
                    } else {
                      segments.push(
                        <rect
                          key={`${wall.key}-seg-after`}
                          x={wall.baseX}
                          y={wall.baseY + currentPos}
                          width={wall.wallWidth}
                          height={totalLength - currentPos}
                          fill={wallFill}
                          opacity="0.6"
                          pointerEvents="none"
                        />
                      );
                    }
                  }
                  
                  return <React.Fragment key={wall.key}>{segments}</React.Fragment>;
                };
                
                return (
                  <>
                    {/* Render walls WITHOUT openings first (lower z-index) */}
                    {wallsWithoutOpenings.map(renderWall)}
                    {/* Render walls WITH openings last (higher z-index - doors always visible) */}
                    {wallsWithOpenings.map(renderWall)}
                  </>
                );
              })()}

              {/* Rooms (interiors, labels, handles, objects) */}
              {appState.rooms.map((room) => {
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

                return (
                  <React.Fragment key={room.id}>
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
                  <div className="rounded-lg px-2.5 py-1 shadow-sm border bg-white/95 backdrop-blur-sm border-slate-200 text-slate-700">{def.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Panel: Properties */}
      <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto shadow-sm flex flex-col">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Properties</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5">
        {appState.selectedRoomIds.length > 1 ? (
          // Multi-select panel
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-bold">{appState.selectedRoomIds.length}</span>
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Rooms Selected</h3>
                <p className="text-xs text-slate-400">Arrow keys to nudge</p>
              </div>
            </div>
            <div className="space-y-1.5 mb-6">
              {appState.selectedRoomIds.map((id) => {
                const r = State.getRoomById(appState, id);
                return r ? (
                  <div key={id} className="px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700 font-medium">
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
              className="w-full btn btn-danger"
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
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{objectDef.name}</h3>
                    <p className="text-xs text-slate-400">{objectDef.widthCm} × {objectDef.heightCm} cm</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  
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
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Y (cm)</label>
                      <input
                        type="number"
                        value={Math.round(selectedObject.yCm)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            updateState(State.updatePlacedObjectPosition(appState, selectedObject.id, selectedObject.xCm, val));
                          }
                        }}
                        className="input-field"
                      />
                    </div>
                  </div>
                  
                  {/* Editable Rotation */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Rotation</label>
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
                        className="input-field flex-1"
                      />
                      <span className="text-slate-400">°</span>
                      <button
                        onClick={() => {
                          const current = selectedObject.rotationDeg ?? 0;
                          updateState(State.updatePlacedObjectRotation(appState, selectedObject.id, (current + 90) % 360));
                        }}
                        className="btn btn-secondary"
                        title="Rotate 90°"
                      >
                        ↻ 90°
                      </button>
                    </div>
                  </div>
                  
                  {/* Room (read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">In Room</label>
                    <div className="px-3 py-2 bg-slate-50 rounded-lg text-slate-700 text-sm">{containingRoom?.name ?? 'Unknown'}</div>
                  </div>
                </div>
                  
                <button
                  onClick={() => {
                    if (confirm(`Delete ${objectDef.name}?`)) {
                      handleDeleteSelected();
                    }
                  }}
                  className="w-full btn btn-danger mt-6"
                >
                    Delete Object
                </button>
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
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            </div>
            <p className="text-slate-500 font-medium">No Selection</p>
            <p className="text-xs text-slate-400 mt-1">Select a room or object to edit</p>
          </div>
        )}
        </div>
      </div>

      {/* Keyboard shortcuts help */}
      <div className="fixed bottom-4 right-4 bg-slate-800/90 backdrop-blur-sm text-white text-xs px-4 py-3 rounded-xl shadow-lg">
        <div className="font-semibold mb-1.5 text-slate-300">Shortcuts</div>
        <div className="space-y-0.5 text-slate-400">
          <div><span className="text-white">Ctrl+Z</span> Undo • <span className="text-white">Ctrl+Y</span> Redo</div>
          <div><span className="text-white">Del</span> Delete • <span className="text-white">M</span> Measure</div>
          <div><span className="text-white">Ctrl+A</span> Select All • <span className="text-white">Esc</span> Deselect</div>
        </div>
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
        <label className="block text-sm font-medium text-slate-600 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Living Room"
          className="input-field"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Width (cm)</label>
          <input
            type="number"
            min="1"
            value={widthCm}
            onChange={(e) => setWidthCm(Number(e.target.value))}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Height (cm)</label>
          <input
            type="number"
            min="1"
            value={heightCm}
            onChange={(e) => setHeightCm(Number(e.target.value))}
            className="input-field"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full btn btn-primary"
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
    <form onSubmit={submit} className="space-y-2">
      <input 
        value={name} 
        onChange={(e) => setName(e.target.value)} 
        placeholder="Object name"
        className="input-field" 
      />
      <div className="flex gap-2">
        <input 
          type="number" 
          min={1} 
          value={widthCm} 
          onChange={(e)=>setWidthCm(Number(e.target.value))} 
          className="input-field" 
          placeholder="W"
        />
        <input 
          type="number" 
          min={1} 
          value={heightCm} 
          onChange={(e)=>setHeightCm(Number(e.target.value))} 
          className="input-field" 
          placeholder="H"
        />
      </div>
      <button type="submit" className="w-full btn bg-emerald-600 hover:bg-emerald-700 text-white">
        Add Object
      </button>
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
      {/* Room header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameChange}
            className="font-semibold text-slate-800 bg-transparent border-none outline-none w-full focus:ring-0 p-0"
          />
          <p className="text-xs text-slate-400">{room.widthCm} × {room.heightCm} cm</p>
        </div>
      </div>

      {/* Dimensions */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-slate-600 mb-2">Dimensions</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Width (cm)</label>
            <input
              type="number"
              min="1"
              step="10"
              value={widthCm}
              onChange={(e) => setWidthCm(Number(e.target.value))}
              onBlur={handleDimensionsChange}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Height (cm)</label>
            <input
              type="number"
              min="1"
              step="10"
              value={heightCm}
              onChange={(e) => setHeightCm(Number(e.target.value))}
              onBlur={handleDimensionsChange}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Wall Thickness */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-600">Wall Thickness</label>
          <span className="text-xs text-slate-400">Default: {globalWallThickness}cm</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">North</label>
            <input
              type="number"
              min="0"
              step="1"
              value={wallNorth}
              onChange={(e) => setWallNorth(e.target.value)}
              onBlur={handleWallThicknessChange}
              placeholder="—"
              className="input-field text-center"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">South</label>
            <input
              type="number"
              min="0"
              step="1"
              value={wallSouth}
              onChange={(e) => setWallSouth(e.target.value)}
              onBlur={handleWallThicknessChange}
              placeholder="—"
              className="input-field text-center"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">East</label>
            <input
              type="number"
              min="0"
              step="1"
              value={wallEast}
              onChange={(e) => setWallEast(e.target.value)}
              onBlur={handleWallThicknessChange}
              placeholder="—"
              className="input-field text-center"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">West</label>
            <input
              type="number"
              min="0"
              step="1"
              value={wallWest}
              onChange={(e) => setWallWest(e.target.value)}
              onBlur={handleWallThicknessChange}
              placeholder="—"
              className="input-field text-center"
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
        className="w-full btn btn-danger"
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
    <div className="mt-6 pt-6 border-t border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Door Openings</h3>

      {/* Add New Door */}
      <div className="bg-slate-50 rounded-lg p-3 space-y-3 mb-4">
        <p className="text-xs font-medium text-slate-500">Add New Door</p>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Wall</label>
          <select
            value={selectedWall}
            onChange={(e) => setSelectedWall(e.target.value as WallSide)}
            className="input-field"
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
            <label className="block text-xs text-slate-400 mb-1">Position (cm)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={positionCm}
              onChange={(e) => setPositionCm(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Width (cm)</label>
            <input
              type="number"
              min="10"
              step="1"
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <button
          onClick={handleAddDoor}
          className="w-full btn bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          Add Door
        </button>

        <p className="text-xs text-slate-400">
          Tip: Use the Measure tool (M) to find the exact position.
        </p>
      </div>

      {/* Existing Doors List */}
      {openings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Existing Doors ({openings.length})</p>

          {openings.map((opening) => (
            <div
              key={opening.id}
              className="bg-white border border-slate-200 rounded-lg p-2.5 text-sm"
            >
              {editingId === opening.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 w-16">{wallLabels[opening.wall].split(' ')[0]}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-400">Position</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editPosition}
                        onChange={(e) => setEditPosition(e.target.value)}
                        className="input-field text-xs py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400">Width</label>
                      <input
                        type="number"
                        min="10"
                        step="1"
                        value={editWidth}
                        onChange={(e) => setEditWidth(e.target.value)}
                        className="input-field text-xs py-1"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleSaveEdit(opening)}
                      className="flex-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-md font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-md font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-700">{wallLabels[opening.wall].split(' ')[0]}</span>
                    <span className="text-slate-500 ml-2">
                      {opening.positionCm}cm → {opening.positionCm + opening.widthCm}cm
                    </span>
                    <span className="text-slate-400 text-xs ml-1">({opening.widthCm}cm)</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleStartEdit(opening)}
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md transition-all"
                      title="Edit"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      onClick={() => onDeleteDoor(opening.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-all"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {openings.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-4">
          No doors added yet
        </p>
      )}
    </div>
  );
}
