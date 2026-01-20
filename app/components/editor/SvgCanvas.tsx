'use client';

import React from 'react';
import { AppState, ExtendedDragState, MeasurePoint, WallSide, WallOpening, Room, ToolMode, PlacedObject, ObjectDef } from '@/src/model/types';
import * as State from '@/src/model/state';
import * as Snap from '@/src/editor/Snap';
import { SCALE } from '@/app/components/constants/editor';

/** Distance guides for object positioning */
interface DistanceGuide {
  direction: 'left' | 'right' | 'top' | 'bottom';
  distanceCm: number;
  lineX1: number;
  lineY1: number;
  lineX2: number;
  lineY2: number;
  labelX: number;
  labelY: number;
}

interface SvgCanvasProps {
  appState: AppState;
  svgRef: React.RefObject<SVGSVGElement | null>;
  dragState: ExtendedDragState | null;
  snap: Snap.SnapResult | null;
  measurePoints: MeasurePoint[];
  measureDistance: number | null;
  toolMode: ToolMode;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  onWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
  onTouchStart?: (e: React.TouchEvent<SVGSVGElement>) => void;
  onTouchMove?: (e: React.TouchEvent<SVGSVGElement>) => void;
  onTouchEnd?: (e: React.TouchEvent<SVGSVGElement>) => void;
}

// Wall rendering data type
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
  openingOffset: number;
};

/** Calculate distance guides from an object to room walls */
function calculateDistanceGuides(
  placed: PlacedObject,
  def: ObjectDef,
  room: Room,
  appState: AppState
): DistanceGuide[] {
  const guides: DistanceGuide[] = [];
  
  // Room inner boundaries
  const roomLeftCm = room.xCm;
  const roomTopCm = room.yCm;
  const roomRightCm = room.xCm + room.widthCm;
  const roomBottomCm = room.yCm + room.heightCm;
  
  // Use individual size if set, otherwise fall back to ObjectDef size
  const baseWidth = placed.widthCm ?? def.widthCm;
  const baseHeight = placed.heightCm ?? def.heightCm;
  
  // Calculate actual bounding box after rotation
  // The SVG rotation is around the center of the ORIGINAL (unrotated) rect
  const originalCenterX = placed.xCm + baseWidth / 2;
  const originalCenterY = placed.yCm + baseHeight / 2;
  
  const rotation = ((placed.rotationDeg ?? 0) % 360 + 360) % 360; // Normalize to 0-359
  const isRotated90or270 = rotation === 90 || rotation === 270;
  
  // After rotation, the bounding box changes
  let boundingWidth: number;
  let boundingHeight: number;
  
  if (isRotated90or270) {
    // Width and height swap
    boundingWidth = baseHeight;
    boundingHeight = baseWidth;
  } else {
    boundingWidth = baseWidth;
    boundingHeight = baseHeight;
  }
  
  // The center stays the same, but the bounding box corners change
  const objLeftCm = originalCenterX - boundingWidth / 2;
  const objTopCm = originalCenterY - boundingHeight / 2;
  const objRightCm = originalCenterX + boundingWidth / 2;
  const objBottomCm = originalCenterY + boundingHeight / 2;
  const objCenterXCm = originalCenterX;
  const objCenterYCm = originalCenterY;
  
  // Distance to left wall (west) - line from object's left edge to wall
  const distLeft = objLeftCm - roomLeftCm;
  if (distLeft > 1) { // Only show if > 1cm to avoid clutter
    guides.push({
      direction: 'left',
      distanceCm: distLeft,
      lineX1: roomLeftCm * SCALE,
      lineY1: objCenterYCm * SCALE,
      lineX2: objLeftCm * SCALE,
      lineY2: objCenterYCm * SCALE,
      labelX: (roomLeftCm + distLeft / 2) * SCALE,
      labelY: objCenterYCm * SCALE,
    });
  }
  
  // Distance to right wall (east) - line from object's right edge to wall
  const distRight = roomRightCm - objRightCm;
  if (distRight > 1) {
    guides.push({
      direction: 'right',
      distanceCm: distRight,
      lineX1: objRightCm * SCALE,
      lineY1: objCenterYCm * SCALE,
      lineX2: roomRightCm * SCALE,
      lineY2: objCenterYCm * SCALE,
      labelX: (objRightCm + distRight / 2) * SCALE,
      labelY: objCenterYCm * SCALE,
    });
  }
  
  // Distance to top wall (north) - line from object's top edge to wall
  const distTop = objTopCm - roomTopCm;
  if (distTop > 1) {
    guides.push({
      direction: 'top',
      distanceCm: distTop,
      lineX1: objCenterXCm * SCALE,
      lineY1: roomTopCm * SCALE,
      lineX2: objCenterXCm * SCALE,
      lineY2: objTopCm * SCALE,
      labelX: objCenterXCm * SCALE,
      labelY: (roomTopCm + distTop / 2) * SCALE,
    });
  }
  
  // Distance to bottom wall (south) - line from object's bottom edge to wall
  const distBottom = roomBottomCm - objBottomCm;
  if (distBottom > 1) {
    guides.push({
      direction: 'bottom',
      distanceCm: distBottom,
      lineX1: objCenterXCm * SCALE,
      lineY1: objBottomCm * SCALE,
      lineX2: objCenterXCm * SCALE,
      lineY2: roomBottomCm * SCALE,
      labelX: objCenterXCm * SCALE,
      labelY: (objBottomCm + distBottom / 2) * SCALE,
    });
  }
  
  return guides;
}

