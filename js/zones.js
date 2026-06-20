import { snapPoint, hexToRgba, isInsideWorkBoundary } from "./draw-tools.js";
import {
  formatZoneSizeText,
  formatEdgeLength,
  getZoneCanvasPoints,
  computeZoneEdgeLengths,
} from "./drawing-scale.js";

import { loadCustomZonePresets } from "./zone-custom-presets.js";
import { refreshZoneMarkBadge, upgradeZoneMarkBadge } from "./zone-marks.js";

/** 区画の塗り透明度（固定・UIから変更不可） */
export const ZONE_FILL_OPACITY = 0.2;

export const ZONE_PRESETS = [
  { id: "fw", name: "FWエリア", color: "#f59e0b", desc: "フリーウェイト・ラック等の大枠" },
  { id: "studio", name: "スタジオエリア", color: "#8b5cf6", desc: "スタジオ・レッスン系の区画" },
  { id: "cardio", name: "有酸素エリア", color: "#ec4899", desc: "ランニング・バイク等のゾーン" },
  { id: "stretch", name: "ストレッチエリア", color: "#14b8a6", desc: "ストレッチ・ヨガ系スペース" },
  { id: "circuit", name: "サーキットエリア", color: "#22c55e", desc: "サーキット・トレーニング動線" },
  { id: "machine", name: "マシンエリア", color: "#0ea5e9", desc: "マシン配置ゾーン" },
  { id: "women", name: "女性専用", color: "#d946ef", desc: "女性専用フロア・区画" },
  { id: "entrance", name: "エントランス", color: "#3b82f6", desc: "入口・受付・動線の起点" },
  { id: "locker", name: "更衣室・水回り", color: "#06b6d4", desc: "更衣室・シャワー・トイレ周辺" },
  { id: "staff", name: "スタッフ", color: "#84cc16", desc: "スタッフ専用・事務スペース" },
  { id: "storage", name: "物置・バック", color: "#78716c", desc: "倉庫・バックヤード" },
  { id: "other", name: "その他区画", color: "#94a3b8", desc: "上記以外・仮置き・検討中" },
];

export function getAllZonePresets() {
  return [...ZONE_PRESETS, ...loadCustomZonePresets()];
}

export const ZONE_SERIALIZE_PROPS = [
  "objectType",
  "zoneName",
  "zoneMemo",
  "zoneColor",
  "zonePresetId",
  "zoneInstanceId",
  "zoneShowEdgeLengths",
  "zoneShowBBoxDims",
  "zoneShowTsubo",
  "zoneMarkRole",
  "zoneMarkLabel",
  "zoneMarkIndex",
  "zoneMarkLinkIndex",
];

export function getZoneStyle(color) {
  return {
    fill: hexToRgba(color, ZONE_FILL_OPACITY),
    stroke: color,
    strokeWidth: 2,
    guideStroke: color,
  };
}

function rgbaToHex(str) {
  if (typeof str !== "string") return null;
  if (str.startsWith("#")) return str;
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function resolveSolidZoneColor(group) {
  if (group.zoneColor?.startsWith?.("#")) return group.zoneColor;
  const poly = group._objects?.[0];
  const fromFill = rgbaToHex(poly?.fill);
  if (fromFill) return fromFill;
  if (group.zonePresetId) {
    const preset = getAllZonePresets().find((p) => p.id === group.zonePresetId);
    if (preset?.color) return preset.color;
  }
  return "#94a3b8";
}

function polygonCentroid(points) {
  let x = 0;
  let y = 0;
  points.forEach((p) => {
    x += p.x;
    y += p.y;
  });
  return { x: x / points.length, y: y / points.length };
}

function createDimMarker(kind) {
  return new fabric.Text("", {
    fontSize: 10,
    fill: "#1e3a8a",
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.92)",
    _zoneDim: kind,
    objectCaching: false,
    selectable: false,
    evented: false,
    originX: "center",
    originY: "center",
  });
}

function hideLegacyBBoxDims(group) {
  group._objects?.forEach((o) => {
    if (o._zoneDim === "width" || o._zoneDim === "depth") {
      o.set({ text: "", visible: false });
    }
  });
}

function syncEdgeDimMarkers(group, count) {
  let markers = group._objects?.filter((o) => o._zoneDim === "edge") ?? [];
  while (markers.length < count) {
    group.add(createDimMarker("edge"));
    markers = group._objects?.filter((o) => o._zoneDim === "edge") ?? [];
  }
  markers.forEach((marker, i) => {
    if (i >= count) marker.set({ text: "", visible: false });
  });
  return markers.slice(0, count);
}

