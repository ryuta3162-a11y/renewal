export const MASTER_PROJECT_ID = "master";

export const STORAGE_PREFIX = "renewal-studio-";

/** 図面に planWidthMm が無い場合の全幅仮定（mm）— みと図面等と同値 */
export const DEFAULT_PLAN_WIDTH_MM = 29080;

/** 経堂原本系 — 現場スタッフ向け縮尺プリセット（図面上の寸法線 mm） */
export const KYODO_SCALE_HINTS = [
  { label: "FW横 12392", mm: 12392, tip: "フリーウェイト上の横寸法線（左右の端）" },
  { label: "区画 30300", mm: 30300, tip: "図面上部の長い横寸法線（7000+30300…の30300部分）" },
  { label: "境界 29890", mm: 29890, tip: "隣地境界線の長さ" },
];

export const DRAWINGS = [
  { id: "gyotoku-1", name: "gyotoku-1", file: "/drawings/gyotoku-1.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "gyotoku-2", name: "gyotoku-2", file: "/drawings/gyotoku-2.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "kushita-1", name: "kushita-1", file: "/drawings/kushita-1.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS, planAreaM2: 525.21, planAreaTsubo: 158.87 },
  { id: "kushita-2", name: "kushita-2", file: "/drawings/kushita-2.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS },
  { id: "kushita-3", name: "kushita-3", file: "/drawings/kushita-3.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS },
  { id: "kyodo-17", name: "kyodo-17", file: "/drawings/kyodo-17.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "kyodo-7", name: "kyodo-7", file: "/drawings/kyodo-7.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS },
  { id: "kyodo-8", name: "kyodo-8", file: "/drawings/kyodo-8.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS, planAreaM2: 525.21, planAreaTsubo: 158.87 },
  { id: "kyodo-9", name: "kyodo-9", file: "/drawings/kyodo-9.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS },
  { id: "mito", name: "mito", file: "/drawings/mito.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
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
