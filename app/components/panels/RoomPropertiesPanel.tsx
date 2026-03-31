'use client';

import { useState, useEffect } from 'react';
import { Room } from '@/src/model/types';

interface RoomPropertiesPanelProps {
  room: Room;
  globalWallThickness: number;
  onUpdateName: (roomId: string, name: string) => void;
  onUpdateDimensions: (roomId: string, widthCm: number, heightCm: number) => void;
  onUpdateWallThickness: (roomId: string, wallThickness: {
    north?: number;
    south?: number;
    east?: number;
    west?: number;
  }) => void;
  onUpdateWallLengths?: (roomId: string, wallLengths: {
    north?: number;
    south?: number;
    east?: number;
    west?: number;
  } | undefined) => void;
  onDelete: (roomId: string) => void;
  onToggleLock?: (roomId: string) => void;
}

export function RoomPropertiesPanel({
  room,
  globalWallThickness,
  onUpdateName,
  onUpdateDimensions,
  onUpdateWallThickness,
  onUpdateWallLengths,
  onDelete,
  onToggleLock,
}: RoomPropertiesPanelProps) {
  const [name, setName] = useState(room.name);
  const [widthCm, setWidthCm] = useState(room.widthCm);
  const [heightCm, setHeightCm] = useState(room.heightCm);
  const [wallNorth, setWallNorth] = useState<string>(room.wallThickness?.north?.toString() ?? '');
  const [wallSouth, setWallSouth] = useState<string>(room.wallThickness?.south?.toString() ?? '');
  const [wallEast, setWallEast] = useState<string>(room.wallThickness?.east?.toString() ?? '');
  const [wallWest, setWallWest] = useState<string>(room.wallThickness?.west?.toString() ?? '');

  // Wall lengths state
  const [useIndividualWalls, setUseIndividualWalls] = useState(!!room.wallLengths);
  const [wallLenNorth, setWallLenNorth] = useState<string>(room.wallLengths?.north?.toString() ?? room.widthCm.toString());
  const [wallLenSouth, setWallLenSouth] = useState<string>(room.wallLengths?.south?.toString() ?? room.widthCm.toString());
  const [wallLenEast, setWallLenEast] = useState<string>(room.wallLengths?.east?.toString() ?? room.heightCm.toString());
  const [wallLenWest, setWallLenWest] = useState<string>(room.wallLengths?.west?.toString() ?? room.heightCm.toString());

  // Keep panel inputs in sync when selecting another room
  useEffect(() => {
    setName(room.name);
    setWidthCm(room.widthCm);
    setHeightCm(room.heightCm);
    setWallNorth(room.wallThickness?.north?.toString() ?? '');
    setWallSouth(room.wallThickness?.south?.toString() ?? '');
    setWallEast(room.wallThickness?.east?.toString() ?? '');
    setWallWest(room.wallThickness?.west?.toString() ?? '');
    setUseIndividualWalls(!!room.wallLengths);
    setWallLenNorth(room.wallLengths?.north?.toString() ?? room.widthCm.toString());
    setWallLenSouth(room.wallLengths?.south?.toString() ?? room.widthCm.toString());
    setWallLenEast(room.wallLengths?.east?.toString() ?? room.heightCm.toString());
    setWallLenWest(room.wallLengths?.west?.toString() ?? room.heightCm.toString());
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

  const handleWallLengthsChange = () => {
    if (!onUpdateWallLengths) return;
    if (!useIndividualWalls) {
      onUpdateWallLengths(room.id, undefined);
      return;
    }
    const lengths = {
      north: wallLenNorth ? Number(wallLenNorth) : undefined,
      south: wallLenSouth ? Number(wallLenSouth) : undefined,
      east: wallLenEast ? Number(wallLenEast) : undefined,
      west: wallLenWest ? Number(wallLenWest) : undefined,
    };
    onUpdateWallLengths(room.id, lengths);
  };

  const handleToggleIndividualWalls = () => {
    const newValue = !useIndividualWalls;
    setUseIndividualWalls(newValue);
    if (!newValue && onUpdateWallLengths) {
      // Reset to rectangular
      onUpdateWallLengths(room.id, undefined);
    } else if (newValue) {
      // Initialize with current dimensions
      setWallLenNorth(room.widthCm.toString());
      setWallLenSouth(room.widthCm.toString());
      setWallLenEast(room.heightCm.toString());
      setWallLenWest(room.heightCm.toString());
    }
  };

  return (
    <div>
      {/* Room header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
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
        {/* Lock button */}
        {onToggleLock && (
          <button
            onClick={() => onToggleLock(room.id)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
              room.locked 
                ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' 
                : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
            }`}
            title={room.locked ? 'Unlock room' : 'Lock room'}
          >
            {room.locked ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
              </svg>
            )}
          </button>
        )}
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

      {/* Individual Wall Lengths */}
      {onUpdateWallLengths && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-600">Wandlängen</label>
            <button
              onClick={handleToggleIndividualWalls}
              className={`text-xs px-2 py-1 rounded-md transition-all ${
                useIndividualWalls
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {useIndividualWalls ? 'Individuell' : 'Standard (B×H)'}
            </button>
          </div>
          
          {useIndividualWalls && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nord (oben)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={wallLenNorth}
                  onChange={(e) => setWallLenNorth(e.target.value)}
                  onBlur={handleWallLengthsChange}
                  className="input-field text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Süd (unten)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={wallLenSouth}
                  onChange={(e) => setWallLenSouth(e.target.value)}
                  onBlur={handleWallLengthsChange}
                  className="input-field text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ost (rechts)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={wallLenEast}
                  onChange={(e) => setWallLenEast(e.target.value)}
                  onBlur={handleWallLengthsChange}
                  className="input-field text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">West (links)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={wallLenWest}
                  onChange={(e) => setWallLenWest(e.target.value)}
                  onBlur={handleWallLengthsChange}
                  className="input-field text-center"
                />
              </div>
            </div>
          )}
        </div>
      )}

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