function canvasPointToGroupLocal(group, pt) {
  const inv = fabric.util.invertTransform(group.calcTransformMatrix());
  return fabric.util.transformPoint(new fabric.Point(pt.x, pt.y), inv);
}

export function updateZoneEdgeLengths(group, drawingImage, mmPerImagePx) {
  const poly = group._objects?.[0];
  if (!poly?.points?.length) return;

  hideLegacyBBoxDims(group);

  if (!mmPerImagePx || !drawingImage) {
    group._objects?.forEach((o) => {
      if (o._zoneDim === "edge") o.set({ text: "", visible: false });
    });
    group.dirty = true;
    return;
  }

  const edges = computeZoneEdgeLengths(group, drawingImage, mmPerImagePx);
  const markers = syncEdgeDimMarkers(group, edges.length);
  const groupAngle = group.angle || 0;
  const outwardPad = 12 / Math.max(group.scaleX || 1, group.scaleY || 1, 0.25);
  const showEdges = group.zoneShowEdgeLengths !== false;

  edges.forEach((edge, i) => {
    const marker = markers[i];
    if (!marker) return;

    const outward = {
      x: edge.midCanvas.x + edge.outwardCanvas.x * outwardPad,
      y: edge.midCanvas.y + edge.outwardCanvas.y * outwardPad,
    };
    const local = canvasPointToGroupLocal(group, outward);

    marker.set({
      text: showEdges && edge.lengthM != null ? `${edge.lengthM.toFixed(2)}m` : "",
      left: local.x,
      top: local.y,
      angle: edge.angleDeg - groupAngle,
      visible: showEdges && edge.lengthM != null,
    });
  });
  if (typeof group.triggerLayout === "function") {
    group.triggerLayout();
  }
  group.setCoords();
  group.dirty = true;
}

export function updateZoneDimensions(group, metrics, drawingImage, mmPerImagePx) {
  updateZoneEdgeLengths(group, drawingImage, mmPerImagePx);
}

export function ensureZoneDimensionMarkers(group) {
  if (group.objectType !== "zone" || group.type !== "group") return group;
  const pts = getZoneCanvasPoints(group);
  const edgeCount = Math.max(pts.length, 3);
  syncEdgeDimMarkers(group, edgeCount);
  hideLegacyBBoxDims(group);
  group.dirty = true;
  return group;
}

export function refreshZoneDisplay(group, metrics, drawingImage, mmPerImagePx) {
  updateZoneLabel(group, metrics);
  updateZoneEdgeLengths(group, drawingImage, mmPerImagePx);
  refreshZoneMarkBadge(group);
}

function buildZoneLabelText(name, metrics, opts = {}) {
  const sizeLine = formatZoneSizeText(metrics, opts);
  if (sizeLine) return `${name}\n${sizeLine}`;
  return name;
}

const ZONE_LABEL_FONT_SIZE = 8;

export function createZoneGroup(points, preset, memo = "", metrics = null) {
  const style = getZoneStyle(preset.color);
  const c = polygonCentroid(points);

  const poly = new fabric.Polygon(
    points.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
    {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeLineJoin: "miter",
      objectCaching: false,
    }
  );

  const anchor = polygonBBoxCenter(poly);
  const labelW = Math.max(64, Math.min(130, (poly.width || 140) * 0.75));
  const labelText = buildZoneLabelText(preset.name, metrics);
  const label = new fabric.Textbox(labelText, {
    width: labelW,
    left: anchor.x,
    top: anchor.y,
    fontSize: ZONE_LABEL_FONT_SIZE,
    fill: "#0f172a",
    fontWeight: "700",
    textAlign: "center",
    originX: "center",
    originY: "center",
    splitByGrapheme: true,
    lineHeight: 1.1,
    backgroundColor: "#ffffff",
    objectCaching: false,
  });

  const dimMarkers = [];
  for (let i = 0; i < points.length; i++) {
    dimMarkers.push(createDimMarker("edge"));
  }

  const group = new fabric.Group([poly, label, ...dimMarkers], {
    left: c.x,
    top: c.y,
    originX: "center",
    originY: "center",
    objectCaching: false,
    objectType: "zone",
    zoneName: preset.name,
    zoneMemo: memo || "",
    zoneColor: preset.color,
    zonePresetId: preset.id,
    zoneInstanceId: crypto.randomUUID(),
    zoneShowEdgeLengths: false,
    zoneShowBBoxDims: false,
    zoneShowTsubo: true,
    hoverCursor: "pointer",
    subTargetCheck: false,
  });

  group.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true });
  if (metrics) group._zoneMetrics = metrics;
  if (typeof group.triggerLayout === "function") group.triggerLayout();
  return group;
}

