/**
 * LocalStorage utilities for persisting app state.
 */

import { AppState } from '../model/types';
import { createInitialState } from '../model/state';

const STORAGE_KEY = 'basedplanning_app_state';

/**
 * Save app state to localStorage.
 */
export function saveState(state: AppState): void {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, json);
  } catch (error) {
    console.error('Failed to save state to localStorage:', error);
  }
}

/**
 * Load app state from localStorage.
 * Returns initial state if nothing is saved or on error.
 */
export function loadState(): AppState {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) {
      const parsed = JSON.parse(json) as AppState;
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load state from localStorage:', error);
  }
  return createInitialState();
}

/**
 * Clear app state from localStorage.
 */
export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear state from localStorage:', error);
  }
}

/**
 * Export app state as JSON file (download).
 */
export function exportStateAsJson(state: AppState, filename: string = 'room-plan.json'): void {
  try {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export state:', error);
  }
}

/**
 * Import app state from a JSON file.
 */
export function importStateFromJson(file: File): Promise<AppState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const parsed = JSON.parse(json) as AppState;
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  });
}
