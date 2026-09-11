/**
 * リニューアル候補の設置寸法。
 * メーカー公式の床占有（幅×奥行×高さ mm）を優先。
 * 出典: exports/machine-dimensions-LM.tsv
 */
export const FIT_MACHINES = [
  { id: "A-01", label: "HS Half Half Combo Rack", name: "HD Athletic NX Half Half Combo Rack", brand: "Hammer Strength", category: "フリーウェイト", purpose: "新規4ステーション追加", widthMm: 1500, depthMm: 3000, heightMm: 2310, shape: "rack", unitPrice: 4000000, count: 2, note: "構成可変。配置想定寸法。", dimConfidence: "low" },
  { id: "A-02", label: "Platform床材", name: "Impact Suppression Platform ISP-6X8", brand: "Hammer Strength", category: "フリーウェイト", purpose: "ラック下の衝撃吸収", widthMm: 2400, depthMm: 1920, heightMm: 80, shape: "platform", unitPrice: 600000, count: 4, note: "公式 ISP-6X8。", dimConfidence: "high" },
  { id: "A-03", label: "ダンベル60kgまで", name: "EVA-D104 + EVRB-C177ラック", brand: "EVOLGEAR", category: "フリーウェイト", purpose: "高重量ダンベル", widthMm: 2126, depthMm: 620, heightMm: 810, shape: "dumbbell", unitPrice: 471520, count: 1, note: "10ペアラック占有。", dimConfidence: "medium" },
  { id: "A-04", label: "ADベンチ追加", name: "アジャスタブルインクラインベンチ EVRB-L139", brand: "EVOLGEAR", category: "フリーウェイト", purpose: "ベンチ6台体制", widthMm: 1400, depthMm: 760, heightMm: 470, shape: "bench", unitPrice: 77050, count: 3, note: "公式外形。", dimConfidence: "high" },
  { id: "B-01", label: "Precor 3D Abductor Pro", name: "Selectorized 3D Multi-Abductor Pro", brand: "Precor", category: "プレートロード", purpose: "グルート入口", widthMm: 1780, depthMm: 740, heightMm: 1450, shape: "plate", unitPrice: 2400000, count: 1, note: "GSL0622。", dimConfidence: "high" },
  { id: "B-02", label: "Precor Hip Thrust Elite", name: "Hip Thrust Elite", brand: "Precor", category: "プレートロード", purpose: "グルート看板", widthMm: 1700, depthMm: 1960, heightMm: 1300, shape: "plate", unitPrice: 1800000, count: 1, note: "GPL0612。", dimConfidence: "high" },
  { id: "B-03", label: "Precor Deadlift Elite", name: "Deadlift Elite", brand: "Precor", category: "プレートロード", purpose: "ヒンジ兼用", widthMm: 1880, depthMm: 1700, heightMm: 740, shape: "plate", unitPrice: 1500000, count: 1, note: "GPL0551。", dimConfidence: "high" },
  { id: "B-04", label: "Arsenal T Bar Row", name: "Reloaded T Bar Row", brand: "Arsenal Strength", category: "プレートロード", purpose: "背中の厚み", widthMm: 1410, depthMm: 1810, heightMm: 640, shape: "plate", unitPrice: 1200000, count: 1, note: "", dimConfidence: "high" },
  { id: "B-05", label: "gym80 High Row Dual", name: "Pure Kraft High Row Dual", brand: "gym80", category: "プレートロード", purpose: "背中の広がり", widthMm: 1380, depthMm: 1580, heightMm: 2030, shape: "plate", unitPrice: 2200000, count: 1, note: "4340。", dimConfidence: "high" },
  { id: "B-06", label: "gym80 Low Row Dual", name: "Pure Kraft Low Row Dual", brand: "gym80", category: "プレートロード", purpose: "背中の厚み", widthMm: 1825, depthMm: 1475, heightMm: 2000, shape: "plate", unitPrice: 2200000, count: 1, note: "4319。", dimConfidence: "high" },
  { id: "B-07", label: "gym80 Bent Over Row", name: "Pure Kraft Bent Over Row", brand: "gym80", category: "プレートロード", purpose: "珍しさ", widthMm: 1020, depthMm: 1760, heightMm: 470, shape: "plate", unitPrice: 1600000, count: 1, note: "4318。", dimConfidence: "high" },
  { id: "B-08", label: "gym80 Seated Row Dual", name: "Pure Kraft Seated Row Dual", brand: "gym80", category: "プレートロード", purpose: "背中", widthMm: 1060, depthMm: 1550, heightMm: 1210, shape: "plate", unitPrice: 1800000, count: 1, note: "4322想定。", dimConfidence: "medium" },
  { id: "B-09", label: "gym80 Lateral Raise", name: "Pure Kraft Shoulder Lateral Raise Dual", brand: "gym80", category: "プレートロード", purpose: "肩の立体感", widthMm: 880, depthMm: 1390, heightMm: 1330, shape: "plate", unitPrice: 2200000, count: 1, note: "4325。", dimConfidence: "high" },
  { id: "B-10", label: "gym80 Hack Squat", name: "Pure Kraft Hack Squat", brand: "gym80", category: "プレートロード", purpose: "脚トレの本命", widthMm: 1294, depthMm: 2206, heightMm: 1361, shape: "plate", unitPrice: 2300000, count: 1, note: "4159N。", dimConfidence: "high" },
  { id: "B-11", label: "gym80 Lying Leg Curl", name: "Pure Kraft Lying Leg Curl", brand: "gym80", category: "プレートロード", purpose: "ハム特化", widthMm: 1269, depthMm: 1633, heightMm: 841, shape: "plate", unitPrice: 1800000, count: 1, note: "4337N。", dimConfidence: "high" },
  { id: "B-12", label: "gym80 Leg Extension", name: "Pure Kraft Leg Extension", brand: "gym80", category: "プレートロード", purpose: "大腿四頭筋", widthMm: 1322, depthMm: 1336, heightMm: 1037, shape: "plate", unitPrice: 1800000, count: 1, note: "4336N。", dimConfidence: "high" },
  { id: "B-13", label: "gym80 Standing Calf Raise", name: "Pure Kraft 55 Degrees Standing Calf Raise", brand: "gym80", category: "プレートロード", purpose: "カーフ専用", widthMm: 1010, depthMm: 1330, heightMm: 1280, shape: "plate", unitPrice: 1800000, count: 1, note: "4345。", dimConfidence: "high" },
  { id: "B-14", label: "gym80 Belt Squat", name: "Pure Kraft Belt Squat", brand: "gym80", category: "プレートロード", purpose: "脚オプション", widthMm: 1955, depthMm: 1585, heightMm: 1490, shape: "plate", unitPrice: 0, count: 0, note: "4360。", dimConfidence: "high" },
  { id: "B-15", label: "gym80 Pendulum Squat", name: "Pure Kraft Pendulum Squat", brand: "gym80", category: "プレートロード", purpose: "脚オプション", widthMm: 1068, depthMm: 2421, heightMm: 1733, shape: "plate", unitPrice: 0, count: 0, note: "4353N。", dimConfidence: "high" },
  { id: "B-16", label: "gym80 Biceps Curl Dual", name: "Pure Kraft Biceps Curl Dual", brand: "gym80", category: "プレートロード", purpose: "二頭専用", widthMm: 946, depthMm: 1530, heightMm: 1243, shape: "plate", unitPrice: 1600000, count: 1, note: "4355。", dimConfidence: "high" },
  { id: "B-17", label: "gym80 Triceps Extension", name: "Pure Kraft Triceps Extension", brand: "gym80", category: "プレートロード", purpose: "三頭専用", widthMm: 1179, depthMm: 1279, heightMm: 1493, shape: "plate", unitPrice: 1600000, count: 1, note: "4339N。", dimConfidence: "high" },
  { id: "B-18", label: "ECOLECO シーテッドロウ", name: "ELC-07 シーテッドロウ", brand: "ECOLECO FITNESS", category: "プレートロード", purpose: "背中オプション", widthMm: 1567, depthMm: 2084, heightMm: 1605, shape: "plate", unitPrice: 294000, count: 0, note: "公式 奥行×幅×高さ。", dimConfidence: "high" },
  { id: "E-01", label: "ONI 鬼コンボラック", name: "鬼コンボラック IPF公認", brand: "ONI", category: "備品", purpose: "競技用ベンチ", widthMm: 950, depthMm: 1400, heightMm: 2300, shape: "rack", unitPrice: 300000, count: 1, note: "既存想定寸法。", dimConfidence: "low" },
  { id: "C-02", label: "gym80 Prone Leg Curl", name: "Prone / Lying Leg Curl", brand: "gym80", category: "レジスタンスマシン", purpose: "脚基本", widthMm: 1269, depthMm: 1633, heightMm: 841, shape: "stack", unitPrice: 1800000, count: 1, note: "4337N系。", dimConfidence: "high" },
  { id: "C-03", label: "PRIME Pec / Rear Delt", name: "Hybrid Pec Fly / Rear Delt", brand: "PRIME", category: "レジスタンスマシン", purpose: "胸・リアデルト兼用", widthMm: 1500, depthMm: 940, heightMm: 1930, shape: "stack", unitPrice: 1500000, count: 1, note: "H-129。", dimConfidence: "high" },
  { id: "C-04", label: "gym80 Neck Press", name: "Neck Press", brand: "gym80", category: "レジスタンスマシン", purpose: "珍しい肩", widthMm: 1147, depthMm: 1661, heightMm: 2089, shape: "stack", unitPrice: 1800000, count: 1, note: "4371。", dimConfidence: "high" },
  { id: "C-05", label: "gym80 Reverse Butterfly", name: "Butterfly Reverse Dual", brand: "gym80", category: "レジスタンスマシン", purpose: "リアデルト", widthMm: 870, depthMm: 1800, heightMm: 1390, shape: "stack", unitPrice: 1500000, count: 1, note: "4344。", dimConfidence: "high" },
  { id: "C-06", label: "gym80 Wide Pulldown", name: "Lat Pulldown Dual", brand: "gym80", category: "レジスタンスマシン", purpose: "背中の広がり", widthMm: 1500, depthMm: 1590, heightMm: 2210, shape: "stack", unitPrice: 1800000, count: 1, note: "4311。", dimConfidence: "high" },
  { id: "C-07", label: "PRIME Seated Row", name: "Hybrid Seated Row", brand: "PRIME", category: "レジスタンスマシン", purpose: "背中の厚み", widthMm: 1300, depthMm: 1300, heightMm: 1800, shape: "stack", unitPrice: 1600000, count: 1, note: "", dimConfidence: "high" },
  { id: "C-08", label: "PRIME Seated Dips", name: "Hybrid Seated Pushdown", brand: "PRIME", category: "レジスタンスマシン", purpose: "三頭", widthMm: 1330, depthMm: 1480, heightMm: 1500, shape: "stack", unitPrice: 1500000, count: 1, note: "Seated Pushdown相当。", dimConfidence: "medium" },
  { id: "C-09", label: "HOIST Bicep Curl", name: "ROC-IT / RPL Bicep Curl", brand: "HOIST", category: "レジスタンスマシン", purpose: "二頭専用", widthMm: 1500, depthMm: 1640, heightMm: 1480, shape: "stack", unitPrice: 1300000, count: 1, note: "機種要確認。", dimConfidence: "medium" },
  { id: "C-10", label: "Ab Coaster", name: "Ab Coaster CS3000", brand: "The Abs Company", category: "レジスタンスマシン", purpose: "見た目が強い腹筋", widthMm: 711, depthMm: 1765, heightMm: 1482, shape: "stack", unitPrice: 900000, count: 1, note: "CS3000想定。", dimConfidence: "medium" },
  { id: "D-01", label: "Concept2 SkiErg", name: "SkiErg PM5 + Stand", brand: "Concept2", category: "有酸素", purpose: "HYROX・省スペース", widthMm: 600, depthMm: 1270, heightMm: 2160, shape: "ski", unitPrice: 205000, count: 1, note: "フロアスタンド公式。", dimConfidence: "high" },
  { id: "D-02", label: "Concept2 RowErg", name: "RowErg PM5", brand: "Concept2", category: "有酸素", purpose: "HYROX補完", widthMm: 610, depthMm: 2440, heightMm: 860, shape: "rower", unitPrice: 190000, count: 1, note: "床占有244×61cm。", dimConfidence: "high" },
  { id: "D-03", label: "PowerMax V3 Pro", name: "POWER MAX V3 Pro", brand: "KONAMI", category: "有酸素", purpose: "無酸素パワー", widthMm: 600, depthMm: 1030, heightMm: 820, shape: "bike", unitPrice: 1200000, count: 1, note: "CONNECT PRO系。", dimConfidence: "high" },
  { id: "D-04", label: "Life Fitness PowerMill", name: "PowerMill Climber", brand: "Life Fitness", category: "有酸素", purpose: "階段系", widthMm: 840, depthMm: 1430, heightMm: 2100, shape: "climber", unitPrice: 2200000, count: 1, note: "公式組立寸法。", dimConfidence: "high" },
  { id: "D-05", label: "WOODWAY Curve", name: "Curve Treadmill", brand: "WOODWAY", category: "有酸素", purpose: "自走式", widthMm: 840, depthMm: 1780, heightMm: 1830, shape: "curve", unitPrice: 2000000, count: 1, note: "公式。", dimConfidence: "high" },
  { id: "F-01", label: "Tire Flip", name: "Tire Flip / Strongman Tire", brand: "Rogue / 同等品", category: "ストロングマン", purpose: "映え", widthMm: 1200, depthMm: 1200, heightMm: 430, shape: "tire", unitPrice: 500000, count: 1, note: "推定。転倒スペース別途。", dimConfidence: "low" },
  { id: "F-02", label: "Dog Sled", name: "Dog Sled 1.2", brand: "Rogue / 同等品", category: "ストロングマン", purpose: "人工芝レーン", widthMm: 610, depthMm: 1016, heightMm: 1003, shape: "sled", unitPrice: 250000, count: 1, note: "Rogue公式。", dimConfidence: "high" },
  { id: "F-03", label: "Farmer's Walk Handles", name: "Farmer’s Walk Handles", brand: "Rogue / 同等品", category: "ストロングマン", purpose: "省スペース", widthMm: 610, depthMm: 1524, heightMm: 254, shape: "handles", unitPrice: 160000, count: 1, note: "1本分の目安。", dimConfidence: "low" },
  { id: "F-04", label: "Log Bar", name: "LB-1 10 inch Log Bar", brand: "Rogue / 同等品", category: "ストロングマン", purpose: "ログプレス", widthMm: 254, depthMm: 1956, heightMm: 254, shape: "log", unitPrice: 200000, count: 1, note: "水平置き。", dimConfidence: "high" },
  { id: "F-05", label: "Strongman Sandbag", name: "Strongman Sandbag Set", brand: "Rogue / 同等品", category: "ストロングマン", purpose: "HYROX兼用", widthMm: 406, depthMm: 406, heightMm: 394, shape: "bag", unitPrice: 250000, count: 1, note: "200lb単体の目安。", dimConfidence: "low" },
];