/** キャンバス座標の頂点配列で区画ポリゴンを更新 */
export function setZoneCanvasPoints(zone, canvasPoints) {
  if (!zone || canvasPoints.length < 3) return zone;
  const poly = zone._objects?.[0];
  if (!poly || poly.type !== "polygon") return zone;

  const c = polygonCentroid(canvasPoints);
  const localPoints = canvasPoints.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));

  zone.set({
    left: c.x,
    top: c.y,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    skewY: 0,
  });
  poly.set({ points: localPoints });
  if (typeof poly._setPositionDimensions === "function") {
    poly._setPositionDimensions({});
  }
  if (typeof zone.triggerLayout === "function") zone.triggerLayout();
  updateZoneLabel(zone, zone._zoneMetrics);
  zone.setCoords();
  clearZoneRenderCache(zone);
  return zone;
}

/** 変形・リサイズ後のキャッシュ残骸を防ぐ */
export function clearZoneRenderCache(zone) {
  if (!zone) return;
  zone.dirty = true;
  if (typeof zone._clearCache === "function") zone._clearCache();
  zone._objects?.forEach((o) => {
    o.dirty = true;
    if (typeof o._clearCache === "function") o._clearCache();
  });
}

/** ハンドル変形をポリゴン頂点へ焼き込み、scale/angle をリセット */
export function normalizeZoneAfterResize(zone) {
  if (zone?.objectType !== "zone" || zone.type !== "group") return zone;
  const sx = zone.scaleX ?? 1;
  const sy = zone.scaleY ?? 1;
  const needsBake =
    Math.abs(sx - 1) > 0.0001 ||
    Math.abs(sy - 1) > 0.0001 ||
    Math.abs(zone.skewX || 0) > 0.0001 ||
    Math.abs(zone.skewY || 0) > 0.0001 ||
    Math.abs(zone.angle || 0) > 0.0001;
  if (needsBake) {
    const pts = getZoneCanvasPoints(zone);
    if (pts.length >= 3) setZoneCanvasPoints(zone, pts.map((p) => ({ x: p.x, y: p.y })));
  }
  clearZoneRenderCache(zone);
  return zone;
}

/** 頂点編集のガイド線・ハンドルが残った場合に除去 */
export function purgeVertexEditOverlays(canvas) {
  if (!canvas) return;
  let removed = false;
  canvas.getObjects().forEach((o) => {
    if (o._zoneVertexEdit) {
      canvas.remove(o);
      removed = true;
    }
  });
  if (removed) canvas.requestRenderAll();
}

/**
 * 区画の角をドラッグして変形 — cleanup(restoreOriginal?) で終了
 */
