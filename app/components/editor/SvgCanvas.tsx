'use client';

import React from 'react';
import { AppState, ExtendedDragState, MeasurePoint, WallSide, WallOpening, OpeningType, Room, ToolMode, PlacedObject, ObjectDef } from '@/src/model/types';
import * as State from '@/src/model/state';
import * as Snap from '@/src/editor/Snap';
import { SCALE } from '@/app/components/constants/editor';
import { getRoomCorners, isRoomRectangular, getEffectiveWallLengths, getRotatedBoundingBox, Point2D } from '@/src/utils/geometry';

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

/** Wall data for non-rectangular (polygon) rooms */
type PolygonWallRenderData = {
  key: string;
  roomId: string;
  wallSide: WallSide;
  innerStart: Point2D; // start point on inner polygon (cm)
  innerEnd: Point2D;   // end point on inner polygon (cm)
  outerStart: Point2D; // start point on outer polygon (cm, offset by wall thickness)
  outerEnd: Point2D;   // end point on outer polygon (cm, offset by wall thickness)
};

/** Opening data for polygon (non-rectangular) walls */
type PolygonOpeningRenderData = {
  key: string;
  roomId: string;
  wallSide: WallSide;
  innerStart: Point2D;
  innerEnd: Point2D;
  outerStart: Point2D;
  outerEnd: Point2D;
  type: OpeningType;
  widthCm: number;
  swingSide?: 'left' | 'right';
  swingDirection?: 'inward' | 'outward';
};

