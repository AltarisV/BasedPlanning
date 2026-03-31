'use client';

import { useCallback } from 'react';
import { AppState, HistoryState, ExtendedDragState, ResizeHandle, ToolMode, MeasurePoint, WallSide } from '@/src/model/types';
import * as State from '@/src/model/state';
import * as Interaction from '@/src/editor/Interaction';
import * as Snap from '@/src/editor/Snap';
import { getRotatedBoundingBox } from '@/src/utils/geometry';

interface UseSvgPointerHandlersProps {
  appState: AppState;
  svgRef: React.RefObject<SVGSVGElement | null>;
  dragState: ExtendedDragState | null;
  setDragState: (state: ExtendedDragState | null) => void;
  toolMode: ToolMode;
  measurePoints: MeasurePoint[];
  setMeasurePoints: (points: MeasurePoint[]) => void;
  setCurrentSnapResult: (result: Snap.SnapResult | null) => void;
  updateState: (state: AppState, recordInHistory?: boolean) => void;
  setHistory: React.Dispatch<React.SetStateAction<HistoryState>>;
  handleSelectRoom: (roomId: string | null, addToSelection?: boolean) => void;
}

export function useSvgPointerHandlers({
  appState,
  svgRef,
  dragState,
  setDragState,
  toolMode,
  measurePoints,
  setMeasurePoints,
  setCurrentSnapResult,
  updateState,
  setHistory,
  handleSelectRoom,
}: UseSvgPointerHandlersProps) {
  
  const handleSvgPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    // Middle mouse button (button === 1) always starts panning from anywhere
    if (e.button === 1) {
      e.preventDefault();
      svgRef.current.setPointerCapture(e.pointerId);
      setDragState({
        roomId: '__pan__',
        startX: e.clientX,
        startY: e.clientY,
        roomStartX: appState.panX,
        roomStartY: appState.panY,
      });
      return;
    }

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
        setMeasurePoints([{ xCm, yCm }]);
      }
      return;
    }

    svgRef.current.setPointerCapture(e.pointerId);

    // Find if pointer is on a resize handle first
    const target = e.target as Element;
    const resizeEl = target.closest?.('[data-resize-handle]') as Element | null;
    const resizeHandle = resizeEl?.getAttribute('data-resize-handle') as ResizeHandle | null;
    const resizeRoomId = resizeEl?.getAttribute('data-room-id');

    // Find if pointer is on a placed object first, then a room
    const placedEl = target.closest?.('[data-placed-id]') as Element | null;
    const placedId = placedEl?.getAttribute('data-placed-id');
    const roomEl = target.closest?.('[data-room-id]') as Element | null;
    const roomId = roomEl?.getAttribute('data-room-id');

    // If clicked on a resize handle, start resize (unless room is locked)
    if (resizeHandle && resizeRoomId) {
      const room = State.getRoomById(appState, resizeRoomId);
      if (room && !room.locked) {
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

      const addToSelection = e.shiftKey;
      const isAlreadySelected = appState.selectedRoomIds.includes(room.id);
      
      if (addToSelection) {
        handleSelectRoom(room.id, true);
        return;
      }
      
      if (!isAlreadySelected) {
        handleSelectRoom(room.id);
      }

      // If room is locked, don't allow dragging - just select and allow panning
      if (room.locked) {
        return;
      }

      const selectedIds = isAlreadySelected ? appState.selectedRoomIds : [room.id];
      // Filter out locked rooms from multi-drag
      const multiDragRooms = selectedIds.map((id) => {
        const r = State.getRoomById(appState, id);
        return r && !r.locked ? { id: r.id, startXCm: r.xCm, startYCm: r.yCm } : null;
      }).filter(Boolean) as Array<{ id: string; startXCm: number; startYCm: number }>;

      // If all selected rooms are locked, don't start dragging
      if (multiDragRooms.length === 0) {
        return;
      }

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
  }, [appState, svgRef, toolMode, measurePoints, setMeasurePoints, setDragState, updateState, handleSelectRoom]);

  const handleSvgPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || !dragState) return;

    // Panning - with speed multiplier for faster navigation
    if (dragState.roomId === '__pan__') {
      const panSpeed = 5.0; // Increased for much faster panning
      const deltaX = (e.clientX - dragState.startX) * panSpeed;
      const deltaY = (e.clientY - dragState.startY) * panSpeed;
      const newPanX = dragState.roomStartX + deltaX;
      const newPanY = dragState.roomStartY + deltaY;
      updateState(State.updateViewport(appState, newPanX, newPanY, appState.zoom), false);
      return;
    }

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

      if (handle.includes('e')) newW = Math.max(10, initial.widthCm + deltaCmX);
      if (handle.includes('w')) {
        const delta = Math.min(deltaCmX, initial.widthCm - 10);
        newX = initial.xCm + delta;
        newW = initial.widthCm - delta;
      }
      if (handle.includes('s')) newH = Math.max(10, initial.heightCm + deltaCmY);
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
      if (!def) return;

      // Use individual size if set, otherwise fall back to ObjectDef size
      const objWidth = placed.widthCm ?? def.widthCm;
      const objHeight = placed.heightCm ?? def.heightCm;

      const getVisualBounds = (objXCm: number, objYCm: number, origW: number, origH: number, rotationDeg: number) => {
        const normalizedAngle = ((rotationDeg % 360) + 360) % 360;
        if (normalizedAngle === 0) return { x: objXCm, y: objYCm, w: origW, h: origH };
        const centerX = objXCm + origW / 2;
        const centerY = objYCm + origH / 2;
        const bbox = getRotatedBoundingBox(origW, origH, normalizedAngle);
        return { x: centerX - bbox.width / 2, y: centerY - bbox.height / 2, w: bbox.width, h: bbox.height };
      };

      const visualToStorage = (visualX: number, visualY: number, origW: number, origH: number, rotationDeg: number) => {
        const normalizedAngle = ((rotationDeg % 360) + 360) % 360;
        if (normalizedAngle === 0) return { xCm: visualX, yCm: visualY };
        const bbox = getRotatedBoundingBox(origW, origH, normalizedAngle);
        const centerX = visualX + bbox.width / 2;
        const centerY = visualY + bbox.height / 2;
        return { xCm: centerX - origW / 2, yCm: centerY - origH / 2 };
      };

      const currentRotation = placed.rotationDeg ?? 0;
      
      // Find the current room the object is being dragged over (for snapping)
      const currentRoomId = State.findRoomAtPosition(appState, xCm, yCm, objWidth, objHeight);
      const room = currentRoomId ? appState.rooms.find((r) => r.id === currentRoomId) : appState.rooms.find((r) => r.id === placed.roomId);
      
      // If object is over a room, use room-based snapping
      if (room) {
        const otherObjectsInRoom: Snap.PlacedObjectForSnap[] = (appState.placedObjects ?? [])
          .filter((p) => p.roomId === room.id && p.id !== placed.id)
          .map((p) => {
            const objDef = (appState.objectDefs ?? []).find((d) => d.id === p.defId);
            if (!objDef) return null;
            // Use individual size if set, otherwise fall back to ObjectDef size
            const pWidth = p.widthCm ?? objDef.widthCm;
            const pHeight = p.heightCm ?? objDef.heightCm;
            const visual = getVisualBounds(p.xCm, p.yCm, pWidth, pHeight, p.rotationDeg ?? 0);
            return { id: p.id, xCm: visual.x, yCm: visual.y, widthCm: visual.w, heightCm: visual.h };
          })
          .filter((p): p is Snap.PlacedObjectForSnap => p !== null);

        const visualBounds = getVisualBounds(xCm, yCm, objWidth, objHeight, currentRotation);

        const snapRes = Snap.calculatePlacedObjectSnap(
          visualBounds.w, visualBounds.h, room, visualBounds.x, visualBounds.y,
          Snap.OBJECT_SNAP_TOLERANCE_CM, otherObjectsInRoom, placed.id
        );
        
        const storageCoords = visualToStorage(snapRes.xCm, snapRes.yCm, objWidth, objHeight, currentRotation);
        setCurrentSnapResult(snapRes);
        // Use position with room detection to auto-assign room
        updateState(State.updatePlacedObjectPositionWithRoomDetection(appState, placed.id, storageCoords.xCm, storageCoords.yCm), false);
      } else {
        // No room under object - just move freely
        const storageCoords = visualToStorage(xCm, yCm, objWidth, objHeight, currentRotation);
        setCurrentSnapResult(null);
        updateState(State.updatePlacedObjectPositionWithRoomDetection(appState, placed.id, storageCoords.xCm, storageCoords.yCm), false);
      }
      return;
    }

    // Dragging room(s)
    if (dragState.targetType === 'room' && dragState.multiDragRooms && dragState.multiDragRooms.length > 0) {
      const room = State.getRoomById(appState, dragState.roomId);
      if (!room) return;

      const snap = Snap.calculateSnap(room, appState.rooms, xCm, yCm, appState.globalWallThicknessCm);
      setCurrentSnapResult(snap);

      const constrained = Interaction.constrainRoomPosition(snap.xCm, snap.yCm);
      const deltaX = constrained.xCm - dragState.roomStartX;
      const deltaY = constrained.yCm - dragState.roomStartY;

      const roomMoves = dragState.multiDragRooms.map((r) => ({
        id: r.id,
        xCm: Math.max(0, r.startXCm + deltaX),
        yCm: Math.max(0, r.startYCm + deltaY),
      }));

      updateState(State.moveRooms(appState, roomMoves), false);
    }
  }, [appState, svgRef, dragState, setCurrentSnapResult, updateState]);

  const handleSvgPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragState && dragState.roomId !== '__pan__') {
      setHistory((prev) => State.recordHistory({ ...prev, present: appState }, appState));
    }
    
    if (svgRef.current) {
      try {
        svgRef.current.releasePointerCapture(e.pointerId);
      } catch { /* ignore */ }
    }
    setDragState(null);
    setCurrentSnapResult(null);
  }, [appState, svgRef, dragState, setDragState, setCurrentSnapResult, setHistory]);

  const handleSvgWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const deltaY = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(3, appState.zoom * deltaY));
    updateState(State.updateViewport(appState, appState.panX, appState.panY, newZoom), false);
  }, [appState, updateState]);

  return {
    handleSvgPointerDown,
    handleSvgPointerMove,
    handleSvgPointerUp,
    handleSvgWheel,
  };
}
