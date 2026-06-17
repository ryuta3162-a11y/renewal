const TSUBO_PER_M2 = 1 / 3.305785;

/** キャンバス座標 → 図面画像の素ピクセル座標 */
export function canvasToImagePx(pt, drawingImage) {
  if (!drawingImage) return null;
  return {
    x: (pt.x - drawingImage.left) / (drawingImage.scaleX || 1),
    y: (pt.y - drawingImage.top) / (drawingImage.scaleY || 1),
  };
}

export function imagePxDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function mmPerImagePxFromCalibration(imagePxDist, realMm) {
  if (!imagePxDist || !realMm) return null;
  return realMm / imagePxDist;
}

/** 図面の㎡と囲んだ矩形（画像px）から縮尺を算出 */
export function mmPerImagePxFromAreaMatch(knownM2, widthPx, heightPx) {
  if (!knownM2 || !widthPx || !heightPx) return null;
  const areaPx = widthPx * heightPx;
  if (areaPx <= 0) return null;
  return Math.sqrt((knownM2 * 1_000_000) / areaPx);
}

/** 区画ポリゴンの頂点（キャンバス座標） */
export function getZoneCanvasPoints(zone) {
  const poly = zone._objects?.[0];
  if (!poly?.points?.length) return [];
  const offset = poly.pathOffset || { x: 0, y: 0 };
  const matrix = zone.calcTransformMatrix();
  return poly.points.map((p) =>
    fabric.util.transformPoint(
      new fabric.Point(p.x - offset.x, p.y - offset.y),
      matrix
    )
  );
}

function shoelaceArea(points) {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

function bboxFromPoints(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** 描画中のキャンバス座標配列から実寸を算出 */
export function computeZoneMetricsFromCanvasPoints(canvasPoints, drawingImage, mmPerImagePx) {
  if (!mmPerImagePx || !drawingImage || canvasPoints.length < 3) return null;

  const imgPts = canvasPoints
    .map((p) => canvasToImagePx(p, drawingImage))
    .filter(Boolean);
  if (imgPts.length < 3) return null;

  const mmPts = imgPts.map((p) => ({ x: p.x * mmPerImagePx, y: p.y * mmPerImagePx }));
  const areaMm2 = shoelaceArea(mmPts);
  const bbox = bboxFromPoints(mmPts);

  const areaM2 = areaMm2 / 1_000_000;
  return {
    areaM2,
    areaTsubo: areaM2 * TSUBO_PER_M2,
    widthM: bbox.width / 1000,
    depthM: bbox.height / 1000,
  };
}

/** 区画の実寸（mmPerImagePx が未設定なら null） */
export function computeZoneMetrics(zone, drawingImage, mmPerImagePx) {
  if (!mmPerImagePx || !drawingImage) return null;
  const canvasPts = getZoneCanvasPoints(zone);
  if (canvasPts.length < 3) return null;

  const imgPts = canvasPts
    .map((p) => canvasToImagePx(p, drawingImage))
    .filter(Boolean);
  if (imgPts.length < 3) return null;

  const mmPts = imgPts.map((p) => ({ x: p.x * mmPerImagePx, y: p.y * mmPerImagePx }));
  const areaMm2 = shoelaceArea(mmPts);
  const bbox = bboxFromPoints(mmPts);

  const areaM2 = areaMm2 / 1_000_000;
  const widthM = bbox.width / 1000;
  const depthM = bbox.height / 1000;

  return {
    areaM2,
    areaTsubo: areaM2 * TSUBO_PER_M2,
    widthM,
    depthM,
  };
}

/** 区画の各辺の実長（m）とラベル配置用情報 */
export function computeZoneEdgeLengths(zone, drawingImage, mmPerImagePx) {
  const pts = getZoneCanvasPoints(zone);
  if (pts.length < 2) return [];

  let cx = 0;
  let cy = 0;
  pts.forEach((p) => {
    cx += p.x;
    cy += p.y;
  });
  cx /= pts.length;
  cy /= pts.length;

  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const metrics = segmentMetrics(a, b, drawingImage, mmPerImagePx);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (nx * (cx - mx) + ny * (cy - my) > 0) {
      nx = -nx;
      ny = -ny;
    }
    edges.push({
      lengthM: metrics?.lengthM ?? null,
      midCanvas: { x: mx, y: my },
      outwardCanvas: { x: nx, y: ny },
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }
  return edges;
}

export function segmentMetrics(canvasA, canvasB, drawingImage, mmPerImagePx) {
  if (!mmPerImagePx || !drawingImage) return null;
  const ia = canvasToImagePx(canvasA, drawingImage);
  const ib = canvasToImagePx(canvasB, drawingImage);
  if (!ia || !ib) return null;
  const dxMm = Math.abs(ib.x - ia.x) * mmPerImagePx;
  const dyMm = Math.abs(ib.y - ia.y) * mmPerImagePx;
  const lenMm = imagePxDistance(ia, ib) * mmPerImagePx;
  return {
    lengthM: lenMm / 1000,
    widthM: dxMm / 1000,
    depthM: dyMm / 1000,
  };
}

export function formatEdgeLength(metrics) {
  if (!metrics || metrics.lengthM == null) return "未設定";
  return `${metrics.lengthM.toFixed(2)}m`;
}

export function formatSegmentDimsAlways(metrics) {
  if (!metrics) return "未設定";
  return `横 ${metrics.widthM.toFixed(2)}m　縦 ${metrics.depthM.toFixed(2)}m`;
}

export function formatZoneSizeText(metrics, opts = {}) {
  if (!metrics) return null;
  const m2 = metrics.areaM2.toFixed(2);
  const tsubo = metrics.areaTsubo.toFixed(2);
  let text = opts.showTsubo !== false ? `${m2}㎡ (${tsubo}坪)` : `${m2}㎡`;
  if (opts.showBBoxDims !== false) {
    const w = metrics.widthM.toFixed(1);
    const d = metrics.depthM.toFixed(1);
    text += `\n横 ${w}m　縦 ${d}m`;
  }
  return text;
}

export function formatZoneSizeShort(metrics) {
  if (!metrics) return "";
  return `${metrics.areaM2.toFixed(1)}㎡ · 横${metrics.widthM.toFixed(1)} 縦${metrics.depthM.toFixed(1)}m`;
}

export function formatScaleStatus(mmPerImagePx, summary = null) {
  if (summary?.widthM != null && summary?.depthM != null) {
    const m2 = summary.knownM2 ? `（${summary.knownM2}㎡）` : "";
    return `横 ${summary.widthM.toFixed(1)}m　縦 ${summary.depthM.toFixed(1)}m${m2}`;
  }
  if (!mmPerImagePx) return "未設定";
  return `設定済み`;
}