export function enableZoneVertexEdit(canvas, zone, opts = {}) {
  const { getSnapPtr, onPointsChange } = opts;
  const stroke = zone.zoneColor || "#3b82f6";
  let canvasPoints = getZoneCanvasPoints(zone).map((p) => ({ x: p.x, y: p.y }));
  const originalPoints = canvasPoints.map((p) => ({ x: p.x, y: p.y }));
  let handles = [];
  let edges = [];
  const poly = zone._objects?.[0];
  const polyEditBefore = poly
    ? { strokeDashArray: poly.strokeDashArray, strokeWidth: poly.strokeWidth }
    : null;

  zone.set({ selectable: false, evented: false, opacity: 1, hasControls: false, hasBorders: false });
  poly?.set({ strokeDashArray: [8, 4], strokeWidth: 3 });

  const suppressed = [];
  canvas.getObjects().forEach((o) => {
    if (o._zoneVertexEdit || o === zone) return;
    suppressed.push({ o, evented: o.evented, selectable: o.selectable });
    o.set({ evented: false, selectable: false });
  });

  function snapPtr(raw, e) {
    return getSnapPtr ? getSnapPtr(raw, e) : { x: raw.x, y: raw.y };
  }

  function syncEdges() {
    edges.forEach((line, i) => {
      const a = canvasPoints[i];
      const b = canvasPoints[(i + 1) % canvasPoints.length];
      line.set({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    });
  }

  function rebuildHandles() {
    const r = Math.max(12, 10 / Math.max(canvas.getZoom() || 1, 0.25));
    handles.forEach((h) => canvas.remove(h));
    handles = canvasPoints.map((pt, i) => {
      const h = new fabric.Circle({
        left: pt.x,
        top: pt.y,
        radius: r,
        fill: "#ffffff",
        stroke,
        strokeWidth: 3,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        objectCaching: false,
        _zoneVertexEdit: true,
        _vertexIndex: i,
        _skipHistory: true,
      });
      canvas.add(h);
      return h;
    });
    handles.forEach((h) => h.bringToFront());
  }

  function rebuildEdges() {
    edges.forEach((l) => canvas.remove(l));
    edges = [];
    for (let i = 0; i < canvasPoints.length; i++) {
      const a = canvasPoints[i];
      const b = canvasPoints[(i + 1) % canvasPoints.length];
      const line = new fabric.Line([a.x, a.y, b.x, b.y], {
        stroke,
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        _zoneVertexEdit: true,
        _skipHistory: true,
      });
      edges.push(line);
      canvas.add(line);
    }
    edges.forEach((l) => l.bringToFront());
    handles.forEach((h) => h.bringToFront());
  }

  function applyPoints() {
    setZoneCanvasPoints(zone, canvasPoints);
    onPointsChange?.(canvasPoints);
  }

  let dragIndex = -1;
  const canvasWrapEl = canvas?.upperCanvasEl?.parentElement;

  function hitHandleIndex(ptr) {
    const zoom = canvas.getZoom() || 1;
    const hitPad = Math.max(18, 16 / zoom);
    for (let i = 0; i < canvasPoints.length; i++) {
      const p = canvasPoints[i];
      if (Math.hypot(ptr.x - p.x, ptr.y - p.y) <= hitPad) return i;
    }
    return -1;
  }

  function endDrag() {
    if (dragIndex < 0) return;
    dragIndex = -1;
    canvas.setCursor("grab");
    canvasWrapEl?.classList.remove("zone-vertex-dragging");
  }

  function onMouseDown(opt) {
    if (opt.e.button !== 0) return;
    const ptr = canvas.getPointer(opt.e);
    const idx = hitHandleIndex(ptr);
    if (idx < 0) return;
    dragIndex = idx;
    canvas.setCursor("grabbing");
    canvasWrapEl?.classList.add("zone-vertex-dragging");
    opt.e.preventDefault();
    opt.e.stopPropagation();
  }

  function onMouseMove(opt) {
    const ptr = canvas.getPointer(opt.e);
    if (dragIndex < 0) {
      canvas.setCursor(hitHandleIndex(ptr) >= 0 ? "grab" : "default");
      return;
    }
    const snapped = snapPtr(ptr, opt.e);
    canvasPoints[dragIndex] = { x: snapped.x, y: snapped.y };
    const h = handles[dragIndex];
    if (h) {
      h.set({ left: snapped.x, top: snapped.y });
      h.setCoords();
    }
    applyPoints();
    syncEdges();
    canvas.requestRenderAll();
  }

  function onMouseUp() {
    endDrag();
  }

  rebuildHandles();
  rebuildEdges();
  applyPoints();
  canvas.requestRenderAll();

  canvas.on("mouse:down", onMouseDown);
  canvas.on("mouse:move", onMouseMove);
  canvas.on("mouse:up", onMouseUp);
  document.addEventListener("mouseup", onMouseUp);

  return function cleanup(restoreOriginal = false) {
    canvas.off("mouse:down", onMouseDown);
    canvas.off("mouse:move", onMouseMove);
    canvas.off("mouse:up", onMouseUp);
    document.removeEventListener("mouseup", onMouseUp);
    endDrag();
    handles.forEach((h) => canvas.remove(h));
    edges.forEach((l) => canvas.remove(l));
    handles = [];
    edges = [];
    suppressed.forEach(({ o, evented, selectable }) => {
      o.set({ evented, selectable });
    });
    if (restoreOriginal) {
      canvasPoints = originalPoints.map((p) => ({ x: p.x, y: p.y }));
      setZoneCanvasPoints(zone, canvasPoints);
      onPointsChange?.(canvasPoints);
    }
    zone.set({ opacity: 1 });
    if (poly && polyEditBefore) {
      poly.set({
        strokeDashArray: polyEditBefore.strokeDashArray,
        strokeWidth: polyEditBefore.strokeWidth ?? 2,
      });
    }
    clearZoneRenderCache(zone);
    purgeVertexEditOverlays(canvas);
    canvas.requestRenderAll();
  };
}

function polygonBBoxCenter(poly) {
  const pts = poly?.points;
  if (!pts?.length) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function updateZoneLabel(group, metrics = undefined) {
  const label = group._objects?.find((o) => o.type === "textbox" && !o._zoneDim);
  const poly = group._objects?.[0];
  if (!label || !poly) return;
  const name = group.zoneName || "区画";
  const m = metrics !== undefined ? metrics : group._zoneMetrics ?? null;
  if (metrics !== undefined) group._zoneMetrics = metrics;
  const labelOpts = {
    showBBoxDims: group.zoneShowBBoxDims !== false,
    showTsubo: group.zoneShowTsubo !== false,
  };
  const anchor = polygonBBoxCenter(poly);
  const bboxW = poly.width || 120;
  const labelW = Math.max(64, Math.min(130, bboxW * 0.75));
  label.set({
    text: buildZoneLabelText(name, m, labelOpts),
    width: labelW,
    left: anchor.x,
    top: anchor.y,
    originX: "center",
    originY: "center",
    textAlign: "center",
    fontSize: ZONE_LABEL_FONT_SIZE,
  });
  group.dirty = true;
}

export function updateZoneColors(group, color) {
  const poly = group._objects?.[0];
  if (!poly) return;
  const style = getZoneStyle(color);
  poly.set({ fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth });
  group.set({ zoneColor: color, opacity: 1 });
  delete group.zoneOpacity;
  group.dirty = true;
}

export function upgradeZoneObject(obj) {
  if (!obj.zoneInstanceId) obj.set("zoneInstanceId", crypto.randomUUID());
  if (obj.objectType === "fillArea") {
    const color = rgbaToHex(obj.fill) || obj.stroke || "#94a3b8";
    const style = getZoneStyle(color);
    obj.set({
      objectType: "zone",
      zoneName: "区画",
      zoneMemo: "",
      zoneColor: color,
      zonePresetId: "other",
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      opacity: 1,
      hoverCursor: "pointer",
    });
    delete obj.zoneOpacity;
    return obj;
  }
  if (obj.objectType !== "zone" || obj.type !== "group") return obj;
  const poly = obj._objects?.[0];
  if (poly) {
    poly.set({ strokeLineJoin: "miter", strokeWidth: poly.strokeWidth || 2 });
  }
  const solidColor = resolveSolidZoneColor(obj);
  updateZoneColors(obj, solidColor);
  obj.set({ opacity: 1, objectCaching: false });
  obj._objects?.forEach((o) => o.set({ objectCaching: false }));
  delete obj.zoneOpacity;
  if (!obj._objects?.some((o) => o.type === "textbox" && !o._zoneDim)) {
    updateZoneLabel(obj);
  }
  ensureZoneDimensionMarkers(obj);
  upgradeZoneMarkBadge(obj);
  return obj;
}

function makeSegmentDimLabel(a, b, text) {
  return new fabric.Text(text, {
    left: (a.x + b.x) / 2,
    top: (a.y + b.y) / 2 - 8,
    fontSize: 11,
    fill: "#1e40af",
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.9)",
    originX: "center",
    originY: "bottom",
    selectable: false,
    evented: false,
    objectCaching: false,
    _zonePreview: true,
    _skipHistory: true,
  });
}

export function enableZoneDraw(canvas, getPreset, onDone, getMetrics, getSegmentMetrics, onDimPreview) {
  const points = [];
  let previewLines = [];
  let vertexDots = [];
  let rubberLine = null;
  let previewPoly = null;
  let liveDimLabel = null;
  const segmentDimLabels = [];
  let lastClickAt = 0;

  function closeScreenPx() {
    return 26 / (canvas.getZoom() || 1);
  }

  function isNearFirstPoint(raw, first) {
    const d = Math.hypot(raw.x - first.x, raw.y - first.y);
    return d < closeScreenPx();
  }

  function highlightCloseTarget() {
    if (vertexDots.length && points.length >= 3) {
      const preset = getPreset();
      const style = getZoneStyle(preset.color);
      vertexDots[0].set({
        width: 16,
        height: 16,
        fill: style.guideStroke,
        stroke: "#fff",
        strokeWidth: 3,
      });
    }
  }

  function resetCloseTarget() {
    if (vertexDots.length) {
      const preset = getPreset();
      const style = getZoneStyle(preset.color);
      vertexDots[0].set({
        width: 8,
        height: 8,
        fill: style.guideStroke,
        stroke: style.guideStroke,
        strokeWidth: 2,
      });
    }
  }

  function updateLiveDim(a, b) {
    const metrics = getSegmentMetrics?.(a, b) ?? null;
    onDimPreview?.(metrics);
    const text = formatEdgeLength(metrics);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (!liveDimLabel) {
      liveDimLabel = makeSegmentDimLabel(a, b, text);
      canvas.add(liveDimLabel);
    }
    liveDimLabel.set({ text, left: mx, top: my - 8 });
    canvas.requestRenderAll();
  }

  function clearLiveDim() {
    if (liveDimLabel) {
      canvas.remove(liveDimLabel);
      liveDimLabel = null;
    }
    onDimPreview?.(null);
  }

  const handler = (opt) => {
    const e = opt.e;
    const raw = canvas.getPointer(e);
    const ptr = snapPoint(raw, canvas, e);
    if (e.type === "mousedown" && e.button === 0 && !isInsideWorkBoundary(ptr)) return;
    const preset = getPreset();
    const style = getZoneStyle(preset.color);

    if (e.type === "mousemove" && points.length) {
      if (rubberLine) canvas.remove(rubberLine);
      const last = points[points.length - 1];
      rubberLine = new fabric.Line([last.x, last.y, ptr.x, ptr.y], {
        stroke: style.guideStroke,
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        _zonePreview: true,
        _skipHistory: true,
      });
      canvas.add(rubberLine);
      updateLiveDim(last, ptr);

      if (points.length >= 2) {
        if (previewPoly) canvas.remove(previewPoly);
        previewPoly = new fabric.Polygon(
          [...points, ptr].map((p) => ({ x: p.x, y: p.y })),
          {
            fill: style.fill,
            stroke: style.stroke,
            strokeWidth: 2,
            strokeLineJoin: "miter",
            selectable: false,
            evented: false,
            _zonePreview: true,
            _skipHistory: true,
          }
        );
        canvas.add(previewPoly);
      }
      canvas.requestRenderAll();
    }

    if (e.type !== "mouseup" && e.type !== "mousedown") return;

    if (e.type === "mousedown" && e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      cancelDraw();
      return;
    }

    if (e.type === "mousedown" && e.button === 0) {
      const now = Date.now();
      const isDouble = now - lastClickAt < 350;
      lastClickAt = now;

      if (points.length >= 3 && (isDouble || isNearFirstPoint(raw, points[0]))) {
        finish();
        return;
      }

      points.push(ptr);
      const dot = new fabric.Rect({
        left: ptr.x,
        top: ptr.y,
        width: points.length === 1 ? 8 : 6,
        height: points.length === 1 ? 8 : 6,
        fill: points.length === 1 ? style.guideStroke : "#fff",
        stroke: style.guideStroke,
        strokeWidth: 2,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        _zonePreview: true,
        _skipHistory: true,
      });
      vertexDots.push(dot);
      canvas.add(dot);

      if (points.length > 1) {
        const prev = points[points.length - 2];
        const line = new fabric.Line([prev.x, prev.y, ptr.x, ptr.y], {
          stroke: style.guideStroke,
          strokeWidth: 2,
          selectable: false,
          evented: false,
          _zonePreview: true,
          _skipHistory: true,
        });
        previewLines.push(line);
        canvas.add(line);

        const segLabel = makeSegmentDimLabel(prev, ptr, formatEdgeLength(getSegmentMetrics?.(prev, ptr)));
        segmentDimLabels.push(segLabel);
        canvas.add(segLabel);
      }
      clearLiveDim();
      if (points.length >= 3) highlightCloseTarget();
      canvas.requestRenderAll();
    }
  };

  const dblHandler = (opt) => {
    if (opt.e?.button !== 0) return;
    if (points.length >= 3) {
      opt.e.preventDefault?.();
      finish();
    }
  };

  const keyHandler = (e) => {
    if (e.key === "Enter" && points.length >= 3) {
      e.preventDefault();
      finish();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelDraw();
    }
    if (e.key === "Backspace" && points.length) {
      e.preventDefault();
      const lastDot = vertexDots.pop();
      if (lastDot) canvas.remove(lastDot);
      if (previewLines.length) {
        const lastLine = previewLines.pop();
        canvas.remove(lastLine);
      }
      if (segmentDimLabels.length) {
        const lastSeg = segmentDimLabels.pop();
        canvas.remove(lastSeg);
      }
      points.pop();
      if (rubberLine) {
        canvas.remove(rubberLine);
        rubberLine = null;
      }
      if (previewPoly) {
        canvas.remove(previewPoly);
        previewPoly = null;
      }
      clearLiveDim();
      if (points.length >= 3) highlightCloseTarget();
      else resetCloseTarget();
      canvas.requestRenderAll();
    }
  };

  function cancelDraw() {
    cleanup();
    onDone?.(null);
  }

  function cleanup() {
    canvas.off("mouse:down", handler);
    canvas.off("mouse:move", handler);
    canvas.off("mouse:dblclick", dblHandler);
    document.removeEventListener("keydown", keyHandler);
    [...previewLines, ...vertexDots, ...segmentDimLabels, rubberLine, previewPoly, liveDimLabel]
      .filter(Boolean)
      .forEach((o) => canvas.remove(o));
    previewLines = [];
    vertexDots = [];
    segmentDimLabels.length = 0;
    rubberLine = null;
    previewPoly = null;
    liveDimLabel = null;
    onDimPreview?.(null);
    points.length = 0;
    canvas.requestRenderAll();
  }

  function finish() {
    if (points.length < 3) return;
    resetCloseTarget();
    const preset = getPreset();
    const metrics = getMetrics?.([...points]) ?? null;
    const zone = createZoneGroup([...points], preset, "", metrics);
    zone._skipHistory = true;
    cleanup();
    canvas.add(zone);
    canvas.setActiveObject(zone);
    onDone?.(zone);
  }

  canvas.on("mouse:down", handler);
  canvas.on("mouse:move", handler);
  canvas.on("mouse:dblclick", dblHandler);
  document.addEventListener("keydown", keyHandler);

  return cleanup;
}

const CALIB_STYLE = {
  fill: "rgba(245,158,11,0.2)",
  stroke: "#f59e0b",
  guideStroke: "#f59e0b",
};

/** グループ外に漏れた寸法ラベル（削除・変形の残骸）を除去 */
export function purgeOrphanZoneDimensions(canvas) {
  if (!canvas) return;
  let removed = false;
  canvas.getObjects().forEach((o) => {
    if (o._zoneDim && o.objectType !== "zone") {
      canvas.remove(o);
      removed = true;
    }
  });
  if (removed) canvas.requestRenderAll();
}

/** 採寸・区画の途中プレビューをすべて除去 */
export function purgeCanvasPreviews(canvas) {
  if (!canvas) return;
  canvas
    .getObjects()
    .filter((o) => o._scalePreview || o._zonePreview)
    .forEach((o) => canvas.remove(o));
  purgeOrphanZoneDimensions(canvas);
  canvas.requestRenderAll();
}

/** 初期測定用 — 角クリックで敷地全体を囲む（区画は作らない） */
export function enableCalibPolygonDraw(canvas, onPointsDone, opts = {}) {
  const { isClickAllowed } = opts;
  const points = [];
  let previewLines = [];
  let vertexDots = [];
  let rubberLine = null;
  let previewPoly = null;
  let lastClickAt = 0;

  function closeScreenPx() {
    return 26 / (canvas.getZoom() || 1);
  }

  function isNearFirstPoint(raw, first) {
    return Math.hypot(raw.x - first.x, raw.y - first.y) < closeScreenPx();
  }

  function highlightCloseTarget() {
    if (vertexDots.length && points.length >= 3) {
      vertexDots[0].set({
        width: 16,
        height: 16,
        fill: CALIB_STYLE.guideStroke,
        stroke: "#fff",
        strokeWidth: 3,
      });
    }
  }

  function resetCloseTarget() {
    if (vertexDots.length) {
      vertexDots[0].set({
        width: 8,
        height: 8,
        fill: CALIB_STYLE.guideStroke,
        stroke: CALIB_STYLE.guideStroke,
        strokeWidth: 2,
      });
    }
  }

  const handler = (opt) => {
    const e = opt.e;
    const raw = canvas.getPointer(e);
    const ptr = snapPoint(raw, canvas, e);

    if (e.type === "mousemove" && points.length) {
      if (isClickAllowed && !isClickAllowed(ptr)) {
        if (rubberLine) {
          canvas.remove(rubberLine);
          rubberLine = null;
        }
        if (previewPoly) {
          canvas.remove(previewPoly);
          previewPoly = null;
        }
        canvas.requestRenderAll();
        return;
      }
      if (rubberLine) canvas.remove(rubberLine);
      const last = points[points.length - 1];
      rubberLine = new fabric.Line([last.x, last.y, ptr.x, ptr.y], {
        stroke: CALIB_STYLE.guideStroke,
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        _scalePreview: true,
        _skipHistory: true,
      });
      canvas.add(rubberLine);

      if (points.length >= 2) {
        if (previewPoly) canvas.remove(previewPoly);
        previewPoly = new fabric.Polygon(
          [...points, ptr].map((p) => ({ x: p.x, y: p.y })),
          {
            fill: CALIB_STYLE.fill,
            stroke: CALIB_STYLE.stroke,
            strokeWidth: 2,
            selectable: false,
            evented: false,
            _scalePreview: true,
            _skipHistory: true,
          }
        );
        canvas.add(previewPoly);
      }
      canvas.requestRenderAll();
    }

    if (e.type !== "mouseup" && e.type !== "mousedown") return;

    if (e.type === "mousedown" && e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      cancelDraw();
      return;
    }

    if (e.type === "mousedown" && e.button === 0) {
      if (isClickAllowed && !isClickAllowed(ptr)) return;

      const now = Date.now();
      const isDouble = now - lastClickAt < 350;
      lastClickAt = now;

      if (points.length >= 3 && (isDouble || isNearFirstPoint(raw, points[0]))) {
        finish();
        return;
      }

      points.push(ptr);
      const dot = new fabric.Rect({
        left: ptr.x,
        top: ptr.y,
        width: points.length === 1 ? 8 : 6,
        height: points.length === 1 ? 8 : 6,
        fill: points.length === 1 ? CALIB_STYLE.guideStroke : "#fff",
        stroke: CALIB_STYLE.guideStroke,
        strokeWidth: 2,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        _scalePreview: true,
        _skipHistory: true,
      });
      vertexDots.push(dot);
      canvas.add(dot);

      if (points.length > 1) {
        const prev = points[points.length - 2];
        const line = new fabric.Line([prev.x, prev.y, ptr.x, ptr.y], {
          stroke: CALIB_STYLE.guideStroke,
          strokeWidth: 2,
          selectable: false,
          evented: false,
          _scalePreview: true,
          _skipHistory: true,
        });
        previewLines.push(line);
        canvas.add(line);
      }
      if (points.length >= 3) highlightCloseTarget();
      canvas.requestRenderAll();
    }
  };

  const dblHandler = (opt) => {
    if (opt.e?.button !== 0) return;
    if (points.length >= 3) {
      opt.e.preventDefault?.();
      finish();
    }
  };

  const keyHandler = (e) => {
    if (e.key === "Enter" && points.length >= 3) {
      e.preventDefault();
      finish();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelDraw();
    }
    if (e.key === "Backspace" && points.length) {
      e.preventDefault();
      const lastDot = vertexDots.pop();
      if (lastDot) canvas.remove(lastDot);
      if (previewLines.length) canvas.remove(previewLines.pop());
      points.pop();
      if (rubberLine) {
        canvas.remove(rubberLine);
        rubberLine = null;
      }
      if (previewPoly) {
        canvas.remove(previewPoly);
        previewPoly = null;
      }
      if (points.length >= 3) highlightCloseTarget();
      else resetCloseTarget();
      canvas.requestRenderAll();
    }
  };

  function cancelDraw() {
    cleanup();
    onPointsDone?.(null);
  }

  function cleanup() {
    canvas.off("mouse:down", handler);
    canvas.off("mouse:move", handler);
    canvas.off("mouse:dblclick", dblHandler);
    document.removeEventListener("keydown", keyHandler);
    [...previewLines, ...vertexDots, rubberLine, previewPoly]
      .filter(Boolean)
      .forEach((o) => canvas.remove(o));
    previewLines = [];
    vertexDots = [];
    rubberLine = null;
    previewPoly = null;
    points.length = 0;
    canvas.requestRenderAll();
  }

  function finish() {
    if (points.length < 3) return;
    resetCloseTarget();
    const donePoints = [...points];
    cleanup();
    onPointsDone?.(donePoints);
  }

  canvas.on("mouse:down", handler);
  canvas.on("mouse:move", handler);
  canvas.on("mouse:dblclick", dblHandler);
  document.addEventListener("keydown", keyHandler);

  return cleanup;
}

/** 途中で残った区画プレビューを除去 */
export function removeOrphanZonePreviews(canvas) {
  canvas.getObjects()
    .filter((o) => o._zonePreview)
    .forEach((o) => canvas.remove(o));
  canvas.requestRenderAll();
}