/** Calculate distance guides from an object to room walls */
function calculateDistanceGuides(
  placed: PlacedObject,
  def: ObjectDef,
  room: Room,
  appState: AppState
): DistanceGuide[] {
  const guides: DistanceGuide[] = [];
  
  // Use individual size if set, otherwise fall back to ObjectDef size
  const baseWidth = placed.widthCm ?? def.widthCm;
  const baseHeight = placed.heightCm ?? def.heightCm;
  
  // Calculate actual bounding box after rotation
  const originalCenterX = placed.xCm + baseWidth / 2;
  const originalCenterY = placed.yCm + baseHeight / 2;
  
  const rotation = ((placed.rotationDeg ?? 0) % 360 + 360) % 360;
  const bbox = getRotatedBoundingBox(baseWidth, baseHeight, rotation);
  const boundingWidth = bbox.width;
  const boundingHeight = bbox.height;
  
  const objLeftCm = originalCenterX - boundingWidth / 2;
  const objTopCm = originalCenterY - boundingHeight / 2;
  const objRightCm = originalCenterX + boundingWidth / 2;
  const objBottomCm = originalCenterY + boundingHeight / 2;
  const objCenterXCm = originalCenterX;
  const objCenterYCm = originalCenterY;
  
  // Compute wall boundaries — for non-rect rooms, interpolate along angled edges
  let roomLeftCm: number, roomRightCm: number, roomTopCm: number, roomBottomCm: number;
  
  if (!isRoomRectangular(room)) {
    const corners = getRoomCorners(room);
    // Helper: get X at a given Y along a line segment (p1 -> p2), clamped to [0,1]
    const xAtY = (p1: Point2D, p2: Point2D, y: number): number => {
      const dy = p2.y - p1.y;
      if (Math.abs(dy) < 0.001) return (p1.x + p2.x) / 2;
      const t = Math.max(0, Math.min(1, (y - p1.y) / dy));
      return p1.x + (p2.x - p1.x) * t;
    };
    // Helper: get Y at a given X along a line segment (p1 -> p2), clamped to [0,1]
    const yAtX = (p1: Point2D, p2: Point2D, x: number): number => {
      const dx = p2.x - p1.x;
      if (Math.abs(dx) < 0.001) return (p1.y + p2.y) / 2;
      const t = Math.max(0, Math.min(1, (x - p1.x) / dx));
      return p1.y + (p2.y - p1.y) * t;
    };
    // West wall: NW -> SW, interpolate X at object center Y
    roomLeftCm = xAtY(corners.nw, corners.sw, objCenterYCm);
    // East wall: NE -> SE, interpolate X at object center Y
    roomRightCm = xAtY(corners.ne, corners.se, objCenterYCm);
    // North wall: NW -> NE, interpolate Y at object center X
    roomTopCm = yAtX(corners.nw, corners.ne, objCenterXCm);
    // South wall: SW -> SE, interpolate Y at object center X
    roomBottomCm = yAtX(corners.sw, corners.se, objCenterXCm);
  } else {
    roomLeftCm = room.xCm;
    roomTopCm = room.yCm;
    roomRightCm = room.xCm + room.widthCm;
    roomBottomCm = room.yCm + room.heightCm;
  }
  
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
  const { wallsWithoutOpenings, wallsWithOpenings, polygonWalls, polygonOpenings } = React.useMemo(() => {
    const wallsWithoutOpenings: WallRenderData[] = [];
    const wallsWithOpenings: WallRenderData[] = [];
    const polygonWalls: PolygonWallRenderData[] = [];
    const polygonOpenings: PolygonOpeningRenderData[] = [];
    
    appState.rooms.forEach((room) => {
      const isRect = isRoomRectangular(room);
      
      if (!isRect) {
        // Non-rectangular room: compute wall strips along polygon edges
        const corners = getRoomCorners(room);
        const wallThicknessData = {
          north: room.wallThickness?.north ?? appState.globalWallThicknessCm,
          south: room.wallThickness?.south ?? appState.globalWallThicknessCm,
          east: room.wallThickness?.east ?? appState.globalWallThicknessCm,
          west: room.wallThickness?.west ?? appState.globalWallThicknessCm,
        };
        
        const roomOpenings = State.getOpeningsForRoom(appState, room.id);
        
        // Helper: linearly interpolate between two points
        const lerp = (a: Point2D, b: Point2D, t: number): Point2D => ({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        });
        
        // For each edge, compute the outward normal and offset
        const edges: Array<{ side: WallSide; start: Point2D; end: Point2D; thickness: number }> = [
          { side: 'north', start: corners.nw, end: corners.ne, thickness: wallThicknessData.north },
          { side: 'east', start: corners.ne, end: corners.se, thickness: wallThicknessData.east },
          { side: 'south', start: corners.se, end: corners.sw, thickness: wallThicknessData.south },
          { side: 'west', start: corners.sw, end: corners.nw, thickness: wallThicknessData.west },
        ];
        
        edges.forEach(({ side, start, end, thickness }) => {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const wallLenCm = Math.sqrt(dx * dx + dy * dy);
          if (wallLenCm === 0) return;
          
          // Outward normal (for clockwise polygon: right-hand normal)
          const nx = dy / wallLenCm;
          const ny = -dx / wallLenCm;
          
          const outerStart: Point2D = { x: start.x + nx * thickness, y: start.y + ny * thickness };
          const outerEnd: Point2D = { x: end.x + nx * thickness, y: end.y + ny * thickness };
          
          // Get openings for this side (including adjacent room openings)
          let openings: WallOpening[] = [];
          let shouldRender = true;
          const adj = State.findAdjacentRoom(appState, room, side);
          if (adj) {
            openings = State.getCombinedWallOpenings(appState, room, side, adj);
            const myOpenings = roomOpenings.filter(o => o.wall === side);
            const otherOpenings = State.getOpeningsForWall(appState, adj.otherRoom.id, adj.otherWall);
            if (myOpenings.length > 0 || otherOpenings.length > 0) {
              if (myOpenings.length > 0 && otherOpenings.length > 0) {
                shouldRender = State.shouldRenderSharedWall(room, adj.otherRoom);
              } else {
                shouldRender = myOpenings.length > 0;
              }
            } else {
              shouldRender = State.shouldRenderSharedWall(room, adj.otherRoom);
            }
          } else {
            openings = roomOpenings.filter(o => o.wall === side);
          }
          
          if (!shouldRender) return;
          
          if (openings.length === 0) {
            // No openings: single polygon wall strip
            polygonWalls.push({
              key: `${room.id}-poly-${side}`,
              roomId: room.id,
              wallSide: side,
              innerStart: start,
              innerEnd: end,
              outerStart,
              outerEnd,
            });
          } else {
            // Has openings: split polygon wall into segments with gaps
            const sorted = [...openings].sort((a, b) => a.positionCm - b.positionCm);
            let currentCm = 0;
            
            sorted.forEach((opening, i) => {
              const openStartCm = opening.positionCm;
              const openEndCm = opening.positionCm + opening.widthCm;
              
              // Solid segment before this opening
              if (openStartCm > currentCm) {
                const t1 = currentCm / wallLenCm;
                const t2 = openStartCm / wallLenCm;
                polygonWalls.push({
                  key: `${room.id}-poly-${side}-seg${i}-before`,
                  roomId: room.id,
                  wallSide: side,
                  innerStart: lerp(start, end, t1),
                  innerEnd: lerp(start, end, t2),
                  outerStart: lerp(outerStart, outerEnd, t1),
                  outerEnd: lerp(outerStart, outerEnd, t2),
                });
              }
              
              // Opening indicator data
              const tOpen1 = openStartCm / wallLenCm;
              const tOpen2 = openEndCm / wallLenCm;
              polygonOpenings.push({
                key: `${room.id}-poly-${side}-opening-${i}`,
                roomId: room.id,
                wallSide: side,
                innerStart: lerp(start, end, tOpen1),
                innerEnd: lerp(start, end, tOpen2),
                outerStart: lerp(outerStart, outerEnd, tOpen1),
                outerEnd: lerp(outerStart, outerEnd, tOpen2),
                type: opening.type,
                widthCm: opening.widthCm,
                swingSide: opening.swingSide,
                swingDirection: opening.swingDirection,
              });
              
              currentCm = openEndCm;
            });
            
            // Solid segment after the last opening
            if (currentCm < wallLenCm) {
              const t1 = currentCm / wallLenCm;
              polygonWalls.push({
                key: `${room.id}-poly-${side}-seg-after`,
                roomId: room.id,
                wallSide: side,
                innerStart: lerp(start, end, t1),
                innerEnd: end,
                outerStart: lerp(outerStart, outerEnd, t1),
                outerEnd: outerEnd,
              });
            }
          }
        });
        
        // All walls handled as polygon — skip rectangular wall rendering
        return;
      }
      
      // Standard wall rendering (handles openings for both rect and non-rect rooms)
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
            // Always render walls with openings (doors/windows/passages)
            wallsWithOpenings.push(wallData);
          } else if (isRect) {
            // Only render solid walls for rectangular rooms
            // (non-rect rooms use polygon walls for solid sections)
            wallsWithoutOpenings.push(wallData);
          }
        }
      });
    });
    
    return { wallsWithoutOpenings, wallsWithOpenings, polygonWalls, polygonOpenings };
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
      
      // Different styling for doors/passages vs windows
      const isDoor = opening.type === 'door';
      const isPassage = opening.type === 'passage';
      const isDoorLike = isDoor || isPassage; // same wall gap rendering
      const openingColor = isDoorLike ? (isPassage ? '#94a3b8' : '#4ade80') : '#38bdf8';
      const strokePattern = isDoorLike ? '8,4' : '4,2';
      
      if (wall.isHorizontal) {
        segments.push(<rect key={`${wall.key}-opening-bg-${i}`} x={wall.baseX + openingStart} y={wall.baseY} width={openingWidth} height={wall.wallHeight} fill={isDoorLike ? '#f8fafc' : '#e0f2fe'} pointerEvents="none" />);
        segments.push(<line key={`${wall.key}-opening-${i}`} x1={wall.baseX + openingStart} y1={wall.baseY + wall.wallHeight / 2} x2={wall.baseX + openingStart + openingWidth} y2={wall.baseY + wall.wallHeight / 2} stroke={openingColor} strokeWidth={isDoorLike ? 3 : 4} strokeDasharray={strokePattern} pointerEvents="none" />);
        // Window: add small vertical lines at edges to indicate frame
        if (!isDoorLike) {
          segments.push(<line key={`${wall.key}-win-left-${i}`} x1={wall.baseX + openingStart} y1={wall.baseY} x2={wall.baseX + openingStart} y2={wall.baseY + wall.wallHeight} stroke={openingColor} strokeWidth={2} pointerEvents="none" />);
          segments.push(<line key={`${wall.key}-win-right-${i}`} x1={wall.baseX + openingStart + openingWidth} y1={wall.baseY} x2={wall.baseX + openingStart + openingWidth} y2={wall.baseY + wall.wallHeight} stroke={openingColor} strokeWidth={2} pointerEvents="none" />);
        }
      } else {
        segments.push(<rect key={`${wall.key}-opening-bg-${i}`} x={wall.baseX} y={wall.baseY + openingStart} width={wall.wallWidth} height={openingWidth} fill={isDoorLike ? '#f8fafc' : '#e0f2fe'} pointerEvents="none" />);
        segments.push(<line key={`${wall.key}-opening-${i}`} x1={wall.baseX + wall.wallWidth / 2} y1={wall.baseY + openingStart} x2={wall.baseX + wall.wallWidth / 2} y2={wall.baseY + openingStart + openingWidth} stroke={openingColor} strokeWidth={isDoorLike ? 3 : 4} strokeDasharray={strokePattern} pointerEvents="none" />);
        // Window: add small horizontal lines at edges to indicate frame
        if (!isDoorLike) {
          segments.push(<line key={`${wall.key}-win-top-${i}`} x1={wall.baseX} y1={wall.baseY + openingStart} x2={wall.baseX + wall.wallWidth} y2={wall.baseY + openingStart} stroke={openingColor} strokeWidth={2} pointerEvents="none" />);
          segments.push(<line key={`${wall.key}-win-bottom-${i}`} x1={wall.baseX} y1={wall.baseY + openingStart + openingWidth} x2={wall.baseX + wall.wallWidth} y2={wall.baseY + openingStart + openingWidth} stroke={openingColor} strokeWidth={2} pointerEvents="none" />);
        }
      }
      
      // Door swing arc (90° quarter-circle) — only for actual doors, not passages
      if (isDoor) {
        const swingSide = opening.swingSide ?? 'left';
        const swingDirection = opening.swingDirection ?? 'inward';
        const hingeFirst = swingSide === 'left';
        
        // Perpendicular direction sign: positive = into room
        const inwardSign = wall.wallSide === 'north' || wall.wallSide === 'west' ? 1 : -1;
        const perpSign = swingDirection === 'inward' ? inwardSign : -inwardSign;
        const R = openingWidth;
        
        let hingeX: number, hingeY: number;
        let closedEndX: number, closedEndY: number;
        let openEndX: number, openEndY: number;
        
        if (wall.isHorizontal) {
          // Wall inner edge Y: the side facing into the room
          // For north wall: inner edge is bottom (baseY + wallHeight)
          // For south wall: inner edge is top (baseY)
          const wallEdgeY = (wall.wallSide === 'north')
            ? wall.baseY + wall.wallHeight
            : wall.baseY;
          // When swinging outward, use the opposite edge
          const hingeEdgeY = swingDirection === 'inward' ? wallEdgeY
            : (wall.wallSide === 'north' ? wall.baseY : wall.baseY + wall.wallHeight);
          const leftEdgeX = wall.baseX + openingStart;
          const rightEdgeX = wall.baseX + openingStart + openingWidth;
          
          hingeX = hingeFirst ? leftEdgeX : rightEdgeX;
          hingeY = hingeEdgeY;
          closedEndX = hingeFirst ? rightEdgeX : leftEdgeX;
          closedEndY = hingeEdgeY;
          openEndX = hingeX;
          openEndY = hingeEdgeY + perpSign * R;
        } else {
          // Wall inner edge X: the side facing into the room
          // For west wall: inner edge is right (baseX + wallWidth)
          // For east wall: inner edge is left (baseX)
          const wallEdgeX = (wall.wallSide === 'west')
            ? wall.baseX + wall.wallWidth
            : wall.baseX;
          // When swinging outward, use the opposite edge
          const hingeEdgeX = swingDirection === 'inward' ? wallEdgeX
            : (wall.wallSide === 'west' ? wall.baseX : wall.baseX + wall.wallWidth);
          const topEdgeY = wall.baseY + openingStart;
          const bottomEdgeY = wall.baseY + openingStart + openingWidth;
          
          hingeX = hingeEdgeX;
          hingeY = hingeFirst ? topEdgeY : bottomEdgeY;
          closedEndX = hingeEdgeX;
          closedEndY = hingeFirst ? bottomEdgeY : topEdgeY;
          openEndX = hingeEdgeX + perpSign * R;
          openEndY = hingeY;
        }
        
        const sameSign = hingeFirst === (perpSign > 0);
        const sweep = wall.isHorizontal ? (sameSign ? 1 : 0) : (sameSign ? 0 : 1);
        
        // Arc path from closed end to open end
        const arcPath = `M ${closedEndX} ${closedEndY} A ${R} ${R} 0 0 ${sweep} ${openEndX} ${openEndY}`;
        // Door leaf line from hinge to open end
        const leafPath = `M ${hingeX} ${hingeY} L ${openEndX} ${openEndY}`;
        
        // Filled arc sector path (hinge -> closed end arc open end -> back to hinge)
        const sectorPath = `M ${hingeX} ${hingeY} L ${closedEndX} ${closedEndY} A ${R} ${R} 0 0 ${sweep} ${openEndX} ${openEndY} Z`;
        segments.push(
          <path key={`${wall.key}-swing-fill-${i}`} d={sectorPath} fill="rgba(74, 222, 128, 0.15)" stroke="none" pointerEvents="none" />
        );
        segments.push(
          <path key={`${wall.key}-swing-arc-${i}`} d={arcPath} fill="none" stroke="#22c55e" strokeWidth={2.5} strokeDasharray="8,4" opacity={0.85} pointerEvents="none" />
        );
        segments.push(
          <path key={`${wall.key}-swing-leaf-${i}`} d={leafPath} fill="none" stroke="#22c55e" strokeWidth={3} opacity={0.85} pointerEvents="none" />
        );
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
        {/* Polygon walls for non-rectangular rooms */}
        {polygonWalls.map((pw) => {
          const S = SCALE;
          const points = `${pw.innerStart.x * S},${pw.innerStart.y * S} ${pw.innerEnd.x * S},${pw.innerEnd.y * S} ${pw.outerEnd.x * S},${pw.outerEnd.y * S} ${pw.outerStart.x * S},${pw.outerStart.y * S}`;
          return (
            <polygon
              key={pw.key}
              points={points}
              fill={wallFill}
              opacity="0.6"
              pointerEvents="none"
            />
          );
        })}
        {/* Openings in polygon walls */}
        {polygonOpenings.map((po) => {
          const S = SCALE;
          const isDoor = po.type === 'door';
          const isPassage = po.type === 'passage';
          const isDoorLike = isDoor || isPassage;
          const openingColor = isDoorLike ? (isPassage ? '#94a3b8' : '#4ade80') : '#38bdf8';
          const strokePattern = isDoorLike ? '8,4' : '4,2';
          // Background fill for the opening gap
          const bgPoints = `${po.innerStart.x * S},${po.innerStart.y * S} ${po.innerEnd.x * S},${po.innerEnd.y * S} ${po.outerEnd.x * S},${po.outerEnd.y * S} ${po.outerStart.x * S},${po.outerStart.y * S}`;
          // Dashed line along the middle of the opening
          const midStart = { x: (po.innerStart.x + po.outerStart.x) / 2 * S, y: (po.innerStart.y + po.outerStart.y) / 2 * S };
          const midEnd = { x: (po.innerEnd.x + po.outerEnd.x) / 2 * S, y: (po.innerEnd.y + po.outerEnd.y) / 2 * S };
          return (
            <React.Fragment key={po.key}>
              <polygon points={bgPoints} fill={isDoorLike ? '#f8fafc' : '#e0f2fe'} pointerEvents="none" />
              <line x1={midStart.x} y1={midStart.y} x2={midEnd.x} y2={midEnd.y} stroke={openingColor} strokeWidth={isDoorLike ? 3 : 4} strokeDasharray={strokePattern} pointerEvents="none" />
              {!isDoorLike && (
                <>
                  <line x1={po.innerStart.x * S} y1={po.innerStart.y * S} x2={po.outerStart.x * S} y2={po.outerStart.y * S} stroke={openingColor} strokeWidth={2} pointerEvents="none" />
                  <line x1={po.innerEnd.x * S} y1={po.innerEnd.y * S} x2={po.outerEnd.x * S} y2={po.outerEnd.y * S} stroke={openingColor} strokeWidth={2} pointerEvents="none" />
                </>
              )}
            </React.Fragment>
          );
        })}

        {/* Rooms */}
        {appState.rooms.map((room) => (
          <RoomElement
            key={room.id}
            room={room}
            appState={appState}
            dragState={dragState}
          />
        ))}

        {/* Placed objects - rendered after all rooms so they're always on top and clickable */}
        <PlacedObjectsLayer appState={appState} dragState={dragState} />

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

  const isRect = isRoomRectangular(room);
  const corners = !isRect ? getRoomCorners(room) : null;

  // Polygon points string for non-rectangular rooms
  const polygonPoints = corners
    ? `${corners.nw.x * SCALE},${corners.nw.y * SCALE} ${corners.ne.x * SCALE},${corners.ne.y * SCALE} ${corners.se.x * SCALE},${corners.se.y * SCALE} ${corners.sw.x * SCALE},${corners.sw.y * SCALE}`
    : '';

  const fillColor = selected ? 'rgba(37, 99, 235, 0.1)' : 'rgba(229, 231, 235, 0.5)';
  const strokeColor = selected ? '#2563eb' : '#d1d5db';
  const strokeWidth = selected ? 3 : 2;

  return (
    <React.Fragment>
      {isRect ? (
        <rect
          x={x} y={y} width={w} height={h}
          data-room-id={room.id}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          style={{ cursor: draggingThis ? 'grabbing' : 'grab' }}
        />
      ) : (
        <polygon
          points={polygonPoints}
          data-room-id={room.id}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          style={{ cursor: draggingThis ? 'grabbing' : 'grab' }}
        />
      )}

      {/* Resize handles (only for rectangular rooms) */}
      {selected && isRect && (
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

      {/* Corner handles for non-rectangular rooms */}
      {selected && !isRect && corners && (
        <>
          {[
            { p: corners.nw, label: 'NW' },
            { p: corners.ne, label: 'NE' },
            { p: corners.se, label: 'SE' },
            { p: corners.sw, label: 'SW' },
          ].map(({ p, label }) => (
            <circle
              key={label}
              cx={p.x * SCALE}
              cy={p.y * SCALE}
              r={handleSize / 2}
              fill="#2563eb"
              stroke="#fff"
              strokeWidth={1}
              data-room-id={room.id}
              style={{ cursor: 'grab' }}
              pointerEvents="none"
            />
          ))}
        </>
      )}

    </React.Fragment>
  );
}

// Placed objects layer - renders ALL placed objects on top of all rooms for correct z-order and click handling
function PlacedObjectsLayer({ appState, dragState }: { appState: AppState; dragState: ExtendedDragState | null }) {
  return (
    <g>
      {(appState.placedObjects ?? []).map((p) => {
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
        const minDim = Math.min(ow, oh);
        const maxFontSize = 6;
        const minFontSize = 2;
        const calculatedFontSize = Math.min(maxFontSize, Math.max(minFontSize, minDim * 0.12));
        
        const estimatedTextWidth = def.name.length * calculatedFontSize * 0.6;
        const textFits = estimatedTextWidth < ow * 0.9;
        
        let displayText = def.name;
        if (!textFits && ow > 15) {
          const maxChars = Math.floor((ow * 0.85) / (calculatedFontSize * 0.6));
          if (maxChars >= 2) {
            displayText = def.name.slice(0, maxChars - 1) + '…';
          } else {
            displayText = '';
          }
        }
        
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
    </g>
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
