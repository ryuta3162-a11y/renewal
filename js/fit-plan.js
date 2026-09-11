import { FIT_MACHINES, formatMm, formatPrice, occupiedSize, fitStatus } from "./fit-catalog.js";

/** 図面JSON（share / IndexedDB）から配置用の区画プランを作る */
export function buildPlanFromPage(page, meta = {}) {
  if (!page) return null;
  const mmPerImagePx = Number(page.mmPerImagePx) || 0;
  const transform = page.drawingTransform || { left: 0, top: 0, scaleX: 1, scaleY: 1 };
  const zones = [];

  for (const obj of page.objects || []) {
    if (obj.objectType !== "zone") continue;
    const poly = (obj.objects || []).find((o) => o.type === "polygon");
    if (!poly?.points?.length) continue;

    const canvasPts = polygonToCanvasPoints(obj, poly);
    if (canvasPts.length < 3) continue;

    const planPts = canvasPts.map((p) => canvasPointToPlanMm(p, transform, mmPerImagePx));
    const bbox = bboxOf(planPts);
    const fromLabel = parseSizeFromLabel(obj);
    const widthMm = fromLabel?.widthMm || Math.round(bbox.width);
    const depthMm = fromLabel?.depthMm || Math.round(bbox.height);
    const areaM2 = polygonAreaMm2(planPts) / 1_000_000;

    zones.push({
      id: obj.zoneInstanceId || `${obj.zoneName}-${Math.round(obj.left)}-${Math.round(obj.top)}`,
      name: obj.zoneName || "区画",
      color: obj.zoneColor || "#3b82f6",
      memo: obj.zoneMemo || "",
      pointsMm: planPts,
      widthMm,
      depthMm,
      heightMm: 2500,
      areaM2,
      areaTsubo: areaM2 / 3.305785,
      sizeSource: fromLabel ? "label" : mmPerImagePx ? "scale" : "bbox",
    });
  }

  const boundary = (page.workBoundaryCanvasPoints || []).map((p) =>
    canvasPointToPlanMm(p, transform, mmPerImagePx)
  );

  return {
    sheetId: meta.sheetId || meta.id || "sheet",
    sheetName: meta.sheetName || meta.name || meta.sheetId || "図面",
    projectId: meta.projectId || "master",
    drawingFile: meta.drawingFile || meta.file || null,
    mmPerImagePx,
    scaleCalibrated: !!page.scaleCalibrated,
    scaleSummary: page.scaleCalibSummary || null,
    zones,
    boundary,
  };
}

export function buildPlanFromShareBundle(bundle) {
  if (!bundle) return null;
  const sheet = bundle.sheet || {};
  const page = bundle.pages?.["1"] || bundle.pages?.[1] || Object.values(bundle.pages || {})[0];
  return buildPlanFromPage(page, {
    sheetId: sheet.id,
    sheetName: sheet.name || sheet.id,
    projectId: bundle.projectId || "master",
    drawingFile: sheet.file || null,
  });
}

export async function loadStudioDesigns() {
  const designs = [];
  try {
    const db = await openIdb();
    const rows = await idbGetAll(db);
    for (const row of rows) {
      if (!row?.id || typeof row.payload !== "string") continue;
      let page;
      try {
        page = JSON.parse(row.payload);
      } catch {
        continue;
      }
      const zones = (page.objects || []).filter((o) => o.objectType === "zone");
      if (!zones.length) continue;
      const parsed = parseDesignKey(row.id);
      designs.push({
        key: row.id,
        ...parsed,
        zoneCount: zones.length,
        page,
      });
    }
  } catch (err) {
    console.warn("IndexedDB load failed", err);
  }
  return designs;
}

export async function loadDefaultPlanBundles() {
  const urls = [
    "/backups/kushita-2-recovery.json",
    "/exports/renewal-日下②-復元用.json",
  ];
  const out = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const bundle = await res.json();
      const plan = buildPlanFromShareBundle(bundle);
      if (plan?.zones?.length) out.push({ source: url, bundle, plan });
    } catch {
      /* skip */
    }
  }
  return out;
}

function parseDesignKey(id) {
  // master-日下②-p1
  const m = String(id).match(/^(.*?)-(.*)-p(\d+)$/);
  if (!m) return { projectId: "master", sheetId: id, page: 1 };
  return { projectId: m[1], sheetId: m[2], page: Number(m[3]) || 1 };
}

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("renewal-studio", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("designs")) {
        db.createObjectStore("designs", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("designs", "readonly");
    const req = tx.objectStore("designs").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function polygonToCanvasPoints(group, poly) {
  const pts = poly.points || [];
  const offset = poly.pathOffset || { x: 0, y: 0 };
  const local = pts.map((p) => ({
    x: (p.x - offset.x) * (poly.scaleX || 1) + (poly.left || 0),
    y: (p.y - offset.y) * (poly.scaleY || 1) + (poly.top || 0),
  }));

  const angle = ((group.angle || 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const sx = group.scaleX || 1;
  const sy = group.scaleY || 1;
  const ox = group.originX === "center" ? 0 : (group.width || 0) / 2;
  const oy = group.originY === "center" ? 0 : (group.height || 0) / 2;

  return local.map((p) => {
    const lx = (p.x - ox) * sx;
    const ly = (p.y - oy) * sy;
    return {
      x: (group.left || 0) + lx * cos - ly * sin,
      y: (group.top || 0) + lx * sin + ly * cos,
    };
  });
}

function canvasPointToPlanMm(pt, transform, mmPerImagePx) {
  const sx = transform.scaleX || 1;
  const sy = transform.scaleY || 1;
  const imgX = (pt.x - (transform.left || 0)) / sx;
  const imgY = (pt.y - (transform.top || 0)) / sy;
  const mm = mmPerImagePx || 1;
  return { x: imgX * mm, y: imgY * mm };
}

function bboxOf(points) {
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

function polygonAreaMm2(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

function parseSizeFromLabel(zoneGroup) {
  const texts = [];
  const walk = (objs) => {
    (objs || []).forEach((o) => {
      if (o.type === "text" || o.type === "i-text") texts.push(o.text || "");
      if (o.objects) walk(o.objects);
    });
  };
  walk(zoneGroup.objects);
  const blob = texts.join("\n");
  const m = blob.match(/横\s*([\d.]+)\s*m.*?縦\s*([\d.]+)\s*m/);
  if (!m) return null;
  return {
    widthMm: Math.round(Number(m[1]) * 1000),
    depthMm: Math.round(Number(m[2]) * 1000),
  };
}

export function machineFitsZone(machine, zone, rotated) {
  if (!machine || !zone) return { rank: "none", label: "区画未選択", leftover: null };
  return fitStatus(machine, zone, rotated);
}

export function planBounds(plan) {
  const pts = [];
  (plan?.zones || []).forEach((z) => pts.push(...z.pointsMm));
  (plan?.boundary || []).forEach((p) => pts.push(p));
  if (!pts.length) return { minX: 0, minY: 0, maxX: 10000, maxY: 10000, width: 10000, height: 10000 };
  return bboxOf(pts);
}

export { FIT_MACHINES, formatMm, formatPrice, occupiedSize };
