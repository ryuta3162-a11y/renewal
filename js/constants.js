export const MASTER_PROJECT_ID = "master";

export const DRAWINGS = [
  { id: "kyodo-7", name: "原本-7", file: "/drawings/kyodo-7.pdf", kind: "pdf" },
  { id: "kyodo-8", name: "原本-8", file: "/drawings/kyodo-8.pdf", kind: "pdf", planWidthMm: 29080 },
  { id: "kyodo-9", name: "原本-9", file: "/drawings/kyodo-9.pdf", kind: "pdf" },
  { id: "kyodo-17", name: "原本-17", file: "/drawings/kyodo-17.pdf", kind: "pdf" },
  { id: "gyotoku-1", name: "行徳-図面1", file: "/drawings/gyotoku-1.pdf", kind: "pdf" },
  { id: "gyotoku-2", name: "行徳-図面2", file: "/drawings/gyotoku-2.pdf", kind: "pdf" },
  { id: "mito-1", name: "みと図面①", file: "/drawings/mito-1.pdf", kind: "pdf", planWidthMm: 29080 },
  { id: "mito-2", name: "みと図面②", file: "/drawings/mito-2.pdf", kind: "pdf", planWidthMm: 29080 },
  { id: "mito-3", name: "みと図面③", file: "/drawings/mito-3.pdf", kind: "pdf", planWidthMm: 29080 },
  { id: "mito-4", name: "みと図面④", file: "/drawings/mito-4.pdf", kind: "pdf", planWidthMm: 29080 },
];

export const STORAGE_PREFIX = "renewal-studio-";

/** false = マシンUI非表示（データファイルは残す） */
export const MACHINES_UI_ENABLED = false;

export const DEFAULT_PARTS = [
  { id: "preset-remove", label: "撤去", category: "マーク", w: 50, h: 50, fill: "rgba(220,38,38,0.15)", stroke: "#dc2626", mark: "✕" },
  { id: "preset-keep", label: "残す", category: "マーク", w: 50, h: 50, fill: "rgba(22,163,74,0.15)", stroke: "#16a34a", mark: "○" },
];

export const SNAP_GRID = 5;
