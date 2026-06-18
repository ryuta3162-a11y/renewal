import { STORAGE_PREFIX } from "./constants.js";

const KEY = STORAGE_PREFIX + "custom-zone-presets";

export function loadCustomZonePresets() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return list.map(({ opacity, ...preset }) => preset);
  } catch {
    return [];
  }
}

export function saveCustomZonePresets(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addCustomZonePreset({ name, color, desc }) {
  const list = loadCustomZonePresets();
  const entry = {
    id: "custom-" + crypto.randomUUID(),
    name: name.trim(),
    color: color || "#a78bfa",
    desc: desc?.trim() || "自作の区画区分",
    isCustom: true,
  };
  list.push(entry);
  saveCustomZonePresets(list);
  return entry;
}

export function updateCustomZonePreset(id, data) {
  const list = loadCustomZonePresets();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...data, id, isCustom: true };
  saveCustomZonePresets(list);
  return list[idx];
}

export function deleteCustomZonePreset(id) {
  saveCustomZonePresets(loadCustomZonePresets().filter((p) => p.id !== id));
}
