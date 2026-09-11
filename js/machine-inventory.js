import { CATEGORY_COLORS } from "./parts-library.js";

/** 経堂ジム 現状マシン・設備一覧（写真・寸法ベース）＋リニューアル候補
 *  w/h は図面上の配置用フットプリント（おおよそ cm）。
 *  配置: パレット選択 → 図面上ドラッグ。削除: 選択して Delete。
 */
const INVENTORY = [
  // 有酸素（現状）
  { category: "有酸素", label: "トレッドミル", count: 13, w: 91, h: 174, note: "Technogym Excite Run系" },
  { category: "有酸素", label: "クロストレーナー", count: 4, w: 70, h: 218, note: "Technogym Synchro系" },
  { category: "有酸素", label: "エアロバイク", count: 1, w: 60, h: 114, note: "Technogym Bike系" },
  { category: "有酸素", label: "リクラインバイク", count: 2, w: 60, h: 160, note: "Technogym Recline系" },

  // 筋トレ（現状 Cybex中心）
  { category: "筋トレ", label: "レッグプレス", count: 1, w: 106, h: 172, note: "Cybex Eagle NX" },
  { category: "筋トレ", label: "ショルダープレス", count: 1, w: 155, h: 173, note: "Cybex Eagle NX" },
  { category: "筋トレ", label: "ペックフライ/リアデルト", count: 1, w: 150, h: 135, note: "Cybex Prestige" },
  { category: "筋トレ", label: "ラットプルダウン", count: 1, w: 110, h: 153, note: "Cybex VR1" },
  { category: "筋トレ", label: "グルート", count: 1, w: 101, h: 127, note: "Cybex VR1" },
  { category: "筋トレ", label: "シットアップベンチ", count: 1, w: 70, h: 160 },
  { category: "筋トレ", label: "バックエクステンション", count: 1, w: 80, h: 130 },
  { category: "筋トレ", label: "レッグエクステンション", count: 1, w: 109, h: 127, note: "Cybex Eagle NX" },
  { category: "筋トレ", label: "レッグカール", count: 1, w: 108, h: 158, note: "Cybex Eagle NX" },
  { category: "筋トレ", label: "ヒップアブ/アド", count: 1, w: 84, h: 163, note: "Cybex Eagle NX・両用1台" },
  { category: "筋トレ", label: "ロータリートルソー", count: 1, w: 119, h: 117, note: "Cybex Eagle NX" },
  { category: "筋トレ", label: "チェストプレス", count: 1, w: 145, h: 114, note: "Cybex Eagle NX" },
  { category: "筋トレ", label: "ローロー", count: 1, w: 108, h: 174, note: "Cybex Eagle NX" },
  { category: "筋トレ", label: "アブドミナル", count: 1, w: 101, h: 146, note: "Cybex Eagle NX" },

  // フリーウエイト（現状）
  { category: "フリーウェイト", label: "パワーラック", count: 2, w: 120, h: 150, note: "BULL" },
  { category: "フリーウェイト", label: "スミスマシン", count: 3, w: 200, h: 140, note: "Technogym想定" },
  { category: "フリーウェイト", label: "ケーブルマシン Bravo", count: 1, w: 137, h: 114, note: "Cybex Bravo" },
  { category: "フリーウェイト", label: "ケーブルマシン DAP", count: 1, w: 120, h: 145, note: "Technogym DAP" },
  { category: "フリーウェイト", label: "プリチャーカール", count: 1, w: 80, h: 110, note: "Steelflex" },
  { category: "フリーウェイト", label: "アジャスタブルベンチ", count: 5, w: 70, h: 140 },
  { category: "フリーウェイト", label: "マルチジャングル", count: 1, w: 250, h: 400 },
  { category: "フリーウェイト", label: "インクラインチェストプレス", count: 1, w: 143, h: 208, note: "Matrix" },
  { category: "フリーウェイト", label: "45°レッグプレス", count: 1, w: 150, h: 220 },
  { category: "フリーウェイト", label: "チンニング＆ディップス", count: 1, w: 127, h: 114, note: "Life Fitness" },
  { category: "フリーウェイト", label: "ベンチプレス台", count: 1, w: 130, h: 170, note: "BULL" },
  { category: "フリーウェイト", label: "ダンベルラック", count: 1, w: 70, h: 250, note: "IVANKO〜40kg" },

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

  // リニューアル候補：フリーウェイト
  {
    category: "候補FW",
    label: "HS Half Half Combo Rack",
    count: 2,
    w: 150,
    h: 300,
    note: "Hammer Strength。2台導入で新規4ステーション、既存2ラックと合わせて合計6ステーション構想",
  },
  {
    category: "候補FW",
    label: "Platform床材",
    count: 4,
    w: 150,
    h: 220,
    note: "Half Half Combo Rack両面×2台で4面分を想定",
  },
  {
    category: "候補FW",
    label: "ダンベル60kgまで",
    count: 1,
    w: 160,
    h: 45,
    note: "42.5kg〜60kg追加セット。高重量ダンベルの看板化",
  },
  {
    category: "候補FW",
    label: "ADベンチ追加",
    count: 3,
    w: 65,
    h: 40,
    note: "既存3台＋追加3台でアジャスタブルベンチ6台体制",
  },
  {
    category: "候補FW",
    label: "ONI 鬼コンボラック",
    count: 1,
    w: 95,
    h: 140,
    note: "競技用ベンチ/スクワット兼用。既存BULLベンチに加える候補",
  },

  // リニューアル候補：プレートロード・グルート
  {
    category: "候補PL",
    label: "Precor 3D Abductor Pro",
    count: 1,
    w: 74,
    h: 178,
    note: "Glutebuilder。立位・座位・臥位対応。初心者女性向け入口",
  },
  {
    category: "候補PL",
    label: "Precor Hip Thrust Elite",
    count: 1,
    w: 196,
    h: 170,
    note: "Glutebuilder。最新グルートゾーンの看板マシン",
  },
  {
    category: "候補PL",
    label: "Precor Deadlift Elite",
    count: 1,
    w: 170,
    h: 188,
    note: "Glutebuilder。ヒンジ・片脚・男女兼用。上級者にも刺さる",
  },

  // リニューアル候補：プレートロード・背中/肩/脚/腕
  {
    category: "候補PL",
    label: "Arsenal T Bar Row",
    count: 1,
    w: 160,
    h: 110,
    note: "WARRIORS GYM系。背中の厚みを作る目玉",
  },
  {
    category: "候補PL",
    label: "gym80 High Row Dual",
    count: 1,
    w: 160,
    h: 145,
    note: "背中の広がり。WARRIORS系の高級背中マシン枠",
  },
  {
    category: "候補PL",
    label: "gym80 Low Row Dual",
    count: 1,
    w: 200,
    h: 183,
    note: "背中の厚み。玄人向け",
  },
  {
    category: "候補PL",
    label: "gym80 Bent Over Row",
    count: 1,
    w: 160,
    h: 120,
    note: "ベントオーバーロー系。珍しさと背中訴求",
  },
  {
    category: "候補PL",
    label: "gym80 Lateral Raise",
    count: 1,
    w: 140,
    h: 120,
    note: "肩の立体感。フィジーク・ボディメイク層向け",
  },
  {
    category: "候補PL",
    label: "gym80 Hack Squat",
    count: 1,
    w: 230,
    h: 150,
    note: "脚トレの本命。面積確認が必要",
  },
  {
    category: "候補PL",
    label: "gym80 Lying Leg Curl",
    count: 1,
    w: 170,
    h: 100,
    note: "ハムストリング特化。脚エリアの完成度向上",
  },
  {
    category: "候補PL",
    label: "gym80 Leg Extension",
    count: 1,
    w: 150,
    h: 100,
    note: "大腿四頭筋。既存更新・高級化候補",
  },
  {
    category: "候補PL",
    label: "gym80 Standing Calf Raise",
    count: 1,
    w: 170,
    h: 110,
    note: "カーフ専用。置いてあるジムが少なく差別化しやすい",
  },
  {
    category: "候補PL",
    label: "gym80 Biceps Curl Dual",
    count: 1,
    w: 120,
    h: 105,
    note: "二頭専用。腕を鍛え切れる感を出す",
  },
  {
    category: "候補PL",
    label: "gym80 Triceps Extension",
    count: 1,
    w: 120,
    h: 105,
    note: "三頭専用。カールと分けて導入する候補",
  },

  // リニューアル候補：WARRIORS参考レジスタンス
  {
    category: "候補レジ",
    label: "gym80 Leg Extension",
    count: 1,
    w: 120,
    h: 100,
    note: "WARRIORS掲載参考。レジスタンス枠の脚基本",
  },
  {
    category: "候補レジ",
    label: "gym80 Prone Leg Curl",
    count: 1,
    w: 160,
    h: 95,
    note: "WARRIORS掲載参考。プローンレッグカール",
  },
  {
    category: "候補レジ",
    label: "PRIME Pec / Rear Delt",
    count: 1,
    w: 120,
    h: 105,
    note: "普通のチェストプレスではなく胸・リアデルト兼用",
  },
  {
    category: "候補レジ",
    label: "gym80 Neck Press",
    count: 1,
    w: 120,
    h: 110,
    note: "WARRIORS掲載参考。肩・僧帽上部の珍しいプレス系",
  },
  {
    category: "候補レジ",
    label: "gym80 Reverse Butterfly",
    count: 1,
    w: 120,
    h: 105,
    note: "リアデルト・上背部。フィジーク層向け",
  },
  {
    category: "候補レジ",
    label: "gym80 Wide Pulldown",
    count: 1,
    w: 120,
    h: 115,
    note: "背中の広がり。既存ラットプルとの差別化候補",
  },
  {
    category: "候補レジ",
    label: "PRIME Seated Row",
    count: 1,
    w: 135,
    h: 110,
    note: "WARRIORS掲載参考。背中の厚みと高級感",
  },
  {
    category: "候補レジ",
    label: "PRIME Seated Dips",
    count: 1,
    w: 120,
    h: 105,
    note: "三頭・ディップス系。腕を鍛え切れる感が出る",
  },
  {
    category: "候補レジ",
    label: "HOIST Bicep Curl",
    count: 1,
    w: 110,
    h: 100,
    note: "WARRIORS掲載参考。二頭専用",
  },
  {
    category: "候補レジ",
    label: "Ab Coaster",
    count: 1,
    w: 110,
    h: 120,
    note: "普通の腹筋マシンより見た目が強く、初心者にも分かりやすい",
  },

  // リニューアル候補：有酸素/HYROX
  {
    category: "候補有酸素",
    label: "Concept2 SkiErg",
    count: 1,
    w: 55,
    h: 60,
    note: "HYROX感・省スペース。壁付け/スタンド想定",
  },
  {
    category: "候補有酸素",
    label: "Concept2 RowErg",
    count: 1,
    w: 245,
    h: 60,
    note: "HYROX補完。面積確認",
  },
  {
    category: "候補有酸素",
    label: "PowerMax V3 Pro",
    count: 1,
    w: 70,
    h: 120,
    note: "無酸素パワー・競技者向け",
  },
  {
    category: "候補有酸素",
    label: "Life Fitness PowerMill",
    count: 1,
    w: 115,
    h: 150,
    note: "階段系の本命。女性・減量層にも強い",
  },
  {
    category: "候補有酸素",
    label: "WOODWAY Curve",
    count: 1,
    w: 180,
    h: 90,
    note: "自走式トレッドミル。海外ジム感・映え・HIIT対応",
  },

  // リニューアル候補：備品/ストロングマン
  {
    category: "候補備品",
    label: "Flat Bench",
    count: 1,
    w: 65,
    h: 40,
    note: "フリーウェイト周辺備品",
  },
  {
    category: "候補備品",
    label: "Olympic Bar",
    count: 2,
    w: 220,
    h: 12,
    note: "ラック増設に伴う備品",
  },
  {
    category: "候補備品",
    label: "Plate Tree",
    count: 2,
    w: 65,
    h: 65,
    note: "プレート収納用",
  },
  {
    category: "候補備品",
    label: "Deadlift Jack",
    count: 1,
    w: 75,
    h: 45,
    note: "高重量利用者向け",
  },
  {
    category: "候補Strongman",
    label: "Tire Flip",
    count: 1,
    w: 120,
    h: 120,
    note: "WARRIORS参考。安全性・省スペース性を確認",
  },
  {
    category: "候補Strongman",
    label: "Dog Sled",
    count: 1,
    w: 90,
    h: 70,
    note: "HYROX/ストロングマン兼用。人工芝レーンが必要",
  },
  {
    category: "候補Strongman",
    label: "Farmer's Walk Handles",
    count: 1,
    w: 80,
    h: 40,
    note: "グリップ・体幹・全身系。場所を取りにくい",
  },
  {
    category: "候補Strongman",
    label: "Log Bar",
    count: 1,
    w: 200,
    h: 30,
    note: "ログプレス用。話題性はあるが利用者は限定的",
  },
  {
    category: "候補Strongman",
    label: "Strongman Sandbag",
    count: 1,
    w: 80,
    h: 45,
    note: "HYROX・ストロングマン兼用",
  },
];

const CATEGORY_ORDER = [
  "有酸素",
  "筋トレ",
  "フリーウェイト",
  "設備",
  "候補FW",
  "候補PL",
  "候補レジ",
  "候補有酸素",
  "候補備品",
  "候補Strongman",
  "マーク",
  "その他",
];

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