export default function SvgCanvas({
  appState,
  svgRef,
  dragState,
  snap,
  measurePoints,
  measureDistance,
  toolMode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: SvgCanvasProps) {
  const isDraggingRoom = dragState && dragState.roomId !== '__pan__';

  // Compute wall rendering data
  const { wallsWithoutOpenings, wallsWithOpenings } = React.useMemo(() => {
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
      
      const wallConfigs = [
        { side: 'north' as WallSide, baseX: outerX, baseY: y - n, width: outerW, height: n, isHorizontal: true, adjacent: adjacentNorth, openingOffset: wT },
        { side: 'south' as WallSide, baseX: outerX, baseY: y + h, width: outerW, height: s, isHorizontal: true, adjacent: adjacentSouth, openingOffset: wT },
        { side: 'west' as WallSide, baseX: x - wT, baseY: outerY, width: wT, height: outerH, isHorizontal: false, adjacent: adjacentWest, openingOffset: n },
        { side: 'east' as WallSide, baseX: x + w, baseY: outerY, width: eT, height: outerH, isHorizontal: false, adjacent: adjacentEast, openingOffset: n },
      ];
      
      wallConfigs.forEach((config) => {
        let shouldRender = true;
        let openings: WallOpening[] = [];
        
        if (config.adjacent) {
          openings = State.getCombinedWallOpenings(appState, room, config.side, config.adjacent);
          const myOpenings = roomOpenings.filter((o) => o.wall === config.side);
          const otherRoomOpenings = State.getOpeningsForWall(appState, config.adjacent.otherRoom.id, config.adjacent.otherWall);
          
          if (myOpenings.length > 0 || otherRoomOpenings.length > 0) {
            if (myOpenings.length > 0 && otherRoomOpenings.length > 0) {
              shouldRender = State.shouldRenderSharedWall(room, config.adjacent.otherRoom);
            } else {
              shouldRender = myOpenings.length > 0;
            }
          } else {
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
    
    return { wallsWithoutOpenings, wallsWithOpenings };
  }, [appState]);

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
      const openingStart = opening.positionCm * SCALE + wall.openingOffset;
      const openingWidth = opening.widthCm * SCALE;
      
      if (openingStart > currentPos) {
        if (wall.isHorizontal) {
          segments.push(
            <rect key={`${wall.key}-seg-${i}-before`} x={wall.baseX + currentPos} y={wall.baseY} width={openingStart - currentPos} height={wall.wallHeight} fill={wallFill} opacity="0.6" pointerEvents="none" />
          );
        } else {
          segments.push(
            <rect key={`${wall.key}-seg-${i}-before`} x={wall.baseX} y={wall.baseY + currentPos} width={wall.wallWidth} height={openingStart - currentPos} fill={wallFill} opacity="0.6" pointerEvents="none" />
          );
        }
      }
      
      // Different styling for doors vs windows
      const isDoor = opening.type === 'door';
      const openingColor = isDoor ? '#4ade80' : '#38bdf8'; // green for doors, sky blue for windows
      const strokePattern = isDoor ? '8,4' : '4,2'; // dashed for doors, dotted for windows
      
      if (wall.isHorizontal) {
        segments.push(<rect key={`${wall.key}-opening-bg-${i}`} x={wall.baseX + openingStart} y={wall.baseY} width={openingWidth} height={wall.wallHeight} fill={isDoor ? '#f8fafc' : '#e0f2fe'} pointerEvents="none" />);
        segments.push(<line key={`${wall.key}-opening-${i}`} x1={wall.baseX + openingStart} y1={wall.baseY + wall.wallHeight / 2} x2={wall.baseX + openingStart + openingWidth} y2={wall.baseY + wall.wallHeight / 2} stroke={openingColor} strokeWidth={isDoor ? 3 : 4} strokeDasharray={strokePattern} pointerEvents="none" />);
        // Window: add small vertical lines at edges to indicate frame
        if (!isDoor) {
          segments.push(<line key={`${wall.key}-win-left-${i}`} x1={wall.baseX + openingStart} y1={wall.baseY} x2={wall.baseX + openingStart} y2={wall.baseY + wall.wallHeight} stroke={openingColor} strokeWidth={2} pointerEvents="none" />);
          segments.push(<line key={`${wall.key}-win-right-${i}`} x1={wall.baseX + openingStart + openingWidth} y1={wall.baseY} x2={wall.baseX + openingStart + openingWidth} y2={wall.baseY + wall.wallHeight} stroke={openingColor} strokeWidth={2} pointerEvents="none" />);
        }
      } else {
        segments.push(<rect key={`${wall.key}-opening-bg-${i}`} x={wall.baseX} y={wall.baseY + openingStart} width={wall.wallWidth} height={openingWidth} fill={isDoor ? '#f8fafc' : '#e0f2fe'} pointerEvents="none" />);
        segments.push(<line key={`${wall.key}-opening-${i}`} x1={wall.baseX + wall.wallWidth / 2} y1={wall.baseY + openingStart} x2={wall.baseX + wall.wallWidth / 2} y2={wall.baseY + openingStart + openingWidth} stroke={openingColor} strokeWidth={isDoor ? 3 : 4} strokeDasharray={strokePattern} pointerEvents="none" />);
        // Window: add small horizontal lines at edges to indicate frame
        if (!isDoor) {
          segments.push(<line key={`${wall.key}-win-top-${i}`} x1={wall.baseX} y1={wall.baseY + openingStart} x2={wall.baseX + wall.wallWidth} y2={wall.baseY + openingStart} stroke={openingColor} strokeWidth={2} pointerEvents="none" />);
          segments.push(<line key={`${wall.key}-win-bottom-${i}`} x1={wall.baseX} y1={wall.baseY + openingStart + openingWidth} x2={wall.baseX + wall.wallWidth} y2={wall.baseY + openingStart + openingWidth} stroke={openingColor} strokeWidth={2} pointerEvents="none" />);
        }
      }
      
      currentPos = openingStart + openingWidth;
    });
    
    const totalLength = wall.isHorizontal ? wall.wallWidth : wall.wallHeight;
    if (currentPos < totalLength) {
      if (wall.isHorizontal) {
        segments.push(<rect key={`${wall.key}-seg-after`} x={wall.baseX + currentPos} y={wall.baseY} width={totalLength - currentPos} height={wall.wallHeight} fill={wallFill} opacity="0.6" pointerEvents="none" />);
      } else {
        segments.push(<rect key={`${wall.key}-seg-after`} x={wall.baseX} y={wall.baseY + currentPos} width={wall.wallWidth} height={totalLength - currentPos} fill={wallFill} opacity="0.6" pointerEvents="none" />);
      }
    }
    
    return <React.Fragment key={wall.key}>{segments}</React.Fragment>;
  };

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      className={`absolute inset-0 bg-slate-50 ${toolMode === 'measure' ? 'cursor-crosshair' : isDraggingRoom ? 'cursor-grabbing' : 'cursor-move'}`}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
      viewBox="0 0 10000 10000"
      preserveAspectRatio="xMidYMid meet"
    >
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

        {/* Walls without openings first (lower z-index) */}
        {wallsWithoutOpenings.map(renderWall)}
        {/* Walls with openings last (higher z-index) */}
        {wallsWithOpenings.map(renderWall)}

        {/* Rooms */}
        {appState.rooms.map((room) => (
          <RoomElement
            key={room.id}
            room={room}
            appState={appState}
            dragState={dragState}
          />
        ))}

        {/* Snap indicators */}
        {snap?.snappedX && (
          <line x1={(snap.xGuideCm ?? snap.xCm)! * SCALE} y1="0" x2={(snap.xGuideCm ?? snap.xCm)! * SCALE} y2="10000" stroke="#ec4899" strokeWidth="1" strokeDasharray="4,4" opacity="0.6" pointerEvents="none" />
        )}
        {snap?.snappedY && (
          <line x1="0" y1={(snap.yGuideCm ?? snap.yCm)! * SCALE} x2="10000" y2={(snap.yGuideCm ?? snap.yCm)! * SCALE} stroke="#ec4899" strokeWidth="1" strokeDasharray="4,4" opacity="0.6" pointerEvents="none" />
        )}

        {/* Distance guides when dragging an object */}
        <DistanceGuides appState={appState} dragState={dragState} zoom={appState.zoom} />

        {/* Measurement tool */}
        {measurePoints.length > 0 && (
          <>
            <circle cx={measurePoints[0].xCm * SCALE} cy={measurePoints[0].yCm * SCALE} r={8 / appState.zoom} fill="#f59e0b" stroke="#fff" strokeWidth={2 / appState.zoom} pointerEvents="none" />
            {measurePoints.length === 2 && (
              <>
                <line x1={measurePoints[0].xCm * SCALE} y1={measurePoints[0].yCm * SCALE} x2={measurePoints[1].xCm * SCALE} y2={measurePoints[1].yCm * SCALE} stroke="#f59e0b" strokeWidth={3 / appState.zoom} strokeDasharray={`${10 / appState.zoom},${5 / appState.zoom}`} pointerEvents="none" />
                <circle cx={measurePoints[1].xCm * SCALE} cy={measurePoints[1].yCm * SCALE} r={8 / appState.zoom} fill="#f59e0b" stroke="#fff" strokeWidth={2 / appState.zoom} pointerEvents="none" />
                <text x={(measurePoints[0].xCm + measurePoints[1].xCm) / 2 * SCALE} y={(measurePoints[0].yCm + measurePoints[1].yCm) / 2 * SCALE - 15 / appState.zoom} textAnchor="middle" fontSize={16 / appState.zoom} fill="#f59e0b" fontWeight="bold" pointerEvents="none">
                  {measureDistance?.toFixed(1)} cm
                </text>
              </>
            )}
          </>
        )}
      </g>
    </svg>
  );
}

// Room element sub-component
function RoomElement({ room, appState, dragState }: { room: Room; appState: AppState; dragState: ExtendedDragState | null }) {
  const x = room.xCm * SCALE;
  const y = room.yCm * SCALE;
  const w = room.widthCm * SCALE;
  const h = room.heightCm * SCALE;
  const selected = appState.selectedRoomIds.includes(room.id);
  const draggingThis = dragState?.roomId === room.id;
  const handleSize = 40 / appState.zoom;

  return (
    <React.Fragment>
      <rect
        x={x} y={y} width={w} height={h}
        data-room-id={room.id}
        fill={selected ? 'rgba(37, 99, 235, 0.1)' : 'rgba(229, 231, 235, 0.5)'}
        stroke={selected ? '#2563eb' : '#d1d5db'}
        strokeWidth={selected ? 3 : 2}
        style={{ cursor: draggingThis ? 'grabbing' : 'grab' }}
      />

      {/* Resize handles */}
      {selected && (
        <>
          <rect x={x - handleSize / 2} y={y - handleSize / 2} width={handleSize} height={handleSize} fill="#2563eb" stroke="#fff" strokeWidth={1} data-resize-handle="nw" data-room-id={room.id} style={{ cursor: 'nwse-resize' }} />
          <rect x={x + w - handleSize / 2} y={y - handleSize / 2} width={handleSize} height={handleSize} fill="#2563eb" stroke="#fff" strokeWidth={1} data-resize-handle="ne" data-room-id={room.id} style={{ cursor: 'nesw-resize' }} />
          <rect x={x - handleSize / 2} y={y + h - handleSize / 2} width={handleSize} height={handleSize} fill="#2563eb" stroke="#fff" strokeWidth={1} data-resize-handle="sw" data-room-id={room.id} style={{ cursor: 'nesw-resize' }} />
          <rect x={x + w - handleSize / 2} y={y + h - handleSize / 2} width={handleSize} height={handleSize} fill="#2563eb" stroke="#fff" strokeWidth={1} data-resize-handle="se" data-room-id={room.id} style={{ cursor: 'nwse-resize' }} />
          <rect x={x + w / 2 - handleSize / 2} y={y - handleSize / 2} width={handleSize} height={handleSize} fill="#2563eb" stroke="#fff" strokeWidth={1} data-resize-handle="n" data-room-id={room.id} style={{ cursor: 'ns-resize' }} />
          <rect x={x + w / 2 - handleSize / 2} y={y + h - handleSize / 2} width={handleSize} height={handleSize} fill="#2563eb" stroke="#fff" strokeWidth={1} data-resize-handle="s" data-room-id={room.id} style={{ cursor: 'ns-resize' }} />
          <rect x={x - handleSize / 2} y={y + h / 2 - handleSize / 2} width={handleSize} height={handleSize} fill="#2563eb" stroke="#fff" strokeWidth={1} data-resize-handle="w" data-room-id={room.id} style={{ cursor: 'ew-resize' }} />
          <rect x={x + w - handleSize / 2} y={y + h / 2 - handleSize / 2} width={handleSize} height={handleSize} fill="#2563eb" stroke="#fff" strokeWidth={1} data-resize-handle="e" data-room-id={room.id} style={{ cursor: 'ew-resize' }} />
        </>
      )}

      {/* Placed objects */}
      {(appState.placedObjects ?? []).filter((p) => p.roomId === room.id).map((p) => {
        const def = appState.objectDefs?.find((d) => d.id === p.defId);
        if (!def) return null;
        const ox = p.xCm * SCALE;
        const oy = p.yCm * SCALE;
        // Use individual size if set, otherwise fall back to ObjectDef size
        const ow = (p.widthCm ?? def.widthCm) * SCALE;
        const oh = (p.heightCm ?? def.heightCm) * SCALE;
        const draggingPlaced = dragState?.roomId === p.id && dragState?.targetType === 'placed';
        const isSelectedObject = appState.selectedObjectId === p.id;
        const rotation = p.rotationDeg ?? 0;
        
        // Calculate font size based on object dimensions
        // Use the smaller dimension to ensure text fits
        const minDim = Math.min(ow, oh);
        const maxFontSize = 6;
        const minFontSize = 2;
        // Scale font to roughly 12% of the smaller dimension, capped
        const calculatedFontSize = Math.min(maxFontSize, Math.max(minFontSize, minDim * 0.12));
        
        // Estimate if text will fit (rough char width ~60% of font size)
        const estimatedTextWidth = def.name.length * calculatedFontSize * 0.6;
        const textFits = estimatedTextWidth < ow * 0.9;
        
        // Truncate text if it doesn't fit
        let displayText = def.name;
        if (!textFits && ow > 15) {
          const maxChars = Math.floor((ow * 0.85) / (calculatedFontSize * 0.6));
          if (maxChars >= 2) {
            displayText = def.name.slice(0, maxChars - 1) + '…';
          } else {
            displayText = '';
          }
        }
        
        // Hide text completely if object is too small
        const showText = minDim >= 15 && displayText.length > 0;
        
        return (
          <g key={p.id} data-placed-id={p.id} transform={`rotate(${rotation} ${ox + ow / 2} ${oy + oh / 2})`} style={{ cursor: draggingPlaced ? 'grabbing' : 'grab' }}>
            <rect x={ox} y={oy} width={ow} height={oh} fill={isSelectedObject ? "#93c5fd" : "#c7e1ff"} stroke={isSelectedObject ? "#2563eb" : "#0369a1"} strokeWidth={isSelectedObject ? 2 : 1} />
            {showText && (
              <text x={ox + ow/2} y={oy + oh/2} textAnchor="middle" dominantBaseline="middle" fontSize={calculatedFontSize} pointerEvents="none" fill="#023047">{displayText}</text>
            )}
          </g>
        );
      })}
    </React.Fragment>
  );
}

// Distance guides component - shows distances to walls when dragging objects
function DistanceGuides({ appState, dragState, zoom }: { appState: AppState; dragState: ExtendedDragState | null; zoom: number }) {
  // Only show when dragging a placed object
  if (!dragState || dragState.targetType !== 'placed') return null;
  
  const placed = (appState.placedObjects ?? []).find(p => p.id === dragState.roomId);
  if (!placed) return null;
  
  const def = appState.objectDefs?.find(d => d.id === placed.defId);
  if (!def) return null;
  
  const room = appState.rooms.find(r => r.id === placed.roomId);
  if (!room) return null;
  
  const guides = calculateDistanceGuides(placed, def, room, appState);
  
  // Scale factor - viewBox is 10000, so we need larger values
  // Multiply by ~10 to match HTML overlay label sizes
  const s = 10 / zoom;
  
  return (
    <g pointerEvents="none">
      {guides.map((guide, i) => (
        <React.Fragment key={`${guide.direction}-${i}`}>
          {/* Main distance line */}
          <line
            x1={guide.lineX1}
            y1={guide.lineY1}
            x2={guide.lineX2}
            y2={guide.lineY2}
            stroke="#ea580c"
            strokeWidth={2 * s}
          />
          {/* End caps */}
          {guide.direction === 'left' || guide.direction === 'right' ? (
            <>
              <line x1={guide.lineX1} y1={guide.lineY1 - 10 * s} x2={guide.lineX1} y2={guide.lineY1 + 10 * s} stroke="#ea580c" strokeWidth={2 * s} />
              <line x1={guide.lineX2} y1={guide.lineY2 - 10 * s} x2={guide.lineX2} y2={guide.lineY2 + 10 * s} stroke="#ea580c" strokeWidth={2 * s} />
            </>
          ) : (
            <>
              <line x1={guide.lineX1 - 10 * s} y1={guide.lineY1} x2={guide.lineX1 + 10 * s} y2={guide.lineY1} stroke="#ea580c" strokeWidth={2 * s} />
              <line x1={guide.lineX2 - 10 * s} y1={guide.lineY2} x2={guide.lineX2 + 10 * s} y2={guide.lineY2} stroke="#ea580c" strokeWidth={2 * s} />
            </>
          )}
          {/* Label background - same style as room/object labels */}
          <rect
            x={guide.labelX - 32 * s}
            y={guide.labelY - 12 * s}
            width={64 * s}
            height={24 * s}
            rx={4 * s}
            fill="#fff"
            fillOpacity={0.95}
            stroke="#ea580c"
            strokeWidth={1 * s}
          />
          {/* Label text - 13px like room/object labels */}
          <text
            x={guide.labelX}
            y={guide.labelY + 5 * s}
            textAnchor="middle"
            fontSize={13 * s}
            fill="#ea580c"
            fontWeight="500"
            style={{ fontFamily: 'system-ui, sans-serif' }}
          >
            {guide.distanceCm.toFixed(0)} cm
          </text>
        </React.Fragment>
      ))}
    </g>
  );
}
