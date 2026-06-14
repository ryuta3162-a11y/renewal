import { CATEGORY_COLORS } from "./parts-library.js";

/** 24KYODOWORKSPACE 現状マシン・設備一覧（2025時点） */
const INVENTORY = [
  // 有酸素マシン
  { category: "有酸素", label: "ランニングマシン", count: 13, w: 95, h: 42 },
  { category: "有酸素", label: "アセントトレーナー", count: 4, w: 75, h: 55 },
  { category: "有酸素", label: "バイクマシン", count: 3, w: 55, h: 70 },

  // 筋トレマシン
  { category: "筋トレ", label: "レッグプレス", count: 1, w: 90, h: 75 },
  { category: "筋トレ", label: "レッグエクステンション", count: 1, w: 80, h: 65 },
  { category: "筋トレ", label: "レッグカール", count: 1, w: 80, h: 65 },
  { category: "筋トレ", label: "ラットプルダウン", count: 1, w: 75, h: 70 },
  { category: "筋トレ", label: "シーテッドロー", count: 1, w: 85, h: 65 },
  { category: "筋トレ", label: "チェストプレス", count: 1, w: 85, h: 70 },
  { category: "筋トレ", label: "リアデルト・ペックフライ", count: 1, w: 80, h: 65 },
  { category: "筋トレ", label: "ロータリートルソー", count: 1, w: 70, h: 70 },
  { category: "筋トレ", label: "アブドミナルクランチ", count: 1, w: 70, h: 60 },
  { category: "筋トレ", label: "グルートキックバック", count: 1, w: 70, h: 65 },
  { category: "筋トレ", label: "ショルダーマシン", count: 1, w: 75, h: 65 },
  { category: "筋トレ", label: "ヒップアブダクション", count: 1, w: 70, h: 60 },
  { category: "筋トレ", label: "ヒップアダクション", count: 1, w: 70, h: 60 },

  // フリーウエイト
  { category: "フリーウェイト", label: "パワーラック", count: 2, w: 95, h: 95 },
  { category: "フリーウェイト", label: "スミスマシン", count: 2, w: 90, h: 90 },
  { category: "フリーウェイト", label: "ケーブルマシン", count: 1, w: 80, h: 75 },
  { category: "フリーウェイト", label: "プリチャーカール台", count: 1, w: 70, h: 55 },
  { category: "フリーウェイト", label: "アジャスタブルベンチ", count: 3, w: 65, h: 40 },
  {
    category: "フリーウェイト",
    label: "マルチジャングル",
    count: 1,
    w: 110,
    h: 80,
    note: "ラットプル・シーテッドロー・ケーブル",
  },
  {
    category: "フリーウェイト",
    label: "インクラインチェストプレス",
    count: 1,
    w: 85,
    h: 70,
    note: "プレートロード",
  },
  {
    category: "フリーウェイト",
    label: "45°レッグプレス",
    count: 1,
    w: 90,
    h: 75,
    note: "プレートロード",
  },
  { category: "フリーウェイト", label: "チンニング・ディップス", count: 1, w: 75, h: 75 },
  { category: "フリーウェイト", label: "ベンチプレス台", count: 1, w: 80, h: 55 },

  // 設備
  { category: "設備", label: "Wi-Fi", count: 1, w: 40, h: 40, note: "無料Wi-Fi完備" },
  {
    category: "設備",
    label: "駐車場",
    count: 6,
    w: 50,
    h: 50,
    note: "1F業務スーパーと共同",
  },
];

const CATEGORY_ORDER = ["有酸素", "筋トレ", "フリーウェイト", "設備", "マーク", "その他"];

function slugify(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u9fff]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "part";
}

let cachedParts = null;

export function getInventoryParts() {
  if (cachedParts) return cachedParts;
  cachedParts = INVENTORY.map((item, i) => {
    const colors = CATEGORY_COLORS[item.category] || CATEGORY_COLORS["その他"];
    return {
      id: `inv-${slugify(item.label)}-${i}`,
      label: item.label,
      category: item.category,
      count: item.count,
      w: item.w,
      h: item.h,
      fill: colors.fill,
      stroke: colors.stroke,
      note: item.note ? `現状${item.count}台 — ${item.note}` : `現状${item.count}台`,
      isInventory: true,
    };
  });
  return cachedParts;
}

export function getCategoryOrder() {
  return CATEGORY_ORDER;
}

export function findInventoryPart(id) {
  return getInventoryParts().find((p) => p.id === id) ?? null;
}
