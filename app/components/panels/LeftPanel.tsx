'use client';

import React from 'react';
import { AppState, HistoryState, ObjectDef, PlacedObject, Room } from '../../../src/model/types';
import * as State from '../../../src/model/state';
import { AddRoomForm, ObjectDefForm } from '../forms';

interface LeftPanelProps {
  appState: AppState;
  history: HistoryState;
  onUndo: () => void;
  onRedo: () => void;
  onAddRoom: (name: string, width: number, height: number) => void;
  onUpdateGlobalWallThickness: (thickness: number) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onAddObjectDef: (name: string, widthCm: number, heightCm: number) => void;
  onPlaceObjectDef: (defId: string) => void;
  onSelectRoom: (roomId: string, shiftKey: boolean) => void;
  onSelectObject: (objectId: string) => void;
  onDuplicatePlaced: (objectId: string) => void;
  onRotatePlaced: (objectId: string, rotation: number) => void;
  isMobileOpen?: boolean;
  onClose?: () => void;
}

export default function LeftPanel({
  appState,
  history,
  onUndo,
  onRedo,
  onAddRoom,
  onUpdateGlobalWallThickness,
  onExport,
  onImport,
  onAddObjectDef,
  onPlaceObjectDef,
  onSelectRoom,
  onSelectObject,
  onDuplicatePlaced,
  onRotatePlaced,
  isMobileOpen,
  onClose,
}: LeftPanelProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}
      <div className={`
        w-72 bg-white border-r border-slate-200 overflow-y-auto flex flex-col shadow-sm
        fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
        transform transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">B</span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 flex-1">BasedPlanning</h1>
            {onClose && (
              <button
                onClick={onClose}
                className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* Undo/Redo */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={onUndo}
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
            onClick={onRedo}
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
          <AddRoomForm onAddRoom={onAddRoom} />
        </div>

        {/* Settings */}
        <div className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 last:mb-0 last:pb-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Settings</h2>
          <label className="block text-sm font-medium text-slate-600 mb-2">
            Wall thickness (cm)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={appState.globalWallThicknessCm}
            onChange={(e) => onUpdateGlobalWallThickness(Number(e.target.value))}
            className="input-field w-full"
          />
        </div>

        {/* Import/Export */}
        <div className="mb-6 pb-6 border-b border-slate-100 last:border-b-0 last:mb-0 last:pb-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Data</h2>
          <div className="space-y-2">
            <button
              onClick={onExport}
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
                    onImport(e.target.files[0]);
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
          <ObjectDefForm onAdd={onAddObjectDef} />
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
                  onClick={() => onPlaceObjectDef(def.id)}
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
                    onClick={() => onSelectObject(p.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                      isSelected ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{def?.name}</div>
                      <div className="text-xs text-slate-400">{room?.name} • {p.rotationDeg ?? 0}°</div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDuplicatePlaced(p.id); }} 
                      className="p-1.5 hover:bg-slate-200 rounded transition-all"
                      title="Duplicate"
                    >
                      <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const current = p.rotationDeg ?? 0;
                        onRotatePlaced(p.id, (current + 90) % 360);
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
                onClick={(e) => onSelectRoom(room.id, e.shiftKey)}
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
    </>
  );
}
