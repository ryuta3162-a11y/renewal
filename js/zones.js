import { snapPoint, hexToRgba } from "./draw-tools.js";
import {
  formatZoneSizeText,
  formatEdgeLength,
  getZoneCanvasPoints,
  computeZoneEdgeLengths,
} from "./drawing-scale.js";

import { loadCustomZonePresets } from "./zone-custom-presets.js";

export const ZONE_PRESETS = [
  { id: "fw", name: "FWエリア", color: "#f59e0b", opacity: 0.3, desc: "フリーウェイト・ラック等の大枠" },
  { id: "studio", name: "スタジオエリア", color: "#8b5cf6", opacity: 0.3, desc: "スタジオ・レッスン系の区画" },
  { id: "cardio", name: "有酸素エリア", color: "#ec4899", opacity: 0.28, desc: "ランニング・バイク等のゾーン" },
  { id: "stretch", name: "ストレッチエリア", color: "#14b8a6", opacity: 0.28, desc: "ストレッチ・ヨガ系スペース" },
  { id: "entrance", name: "エントランス", color: "#3b82f6", opacity: 0.25, desc: "入口・受付・動線の起点" },
  { id: "locker", name: "更衣室・水回り", color: "#06b6d4", opacity: 0.28, desc: "更衣室・シャワー・トイレ周辺" },
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
    const marker = createDimMarker("edge");
    group.add(marker);
    markers.push(marker);
  }
  while (markers.length > count) {
    const rem = markers.pop();
    group.remove(rem);
  }
  return group._objects.filter((o) => o._zoneDim === "edge");
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

  edges.forEach((edge, i) => {
    const marker = markers[i];
    if (!marker) return;

    const outward = {
      x: edge.midCanvas.x + edge.outwardCanvas.x * outwardPad,
      y: edge.midCanvas.y + edge.outwardCanvas.y * outwardPad,
    };
    const local = canvasPointToGroupLocal(group, outward);

    marker.set({
      text: edge.lengthM != null ? `${edge.lengthM.toFixed(2)}m` : "",
      left: local.x,
      top: local.y,
      angle: edge.angleDeg - groupAngle,
      visible: edge.lengthM != null,
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
    if (tb.calcTextHeight() <= 100) return fs;
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

  const labelW = Math.max(88, Math.min(240, poly.width || 140));
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

  const dimMarkers = [];
  for (let i = 0; i < points.length; i++) {
    dimMarkers.push(createDimMarker("edge"));
  }

  const group = new fabric.Group([poly, label, ...dimMarkers], {
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

  group.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true });
  if (metrics) group._zoneMetrics = metrics;
  if (typeof group.triggerLayout === "function") group.triggerLayout();
  return group;
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

        const segLabel = makeSegmentDimLabel(prev, ptr, formatEdgeLength(getSegmentMetrics?.(prev, ptr)));
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
