'use client';

import { useState } from 'react';
import { Room, WallSide, WallOpening, OpeningType } from '@/src/model/types';

interface DoorOpeningsPanelProps {
  room: Room;
  openings: WallOpening[];
  onAddOpening: (roomId: string, wall: WallSide, positionCm: number, widthCm: number, type: OpeningType) => void;
  onUpdateDoor: (openingId: string, updates: Partial<WallOpening>) => void;
  onDeleteDoor: (openingId: string) => void;
}

const wallLabels: Record<WallSide, string> = {
  north: 'North (Top)',
  south: 'South (Bottom)',
  east: 'East (Right)',
  west: 'West (Left)',
};

export function DoorOpeningsPanel({ room, openings, onAddOpening, onUpdateDoor, onDeleteDoor }: DoorOpeningsPanelProps) {
  const [selectedWall, setSelectedWall] = useState<WallSide>('north');
  const [positionCm, setPositionCm] = useState('50');
  const [widthCm, setWidthCm] = useState('90');
  const [openingType, setOpeningType] = useState<OpeningType>('door');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPosition, setEditPosition] = useState('');
  const [editWidth, setEditWidth] = useState('');
  const [editType, setEditType] = useState<OpeningType>('door');

  // Get wall length for validation
  const getWallLengthCm = (wall: WallSide): number => {
    const isHorizontal = wall === 'north' || wall === 'south';
    return isHorizontal ? room.widthCm : room.heightCm;
  };

  const handleAddOpening = () => {
    const pos = parseFloat(positionCm);
    const width = parseFloat(widthCm);
    const wallLength = getWallLengthCm(selectedWall);

    if (isNaN(pos) || isNaN(width) || pos < 0 || width < 10) {
      alert('Please enter valid position and width values');
      return;
    }

    if (pos + width > wallLength) {
      alert(`Opening extends beyond wall. Wall length is ${wallLength}cm`);
      return;
    }

    onAddOpening(room.id, selectedWall, pos, width, openingType);
    setPositionCm('50');
    setWidthCm(openingType === 'door' ? '90' : '100');
  };

  const handleStartEdit = (opening: WallOpening) => {
    setEditingId(opening.id);
    setEditPosition(opening.positionCm.toString());
    setEditWidth(opening.widthCm.toString());
    setEditType(opening.type);
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
      alert(`Opening extends beyond wall. Wall length is ${wallLength}cm`);
      return;
    }

    onUpdateDoor(opening.id, { positionCm: pos, widthCm: width, type: editType });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // Separate doors and windows
  const doors = openings.filter(o => o.type === 'door');
  const windows = openings.filter(o => o.type === 'window');

  return (
    <div className="mt-6 pt-6 border-t border-slate-100">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Doors & Windows</h3>

      {/* Add New Opening */}
      <div className="bg-slate-50 rounded-lg p-3 space-y-3 mb-4">
        <p className="text-xs font-medium text-slate-500">Add New Opening</p>

        {/* Type selector */}
        <div className="flex gap-1">
          <button
            onClick={() => { setOpeningType('door'); setWidthCm('90'); }}
            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
              openingType === 'door'
                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            🚪 Door
          </button>
          <button
            onClick={() => { setOpeningType('window'); setWidthCm('100'); }}
            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
              openingType === 'window'
                ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-300'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            🪟 Window
          </button>
        </div>

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
          onClick={handleAddOpening}
          className={`w-full btn text-white ${
            openingType === 'door' 
              ? 'bg-emerald-600 hover:bg-emerald-700' 
              : 'bg-sky-600 hover:bg-sky-700'
          }`}
        >
          Add {openingType === 'door' ? 'Door' : 'Window'}
        </button>

        <p className="text-xs text-slate-400">
          Tip: Use the Measure tool (M) to find the exact position.
        </p>
      </div>

      {/* Existing Openings List */}
      {openings.length > 0 && (
        <div className="space-y-3">
          {/* Doors */}
          {doors.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-emerald-600">🚪 Doors ({doors.length})</p>
              {doors.map((opening) => renderOpeningItem(opening))}
            </div>
          )}

          {/* Windows */}
          {windows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-sky-600">🪟 Windows ({windows.length})</p>
              {windows.map((opening) => renderOpeningItem(opening))}
            </div>
          )}
        </div>
      )}

      {openings.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-4">
          No doors or windows added yet
        </p>
      )}
    </div>
  );

  function renderOpeningItem(opening: WallOpening) {
    return (
      <div
        key={opening.id}
        className={`bg-white border rounded-lg p-2.5 text-sm ${
          opening.type === 'door' ? 'border-emerald-200' : 'border-sky-200'
        }`}
      >
        {editingId === opening.id ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 w-16">{wallLabels[opening.wall].split(' ')[0]}</span>
              {/* Type toggle in edit mode */}
              <div className="flex gap-1 ml-auto">
                <button
                  onClick={() => setEditType('door')}
                  className={`px-2 py-0.5 text-xs rounded ${editType === 'door' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                >
                  Door
                </button>
                <button
                  onClick={() => setEditType('window')}
                  className={`px-2 py-0.5 text-xs rounded ${editType === 'window' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}
                >
                  Window
                </button>
              </div>
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
                className={`flex-1 px-2 py-1 text-white text-xs rounded-md font-medium ${
                  editType === 'door' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-sky-600 hover:bg-sky-700'
                }`}
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
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                onClick={() => onDeleteDoor(opening.id)}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-all"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
}
