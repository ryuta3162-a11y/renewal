export const MASTER_PROJECT_ID = "master";

export const STORAGE_PREFIX = "renewal-studio-";

/** 図面に planWidthMm が無い場合の全幅仮定（mm）— みと図面等と同値 */
export const DEFAULT_PLAN_WIDTH_MM = 29080;

export const DRAWINGS = [
  { id: "kyodo-7", name: "原本-7", file: "/drawings/kyodo-7.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "kyodo-8", name: "原本-8", file: "/drawings/kyodo-8.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "kyodo-9", name: "原本-9", file: "/drawings/kyodo-9.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "kushita-1", name: "日下 図面1", file: "/drawings/kushita-1.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "kushita-2", name: "日下 図面2", file: "/drawings/kushita-2.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "kushita-3", name: "日下 図面3", file: "/drawings/kushita-3.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "kyodo-17", name: "原本-17", file: "/drawings/kyodo-17.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "gyotoku-1", name: "行徳-図面1", file: "/drawings/gyotoku-1.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "gyotoku-2", name: "行徳-図面2", file: "/drawings/gyotoku-2.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "mito", name: "みと図面", file: "/drawings/mito.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "mito-1", name: "みと図面①", file: "/drawings/mito-1.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "mito-2", name: "みと図面②", file: "/drawings/mito-2.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "mito-3", name: "みと図面③", file: "/drawings/mito-3.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "mito-4", name: "みと図面④", file: "/drawings/mito-4.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
];

/** false = マシンUI非表示（データファイルは残す） */
export const MACHINES_UI_ENABLED = false;

/** 取り壊し・移動などの記号パーツ（区画とは別） */
export const MARKS_UI_ENABLED = true;

/** リニューアル検討用マーク — 図面上にクリック配置 */
export const MARK_PARTS = [
  {
    id: "mark-demolish",
    label: "取り壊し",
    category: "リニューアル",
    w: 48,
    h: 48,
    fill: "rgba(185,28,28,0.22)",
    stroke: "#dc2626",
    mark: "✕",
    markRole: "demolish",
  },
  {
    id: "mark-build",
    label: "制作",
    category: "リニューアル",
    w: 48,
    h: 48,
    fill: "rgba(37,99,235,0.18)",
    stroke: "#2563eb",
    mark: "＋",
    markRole: "build",
  },
  {
    id: "mark-move-from",
    label: "移動元",
    category: "リニューアル",
    w: 56,
    h: 44,
    fill: "rgba(234,88,12,0.22)",
    stroke: "#ea580c",
    mark: "出",
    markRole: "move-from",
    usesIndex: true,
  },
  {
    id: "mark-move-to",
    label: "移動先",
    category: "リニューアル",
    w: 56,
    h: 44,
    fill: "rgba(124,58,237,0.22)",
    stroke: "#7c3aed",
    mark: "入",
    markRole: "move-to",
    linksIndex: true,
  },
];

export const DEFAULT_PARTS = [
  { id: "preset-remove", label: "撤去", category: "マーク", w: 50, h: 50, fill: "rgba(220,38,38,0.15)", stroke: "#dc2626", mark: "✕", markRole: "demolish" },
  { id: "preset-keep", label: "残す", category: "マーク", w: 50, h: 50, fill: "rgba(22,163,74,0.15)", stroke: "#16a34a", mark: "○", markRole: "keep" },
];

export function getMarkPaletteParts() {
  return [...MARK_PARTS, ...DEFAULT_PARTS];
}

export const SNAP_GRID = 5;