export const FIT_CATEGORIES = [
  "フリーウェイト",
  "プレートロード",
  "レジスタンスマシン",
  "有酸素",
  "ストロングマン",
  "備品",
];

export function formatMm(mm) {
  const n = Number(mm) || 0;
  if (n >= 1000) return `${(n / 1000).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")} m`;
  return `${Math.round(n)} mm`;
}

export function formatPrice(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `¥${n.toLocaleString("ja-JP")}`;
}

export function occupiedSize(machine, rotated) {
  const w = Number(machine.widthMm) || 0;
  const d = Number(machine.depthMm) || 0;
  const h = Number(machine.heightMm) || 0;
  return rotated ? { widthMm: d, depthMm: w, heightMm: h } : { widthMm: w, depthMm: d, heightMm: h };
}

export function fitStatus(machine, bay, rotated) {
  if (!bay) return { rank: "none", label: "スロット未選択", leftover: null };
  if (!machine) return { rank: "none", label: "マシン未選択", leftover: null };
  const size = occupiedSize(machine, rotated);
  const dw = (Number(bay.widthMm) || 0) - size.widthMm;
  const dd = (Number(bay.depthMm) || 0) - size.depthMm;
  const dh = (Number(bay.heightMm) || 0) - size.heightMm;
  if (dw < 0 || dd < 0 || dh < 0) {
    return { rank: "over", label: "はみ出し", leftover: { w: dw, d: dd, h: dh } };
  }
  if (dw < 150 || dd < 150) {
    return { rank: "tight", label: "余裕15cm未満", leftover: { w: dw, d: dd, h: dh } };
  }
  return { rank: "ok", label: "入る", leftover: { w: dw, d: dd, h: dh } };
}
