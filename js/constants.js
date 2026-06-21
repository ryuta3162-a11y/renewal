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

/** 旧ファイル名 → 現在の drawings 内の実ファイル */
export const DRAWING_FILE_ALIASES = {
  "/drawings/kushita-1.pdf": "/drawings/日下　入口.pdf",
  "/drawings/kushita-2.pdf": "/drawings/日下　2F.pdf",
  "/drawings/kushita-3.pdf": "/drawings/日下　3F.pdf",
  "/drawings/mito.pdf": "/drawings/みと　まとめ.pdf",
  "/drawings/日下①.pdf": "/drawings/日下　入口.pdf",
  "/drawings/日下②.pdf": "/drawings/日下　2F.pdf",
  "/drawings/日下③.pdf": "/drawings/日下　3F.pdf",
  "/drawings/日下 3F.pdf": "/drawings/日下　3F.pdf",
  "/drawings/みと①.pdf": "/drawings/みと　まとめ.pdf",
  "/drawings/gyotoku-1.pdf": "/drawings/行徳　2F.pdf",
  "/drawings/gyotoku-2.pdf": "/drawings/行徳　3F.pdf",
  "/drawings/kyodo-7.pdf": "/drawings/経堂　原本.pdf",
  "/drawings/kyodo-8.pdf": "/drawings/経堂　2F.pdf",
  "/drawings/kyodo-9.pdf": "/drawings/経堂　3F.pdf",
  "/drawings/原本-7.pdf": "/drawings/経堂　原本.pdf",
  "/drawings/原本-8.pdf": "/drawings/経堂　2F.pdf",
  "/drawings/原本-9.pdf": "/drawings/経堂　3F.pdf",
};

/** 旧 id → 新 id（保存データの引き継ぎ用） */
export const DRAWING_ID_ALIASES = {
  "kushita-1": "日下①",
  "kushita-2": "日下②",
  "kushita-3": "日下③",
  mito: "みと①",
};

export function resolveDrawingFile(file) {
  return DRAWING_FILE_ALIASES[file] || file;
}

/** 日本語ファイル名を含むパスを fetch 用 URL に変換 */
export function resolveDrawingUrl(file) {
  const path = resolveDrawingFile(file);
  if (!path || path.startsWith("data:")) return path;
  const i = path.lastIndexOf("/");
  const encoded =
    i < 0 ? encodeURI(path) : path.slice(0, i + 1) + encodeURIComponent(path.slice(i + 1));
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(encoded, window.location.origin).href;
  }
  return encoded;
}

/** 同一PDF判定用（エイリアス解決後のパス） */
export function drawingFileKey(file) {
  return resolveDrawingFile(file || "");
}

export const DRAWINGS = [
  { id: "kyodo-7", name: "経堂　原本", file: "/drawings/経堂　原本.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS },
  { id: "kyodo-8", name: "経堂　2F", file: "/drawings/経堂　2F.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS, planAreaM2: 525.21, planAreaTsubo: 158.87 },
  { id: "kyodo-9", name: "経堂　3F", file: "/drawings/経堂　3F.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS },
  { id: "みと①", name: "みと　まとめ", file: "/drawings/みと　まとめ.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "日下①", name: "日下　入口", file: "/drawings/日下　入口.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS, planAreaM2: 525.21, planAreaTsubo: 158.87 },
  { id: "日下②", name: "日下　2F", file: "/drawings/日下　2F.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS },
  { id: "日下③", name: "日下　3F", file: "/drawings/日下　3F.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM, scaleHints: KYODO_SCALE_HINTS },
  { id: "gyotoku-1", name: "行徳　2F", file: "/drawings/行徳　2F.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
  { id: "gyotoku-2", name: "行徳　3F", file: "/drawings/行徳　3F.pdf", kind: "pdf", planWidthMm: DEFAULT_PLAN_WIDTH_MM },
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
