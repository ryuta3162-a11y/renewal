import { STORAGE_PREFIX } from "./constants.js";

const PARTS_KEY = STORAGE_PREFIX + "custom-parts";

export const CATEGORY_COLORS = {
  筋トレ: { fill: "#dbeafe", stroke: "#2563eb" },
  有酸素: { fill: "#fce7f3", stroke: "#db2777" },
  フリーウェイト: { fill: "#fef3c7", stroke: "#d97706" },
  設備: { fill: "#cffafe", stroke: "#0891b2" },
  什器: { fill: "#f3f4f6", stroke: "#6b7280" },
  構造: { fill: "#e5e7eb", stroke: "#374151" },
  マーク: { fill: "#fffbeb", stroke: "#f59e0b" },
  その他: { fill: "#f3e8ff", stroke: "#9333ea" },
};

export function loadCustomParts() {
  try {
    const raw = localStorage.getItem(PARTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomParts(parts) {
  localStorage.setItem(PARTS_KEY, JSON.stringify(parts));
}

export function addCustomPart(part) {
  const parts = loadCustomParts();
  const entry = {
    id: "custom-" + crypto.randomUUID(),
    label: part.label,
    category: part.category || "その他",
    w: Number(part.w) || 80,
    h: Number(part.h) || 60,
    fill: part.fill || CATEGORY_COLORS[part.category]?.fill || "#e5e7eb",
    stroke: part.stroke || CATEGORY_COLORS[part.category]?.stroke || "#6b7280",
    realWidthMm: part.realWidthMm || "",
    realHeightMm: part.realHeightMm || "",
    note: part.note || "",
    imageData: part.imageData || null,
    isCustom: true,
  };
  parts.push(entry);
  saveCustomParts(parts);
  return entry;
}

export function updateCustomPart(id, updates) {
  const parts = loadCustomParts();
  const idx = parts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  parts[idx] = { ...parts[idx], ...updates };
  saveCustomParts(parts);
  return parts[idx];
}

export function deleteCustomPart(id) {
  saveCustomParts(loadCustomParts().filter((p) => p.id !== id));
}

export function getPartDef(partId) {
  return loadCustomParts().find((p) => p.id === partId) ?? null;
}
