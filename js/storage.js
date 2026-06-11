import { STORAGE_PREFIX } from "./constants.js";

export function saveDesign(drawingId, json) {
  localStorage.setItem(STORAGE_PREFIX + drawingId, JSON.stringify(json));
}

export function loadDesign(drawingId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + drawingId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function listSavedDesigns() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      keys.push(key.slice(STORAGE_PREFIX.length));
    }
  }
  return keys;
}
