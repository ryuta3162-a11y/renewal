import { snapPoint, hexToRgba } from "./draw-tools.js";
import { formatZoneSizeText, formatSegmentDimsAlways } from "./drawing-scale.js";

import { loadCustomZonePresets } from "./zone-custom-presets.js";

export const ZONE_PRESETS = [
  { id: "fw", name: "FWエリア", color: "#f59e0b", opacity: 0.3, desc: "フリーウェイト・ラック等の大枠" },
  { id: "studio", name: "スタジオエリア", color: "#8b5cf6", opacity: 0.3, desc: "スタジオ・レッスン系の区画" },
  { id: "cardio", name: "有酸素エリア", color: "#ec4899", opacity: 0.28, desc: "ランニング・バイク等のゾーン" },
  { id: "stretch", name: "ストレッチエリア", color: "#14b8a6", opacity: 0.28, desc: "ストレッチ・ヨガ系スペース" },
  { id: "entrance", name: "エントランス", color: "#3b82f6", opacity: 0.25, desc: "入口・受付・動線の起点" },
  { id: "locker", name: "更衣室・水回り", color: "#06b6d4", opacity: 0.28, desc: "更衣室・シャワー・トイレ周辺" },
  { id: "online-lesson", name: "⑩ オンラインレッスンについて", color: "#e11d48", opacity: 0.22, desc: "JOYFIT Online Lesson の導線・店舗との関係", hasGuide: true },
  { id: "other", name: "その他区画", color: "#94a3b8", opacity: 0.25, desc: "上記以外・仮置き・検討中" },
];

export function getAllZonePresets() {
  return [...ZONE_PRESETS, ...loadCustomZonePresets()];
}

export const ZONE_SERIALIZE_PROPS = [
  "objectType",
  "zoneName",
  "zoneMemo",
  "zoneColor",
  "zoneOpacity",
  "zonePresetId",
  "zoneInstanceId",
];

export function getZoneStyle(color, opacity) {
  return {
    fill: hexToRgba(color, opacity),
    stroke: color,
    strokeWidth: 2,
    guideStroke: color,
  };
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

function localBBoxFromPolyPoints(points) {
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
  return { minX, minY, maxX, maxY };
}

function createDimMarker(kind) {
  return new fabric.Text("", {
    fontSize: 11,
    fill: "#1e40af",
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.88)",
    _zoneDim: kind,
    objectCaching: false,
    selectable: false,
    evented: false,
  });
}

export function updateZoneDimensions(group, metrics) {
  const poly = group._objects?.[0];
  if (!poly?.points) return;
  const dimW = group._objects?.find((o) => o._zoneDim === "width");
  const dimD = group._objects?.find((o) => o._zoneDim === "depth");
  if (!dimW || !dimD) return;

  if (!metrics) {
    dimW.set({ text: "", visible: false });
    dimD.set({ text: "", visible: false });
    group.dirty = true;
    return;
  }

  const bbox = localBBoxFromPolyPoints(poly.points);
  const pad = 14;

  dimW.set({
    text: `横 ${metrics.widthM.toFixed(1)}m`,
    left: (bbox.minX + bbox.maxX) / 2,
    top: bbox.maxY + pad,
    originX: "center",
    originY: "top",
    visible: true,
  });
  dimD.set({
    text: `縦 ${metrics.depthM.toFixed(1)}m`,
    left: bbox.minX - pad,
    top: (bbox.minY + bbox.maxY) / 2,
    originX: "right",
    originY: "center",
    angle: -90,
    visible: true,
  });
  group.dirty = true;
}

export function ensureZoneDimensionMarkers(group) {
  if (group.objectType !== "zone" || group.type !== "group") return group;
  if (group._objects?.some((o) => o._zoneDim)) return group;
  group.add(createDimMarker("width"));
  group.add(createDimMarker("depth"));
  group.dirty = true;
  return group;
}

export function refreshZoneDisplay(group, metrics) {
  updateZoneLabel(group, metrics);
  updateZoneDimensions(group, metrics);
}

function buildZoneLabelText(name, metrics) {
  const sizeLine = formatZoneSizeText(metrics);
  if (sizeLine) return `${name}\n${sizeLine}`;
  return name;
}

function fitZoneLabel(name, metrics, maxW) {
  const text = buildZoneLabelText(name, metrics);
  for (let fs = 13; fs >= 7; fs--) {
    const tb = new fabric.Textbox(text, {
      width: maxW,
      fontSize: fs,
      fontWeight: "700",
      lineHeight: 1.12,
      splitByGrapheme: true,
    });
    if (tb.calcTextHeight() <= 64) return fs;
  }
  return 7;
}

