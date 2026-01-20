'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AppState, HistoryState, ExtendedDragState, ToolMode, MeasurePoint, WallSide, WallOpening, OpeningType } from '@/src/model/types';
import * as State from '@/src/model/state';
import * as Snap from '@/src/editor/Snap';
import { saveState, loadState, exportStateAsJson, importStateFromJson } from '@/src/storage/localStorage';

// Components
import { LeftPanel, RightPanel } from './components/panels';
import { KeyboardShortcutsHelp, SvgCanvas, EditorToolbarFull } from './components/editor';
import { SCALE, NUDGE_AMOUNT, NUDGE_AMOUNT_SHIFT, DEFAULT_DOOR_WIDTH } from './components/constants/editor';

// Hooks
import { useSvgPointerHandlers, useTouchGestures } from './hooks';

/**
 * Main room editor component with three-panel layout:
 * - Left: Add room form + global settings
 * - Center: SVG editor with pan, zoom, drag
 * - Right: Selected room properties
 */
export default function RoomEditor() {
  // History state for undo/redo
  const [history, setHistory] = useState<HistoryState>(() => State.createInitialHistory());
  const appState = history.present;
  
  // Tool mode state
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
  
  // Mobile panel visibility
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  
  // Desktop panel collapsed state
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  
  // Drag state
  const [dragState, setDragState] = useState<ExtendedDragState | null>(null);
  const [currentSnapResult, setCurrentSnapResult] = useState<Snap.SnapResult | null>(null);
  const [svgDimensions, setSvgDimensions] = useState({ width: 1000, height: 1000 });
  
  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to update state with history tracking
  const updateState = useCallback((newState: AppState, recordInHistory = true) => {
    setHistory((prev) => {
      if (recordInHistory) {
        return State.recordHistory(prev, newState);
      }
      return { ...prev, present: newState };
    });
  }, []);
  
  // Undo/Redo handlers
  const handleUndo = useCallback(() => setHistory((prev) => State.undo(prev)), []);
  const handleRedo = useCallback(() => setHistory((prev) => State.redo(prev)), []);

  // Room selection handler
  const handleSelectRoom = useCallback((roomId: string | null, addToSelection = false) => {
    if (roomId === null) {
      updateState(State.clearSelection(appState), false);
    } else if (addToSelection) {
      updateState(State.toggleRoomSelection(appState, roomId), false);
    } else {
      updateState(State.selectRoom(appState, roomId), false);
    }
  }, [appState, updateState]);

  // SVG pointer handlers hook
  const { handleSvgPointerDown, handleSvgPointerMove, handleSvgPointerUp, handleSvgWheel } = useSvgPointerHandlers({
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
  });

  // Touch gestures hook (pinch-to-zoom, two-finger pan)
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useTouchGestures({
    appState,
    svgRef,
    updateState,
  });

  // Types for label positions
  type RoomLabelPos = { roomId: string; x: number; y: number; isSelected: boolean; placement: 'above' | 'below' | 'center' };
  type PlacedLabelPos = { placedId: string; x: number; y: number };

  // Calculate label positions for HTML overlay
  const { roomLabelPositions, placedLabelPositions } = useMemo((): { roomLabelPositions: RoomLabelPos[]; placedLabelPositions: PlacedLabelPos[] } => {
    const vbSize = 10000;
    const svgEl = svgRef.current;
    if (!svgEl) return { roomLabelPositions: [], placedLabelPositions: [] };

    const rect = svgEl.getBoundingClientRect();
    const scaleToScreen = Math.min(rect.width / vbSize, rect.height / vbSize);
    const offsetX = (rect.width - vbSize * scaleToScreen) / 2;
    const offsetY = (rect.height - vbSize * scaleToScreen) / 2;

    // Helper: check if a label position would overlap with walls or other rooms
    const checkLabelOverlap = (
      labelCenterXCm: number,
      labelCenterYCm: number,
      labelWidthCm: number,
      labelHeightCm: number,
      excludeRoomId: string
    ): boolean => {
      const labelLeft = labelCenterXCm - labelWidthCm / 2;
      const labelRight = labelCenterXCm + labelWidthCm / 2;
      const labelTop = labelCenterYCm - labelHeightCm / 2;
      const labelBottom = labelCenterYCm + labelHeightCm / 2;
      
      // Check against all rooms (including walls)
      for (const otherRoom of appState.rooms) {
        if (otherRoom.id === excludeRoomId) continue;
        
        // Get wall thickness
        const wallN = otherRoom.wallThickness?.north ?? appState.globalWallThicknessCm;
        const wallS = otherRoom.wallThickness?.south ?? appState.globalWallThicknessCm;
        const wallW = otherRoom.wallThickness?.west ?? appState.globalWallThicknessCm;
        const wallE = otherRoom.wallThickness?.east ?? appState.globalWallThicknessCm;
        
        // Room bounds including walls
        const roomLeft = otherRoom.xCm - wallW;
        const roomRight = otherRoom.xCm + otherRoom.widthCm + wallE;
        const roomTop = otherRoom.yCm - wallN;
        const roomBottom = otherRoom.yCm + otherRoom.heightCm + wallS;
        
        // Check overlap
        if (labelRight > roomLeft && labelLeft < roomRight && labelBottom > roomTop && labelTop < roomBottom) {
          return true;
        }
      }
      
      // Also check if label is outside the current room's walls
      const currentRoom = appState.rooms.find(r => r.id === excludeRoomId);
      if (currentRoom) {
        const wallN = currentRoom.wallThickness?.north ?? appState.globalWallThicknessCm;
        const wallS = currentRoom.wallThickness?.south ?? appState.globalWallThicknessCm;
        const wallW = currentRoom.wallThickness?.west ?? appState.globalWallThicknessCm;
        const wallE = currentRoom.wallThickness?.east ?? appState.globalWallThicknessCm;
        
        // Check if overlapping with own walls
        const roomLeft = currentRoom.xCm - wallW;
        const roomRight = currentRoom.xCm + currentRoom.widthCm + wallE;
        const roomTop = currentRoom.yCm - wallN;
        const roomBottom = currentRoom.yCm + currentRoom.heightCm + wallS;
        const innerTop = currentRoom.yCm;
        const innerBottom = currentRoom.yCm + currentRoom.heightCm;
        
        // If label is in the wall area (between outer and inner boundary)
        if (labelTop < innerTop && labelBottom > roomTop && labelRight > roomLeft && labelLeft < roomRight) {
          return true; // overlapping north wall
        }
        if (labelBottom > innerBottom && labelTop < roomBottom && labelRight > roomLeft && labelLeft < roomRight) {
          return true; // overlapping south wall
        }
      }
      
      return false;
    };

    const rooms: RoomLabelPos[] = appState.rooms.map((room) => {
      const roomCenterX = room.xCm + room.widthCm / 2;
      
      // Estimate label size in cm (based on room name length and typical font size)
      const estimatedLabelWidthCm = Math.max(room.name.length * 8, 60); // ~8cm per char, min 60cm
      const estimatedLabelHeightCm = 30; // ~30cm height
      
      // Get wall thickness
      const wallN = room.wallThickness?.north ?? appState.globalWallThicknessCm;
      const wallS = room.wallThickness?.south ?? appState.globalWallThicknessCm;
      
      // Try position ABOVE room (outside north wall)
      const aboveY = room.yCm - wallN - estimatedLabelHeightCm / 2 - 5;
      const aboveOverlaps = checkLabelOverlap(roomCenterX, aboveY, estimatedLabelWidthCm, estimatedLabelHeightCm, room.id);
      
      // Try position BELOW room (outside south wall)  
      const belowY = room.yCm + room.heightCm + wallS + estimatedLabelHeightCm / 2 + 5;
      const belowOverlaps = checkLabelOverlap(roomCenterX, belowY, estimatedLabelWidthCm, estimatedLabelHeightCm, room.id);
      
      // Determine best placement
      let placement: 'above' | 'below' | 'center' = 'center';
      let labelYCm: number;
      
      if (!aboveOverlaps) {
        placement = 'above';
        labelYCm = aboveY;
      } else if (!belowOverlaps) {
        placement = 'below';
        labelYCm = belowY;
      } else {
        // Fallback: center in room
        placement = 'center';
        labelYCm = room.yCm + room.heightCm / 2;
      }
      
      // Convert to screen coordinates
      const contentX = roomCenterX * SCALE;
      const contentY = labelYCm * SCALE;
      const transformedX = appState.panX + appState.zoom * contentX;
      const transformedY = appState.panY + appState.zoom * contentY;
      
      return { 
        roomId: room.id, 
        x: offsetX + transformedX * scaleToScreen, 
        y: offsetY + transformedY * scaleToScreen, 
        isSelected: appState.selectedRoomIds.includes(room.id),
        placement
      };
    });

    const placed: PlacedLabelPos[] = (appState.placedObjects ?? []).map((p) => {
      const def = appState.objectDefs?.find((d) => d.id === p.defId);
      if (!def) return null;
      const contentX = p.xCm * SCALE + (def.widthCm * SCALE) / 2;
      const contentY = p.yCm * SCALE + (def.heightCm * SCALE) / 2;
      const transformedX = appState.panX + appState.zoom * contentX;
      const transformedY = appState.panY + appState.zoom * contentY;
      return { placedId: p.id, x: offsetX + transformedX * scaleToScreen, y: offsetY + transformedY * scaleToScreen };
    }).filter((p): p is PlacedLabelPos => p !== null);

    return { roomLabelPositions: rooms, placedLabelPositions: placed };
  }, [appState.rooms, appState.placedObjects, appState.objectDefs, appState.panX, appState.panY, appState.zoom, appState.selectedRoomIds, svgDimensions, appState.globalWallThicknessCm]);

  // Load state from localStorage on mount
  useEffect(() => {
    const loaded = loadState() as any;
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
  useEffect(() => { saveState(appState); }, [appState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); updateState(State.selectAllRooms(appState), false); return; }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (appState.selectedObjectId) { e.preventDefault(); updateState(State.deleteSelectedObject(appState)); return; }
        if (appState.selectedRoomIds.length > 0) { e.preventDefault(); updateState(State.deleteRooms(appState, appState.selectedRoomIds)); }
        return;
      }

      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (arrowKeys.includes(e.key)) {
        // Nudge selected object
        if (appState.selectedObjectId) {
          e.preventDefault();
          const amount = e.shiftKey ? NUDGE_AMOUNT_SHIFT : NUDGE_AMOUNT;
          let dx = 0, dy = 0;
          if (e.key === 'ArrowUp') dy = -amount;
          if (e.key === 'ArrowDown') dy = amount;
          if (e.key === 'ArrowLeft') dx = -amount;
          if (e.key === 'ArrowRight') dx = amount;
          updateState(State.nudgeSelectedObject(appState, dx, dy));
          return;
        }
        // Nudge selected rooms
        if (appState.selectedRoomIds.length > 0) {
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
      }

      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setToolMode(toolMode === 'measure' ? 'select' : 'measure'); setMeasurePoints([]); return; }
      if (e.key === 'Escape') {
        if (toolMode !== 'select') { setToolMode('select'); setMeasurePoints([]); }
        else { updateState(State.clearSelection(appState), false); }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, handleUndo, handleRedo, updateState, toolMode]);

  // Room handlers
  const handleAddRoom = (name: string, widthCm: number, heightCm: number) => updateState(State.addRoom(appState, name, widthCm, heightCm));
  const handleDeleteRoom = (roomId: string) => updateState(State.deleteRoom(appState, roomId));
  const handleDeleteSelected = () => {
    if (appState.selectedObjectId) updateState(State.deleteSelectedObject(appState));
    else if (appState.selectedRoomIds.length > 0) updateState(State.deleteRooms(appState, appState.selectedRoomIds));
  };
  const handleUpdateRoomName = (roomId: string, name: string) => updateState(State.updateRoomName(appState, roomId, name));
  const handleUpdateRoomDimensions = (roomId: string, widthCm: number, heightCm: number) => updateState(State.updateRoomDimensions(appState, roomId, widthCm, heightCm));
  const handleUpdateGlobalWallThickness = (thickness: number) => updateState(State.updateGlobalWallThickness(appState, thickness));
  const handleUpdateRoomWallThickness = (roomId: string, wallThickness: any) => updateState(State.updateRoomWallThickness(appState, roomId, wallThickness));

  // Object handlers
  const handleAddObjectDef = (name: string, widthCm: number, heightCm: number) => updateState(State.addObjectDef(appState, name, widthCm, heightCm));
  const handlePlaceObjectDef = (defId: string) => {
    const def = appState.objectDefs?.find((d) => d.id === defId);
    const selectedRoomId = appState.selectedRoomIds[0];
    const room = selectedRoomId ? State.getRoomById(appState, selectedRoomId) : undefined;
    if (!def || !room) return;
    const xCm = room.xCm + (room.widthCm - def.widthCm) / 2;
    const yCm = room.yCm + (room.heightCm - def.heightCm) / 2;
    updateState(State.placeObject(appState, defId, room.id, xCm, yCm));
  };
  const handleDuplicatePlaced = (placedId: string) => updateState(State.duplicatePlacedObject(appState, placedId));

  // Door/Window handlers
  const handleAddOpening = (roomId: string, wall: WallSide, positionCm: number, widthCm: number, type: OpeningType) => updateState(State.addWallOpening(appState, roomId, wall, type, positionCm, widthCm));
  const handleUpdateDoor = (openingId: string, updates: Partial<WallOpening>) => updateState(State.updateWallOpening(appState, openingId, updates.positionCm, updates.widthCm, updates.type));
  const handleDeleteDoor = (openingId: string) => updateState(State.deleteWallOpening(appState, openingId));

  // Export/Import
  const handleExport = () => exportStateAsJson(appState);
  const handleImport = async (file: File) => {
    try {
      const imported = await importStateFromJson(file) as any;
      const migratedState: AppState = { ...imported, selectedRoomIds: imported.selectedRoomIds ?? (imported.selectedRoomId ? [imported.selectedRoomId] : []) };
      setHistory({ past: [], present: migratedState, future: [] });
    } catch (error) { alert('Failed to import file: ' + (error as Error).message); }
  };

  // Computed values
  const measureDistance = useMemo(() => {
    if (measurePoints.length !== 2) return null;
    const [p1, p2] = measurePoints;
    return Math.sqrt((p2.xCm - p1.xCm) ** 2 + (p2.yCm - p1.yCm) ** 2);
  }, [measurePoints]);

  const selectedRoom = appState.selectedRoomIds.length === 1 ? State.getRoomById(appState, appState.selectedRoomIds[0]) : undefined;

  return (
    <div className="h-screen flex bg-slate-100" ref={containerRef} tabIndex={-1}>
      {/* Left Panel */}
      <LeftPanel
        appState={appState}
        history={history}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAddRoom={handleAddRoom}
        onUpdateGlobalWallThickness={handleUpdateGlobalWallThickness}
        onExport={handleExport}
        onImport={handleImport}
        onAddObjectDef={handleAddObjectDef}
        onPlaceObjectDef={handlePlaceObjectDef}
        onSelectRoom={handleSelectRoom}
        onSelectObject={(objectId) => updateState(State.selectObject(appState, objectId), false)}
        onDuplicatePlaced={handleDuplicatePlaced}
        onRotatePlaced={(objectId, rotation) => updateState(State.updatePlacedObjectRotation(appState, objectId, rotation))}
        isMobileOpen={leftPanelOpen}
        isCollapsed={leftPanelCollapsed}
        onClose={() => setLeftPanelOpen(false)}
      />

      {/* Center Panel: SVG Editor */}
      <div className="flex-1 bg-white overflow-hidden flex flex-col">
        <EditorToolbarFull
          appState={appState}
          toolMode={toolMode}
          measureDistance={measureDistance}
          allRoomsLocked={State.areAllRoomsLocked(appState)}
          leftPanelCollapsed={leftPanelCollapsed}
          rightPanelCollapsed={rightPanelCollapsed}
          onZoomIn={() => updateState(State.updateViewport(appState, appState.panX, appState.panY, Math.min(3, appState.zoom + 0.2)), false)}
          onZoomOut={() => updateState(State.updateViewport(appState, appState.panX, appState.panY, Math.max(0.1, appState.zoom - 0.2)), false)}
          onResetView={() => updateState(State.updateViewport(appState, 50, 50, 1), false)}
          onSelectTool={() => { setToolMode('select'); setMeasurePoints([]); }}
          onMeasureTool={() => { setToolMode('measure'); setMeasurePoints([]); }}
          onToggleLockAll={() => updateState(State.setAllRoomsLocked(appState, !State.areAllRoomsLocked(appState)))}
          onToggleLeftPanel={() => setLeftPanelOpen(prev => !prev)}
          onToggleRightPanel={() => setRightPanelOpen(prev => !prev)}
          onCollapseLeftPanel={() => setLeftPanelCollapsed(prev => !prev)}
          onCollapseRightPanel={() => setRightPanelCollapsed(prev => !prev)}
          onDeleteAllObjects={() => {
            if (window.confirm('Delete ALL objects? This will remove all placed objects and all object definitions. This cannot be undone.')) {
              updateState(State.deleteAllObjects(appState));
            }
          }}
        />

        <div className="relative flex-1 w-full h-full">
          <SvgCanvas
            appState={appState}
            svgRef={svgRef}
            dragState={dragState}
            snap={currentSnapResult}
            measurePoints={measurePoints}
            measureDistance={measureDistance}
            toolMode={toolMode}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onWheel={handleSvgWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />

          {/* HTML overlay for labels */}
          <div className="pointer-events-none absolute inset-0 z-10">
            {roomLabelPositions.map((label) => {
              const room = appState.rooms.find((r) => r.id === label.roomId);
              // Different transform based on placement
              const transform = label.placement === 'center' 
                ? 'translate(-50%, -50%)' 
                : 'translate(-50%, -50%)'; // For above/below, position is already calculated correctly
              return (
                <div key={label.roomId} style={{ position: 'absolute', left: `${label.x}px`, top: `${label.y}px`, transform, fontSize: '13px', lineHeight: '16px', whiteSpace: 'nowrap', fontWeight: 500, zIndex: 20 }} className={`rounded-md px-2 py-1 shadow-sm border ${label.isSelected ? 'bg-blue-50 border-blue-300 text-blue-900' : 'bg-white/90 border-gray-200 text-gray-700'}`}>
                  <div>{room?.name}</div>
                </div>
              );
            })}
            {placedLabelPositions.map((label) => {
              const placed = (appState.placedObjects ?? []).find((p) => p.id === label.placedId);
              const def = placed ? (appState.objectDefs ?? []).find((d) => d.id === placed.defId) : undefined;
              if (!placed || !def) return null;
              
              // Calculate object size in screen pixels
              const svgEl = svgRef.current;
              if (!svgEl) return null;
              const rect = svgEl.getBoundingClientRect();
              const vbSize = 10000;
              const scaleToScreen = Math.min(rect.width / vbSize, rect.height / vbSize);
              
              // Get object dimensions (use individual size if set)
              const objWidthCm = placed.widthCm ?? def.widthCm;
              const objHeightCm = placed.heightCm ?? def.heightCm;
              const objWidthPx = objWidthCm * SCALE * appState.zoom * scaleToScreen;
              const objHeightPx = objHeightCm * SCALE * appState.zoom * scaleToScreen;
              const minDimPx = Math.min(objWidthPx, objHeightPx);
              
              // Hide label if object is too small on screen
              if (minDimPx < 30) return null;
              
              // Scale font size based on object size
              const baseFontSize = Math.min(13, Math.max(8, minDimPx * 0.25));
              
              // Check if text fits, truncate if needed
              const charWidth = baseFontSize * 0.6;
              const maxChars = Math.floor(objWidthPx * 0.9 / charWidth);
              let displayText = def.name;
              if (def.name.length > maxChars && maxChars >= 2) {
                displayText = def.name.slice(0, maxChars - 1) + '…';
              } else if (maxChars < 2) {
                return null;
              }
              
              return (
                <div key={label.placedId} style={{ position: 'absolute', left: `${label.x}px`, top: `${label.y}px`, transform: 'translate(-50%, -50%)', fontSize: `${baseFontSize}px`, lineHeight: '1.2', whiteSpace: 'nowrap', fontWeight: 500, zIndex: 20 }}>
                  <div className="rounded-lg px-1.5 py-0.5 shadow-sm border bg-white/95 backdrop-blur-sm border-slate-200 text-slate-700">{displayText}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <RightPanel
        appState={appState}
        selectedRoom={selectedRoom}
        onUpdateRoomName={handleUpdateRoomName}
        onUpdateRoomDimensions={handleUpdateRoomDimensions}
        onUpdateRoomWallThickness={handleUpdateRoomWallThickness}
        onDeleteRoom={handleDeleteRoom}
        onDeleteSelected={handleDeleteSelected}
        onToggleRoomLock={(roomId) => updateState(State.toggleRoomLock(appState, roomId))}
        onAddOpening={handleAddOpening}
        onUpdateDoor={handleUpdateDoor}
        onDeleteDoor={handleDeleteDoor}
        onUpdatePlacedObjectPosition={(objectId, x, y) => updateState(State.updatePlacedObjectPosition(appState, objectId, x, y))}
        onUpdatePlacedObjectRotation={(objectId, rotation) => updateState(State.updatePlacedObjectRotation(appState, objectId, rotation))}
        onUpdatePlacedObjectRoom={(objectId, roomId) => updateState(State.updatePlacedObjectRoom(appState, objectId, roomId))}
        onUpdatePlacedObjectSize={(objectId, width, height) => updateState(State.updatePlacedObjectSize(appState, objectId, width, height))}
        isMobileOpen={rightPanelOpen}
        isCollapsed={rightPanelCollapsed}
        onClose={() => setRightPanelOpen(false)}
      />

      <KeyboardShortcutsHelp />
    </div>
  );
}
