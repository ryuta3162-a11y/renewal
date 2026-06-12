export const MASTER_PROJECT_ID = "master";

export const DRAWINGS = [
  { id: "kyodo-7", name: "原本-7", file: "/drawings/kyodo-7.pdf", kind: "pdf" },
  { id: "kyodo-8", name: "原本-8", file: "/drawings/kyodo-8.pdf", kind: "pdf" },
  { id: "kyodo-9", name: "原本-9", file: "/drawings/kyodo-9.pdf", kind: "pdf" },
  { id: "kyodo-17", name: "原本-17", file: "/drawings/kyodo-17.pdf", kind: "pdf" },
];

export const STORAGE_PREFIX = "renewal-studio-";

export const DEFAULT_PARTS = [
  { id: "preset-remove", label: "撤去", category: "マーク", w: 50, h: 50, fill: "rgba(220,38,38,0.15)", stroke: "#dc2626", mark: "✕" },
  { id: "preset-keep", label: "残す", category: "マーク", w: 50, h: 50, fill: "rgba(22,163,74,0.15)", stroke: "#16a34a", mark: "○" },
];

export const SNAP_GRID = 5;