export function createZoneGroup(points, preset, memo = "", metrics = null) {
  const style = getZoneStyle(preset.color, preset.opacity);
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

  const labelW = Math.max(72, Math.min(200, poly.width || 120));
  const labelText = buildZoneLabelText(preset.name, metrics);
  const label = new fabric.Textbox(labelText, {
    width: labelW,
    fontSize: fitZoneLabel(preset.name, metrics, labelW),
    fill: "#0f172a",
    fontWeight: "700",
    textAlign: "center",
    originX: "center",
    originY: "center",
    splitByGrapheme: true,
    lineHeight: 1.1,
    backgroundColor: "rgba(255,255,255,0.75)",
    objectCaching: false,
  });

  const dimW = createDimMarker("width");
  const dimD = createDimMarker("depth");

  const group = new fabric.Group([poly, label, dimW, dimD], {
    left: c.x,
    top: c.y,
    originX: "center",
    originY: "center",
    objectType: "zone",
    zoneName: preset.name,
    zoneMemo: memo || "",
    zoneColor: preset.color,
    zoneOpacity: preset.opacity,
    zonePresetId: preset.id,
    zoneInstanceId: crypto.randomUUID(),
    hoverCursor: "pointer",
    subTargetCheck: false,
  });

  updateZoneDimensions(group, metrics);
  return group;
}

/** キャンバス座標の頂点配列で区画形状を更新（scale/angle を 1/0 に正規化） */
export function updateZonePointsInPlace(zone, canvasPoints) {
  if (!zone || canvasPoints.length < 3) return;
  const poly = zone._objects?.[0];
  if (!poly || poly.type !== "polygon") return;

  const c = polygonCentroid(canvasPoints);
  const localPoints = canvasPoints.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));

  poly.set({ points: localPoints });
  if (typeof poly._setPositionDimensions === "function") {
    poly._setPositionDimensions({});
  }
  poly.setCoords();
  poly.dirty = true;

  zone.set({
    left: c.x,
    top: c.y,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    skewX: 0,
    skewY: 0,
  });

  if (typeof zone.triggerLayout === "function") {
    zone.triggerLayout();
  } else if (typeof zone._calcBounds === "function") {
    zone._calcBounds();
  }
  zone.setCoords();
  zone.dirty = true;
}

export function updateZoneLabel(group, metrics = undefined) {
  const label = group._objects?.find((o) => o.type === "textbox");
  const poly = group._objects?.[0];
  if (!label || !poly) return;
  const name = group.zoneName || "区画";
  const m = metrics !== undefined ? metrics : group._zoneMetrics ?? null;
  if (metrics !== undefined) group._zoneMetrics = metrics;
  const labelW = Math.max(72, Math.min(200, (poly.width || 120) * (group.scaleX || 1)));
  label.set({
    text: buildZoneLabelText(name, m),
    width: labelW,
    fontSize: fitZoneLabel(name, m, labelW),
  });
  group.dirty = true;
}

export function updateZoneColors(group, color, opacity) {
  const poly = group._objects?.[0];
  if (!poly) return;
  const style = getZoneStyle(color, opacity ?? group.zoneOpacity ?? 0.3);
  poly.set({ fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth });
  group.set({ zoneColor: color, zoneOpacity: opacity ?? group.zoneOpacity });
  group.dirty = true;
}

export function upgradeZoneObject(obj) {
  if (!obj.zoneInstanceId) obj.set("zoneInstanceId", crypto.randomUUID());
  if (obj.objectType === "fillArea") {
    obj.set({
      objectType: "zone",
      zoneName: "区画",
      zoneMemo: "",
      zoneColor: "#94a3b8",
      zoneOpacity: 0.25,
      zonePresetId: "other",
      stroke: obj.stroke || "#94a3b8",
      strokeWidth: 2,
      hoverCursor: "pointer",
    });
    return obj;
  }
  if (obj.objectType !== "zone" || obj.type !== "group") return obj;
  const poly = obj._objects?.[0];
  if (poly) {
    poly.set({ strokeLineJoin: "miter", strokeWidth: poly.strokeWidth || 2 });
  }
  if (!obj._objects?.some((o) => o.type === "textbox" && !o._zoneDim)) {
    updateZoneLabel(obj);
  }
  ensureZoneDimensionMarkers(obj);
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

  function updateLiveDim(a, b) {
    const metrics = getSegmentMetrics?.(a, b) ?? null;
    onDimPreview?.(metrics);
    const text = formatSegmentDimsAlways(metrics);
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
    const ptr = snapPoint(canvas.getPointer(e), canvas, e);
    const preset = getPreset();
    const style = getZoneStyle(preset.color, preset.opacity);

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
            opacity: 0.85,
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
      if (points.length >= 3) {
        const first = points[0];
        const closeDist = 14 / (canvas.getZoom() || 1);
        if (Math.hypot(ptr.x - first.x, ptr.y - first.y) < closeDist) {
          finish();
          return;
        }
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

        const segLabel = makeSegmentDimLabel(prev, ptr, formatSegmentDimsAlways(getSegmentMetrics?.(prev, ptr)));
        segmentDimLabels.push(segLabel);
        canvas.add(segLabel);
      }
      clearLiveDim();
      canvas.requestRenderAll();
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
    const preset = getPreset();
    const metrics = getMetrics?.([...points]) ?? null;
    const zone = createZoneGroup([...points], preset, "", metrics);
    cleanup();
    canvas.add(zone);
    canvas.setActiveObject(zone);
    onDone?.(zone);
  }

  canvas.on("mouse:down", handler);
  canvas.on("mouse:move", handler);
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
