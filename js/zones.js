import { snapPoint, hexToRgba } from "./draw-tools.js";

export const ZONE_PRESETS = [
  { id: "fw", name: "FWエリア", color: "#f59e0b", opacity: 0.3, desc: "フリーウェイト・ラック等の大枠" },
  { id: "studio", name: "スタジオエリア", color: "#8b5cf6", opacity: 0.3, desc: "スタジオ・レッスン系の区画" },
  { id: "cardio", name: "有酸素エリア", color: "#ec4899", opacity: 0.28, desc: "ランニング・バイク等のゾーン" },
  { id: "stretch", name: "ストレッチエリア", color: "#14b8a6", opacity: 0.28, desc: "ストレッチ・ヨガ系スペース" },
  { id: "entrance", name: "エントランス", color: "#3b82f6", opacity: 0.25, desc: "入口・受付・動線の起点" },
  { id: "locker", name: "更衣室・水回り", color: "#06b6d4", opacity: 0.28, desc: "更衣室・シャワー・トイレ周辺" },
  { id: "other", name: "その他区画", color: "#94a3b8", opacity: 0.25, desc: "上記以外・仮置き・検討中" },
];

export const ZONE_SERIALIZE_PROPS = [
  "objectType",
  "zoneName",
  "zoneMemo",
  "zoneColor",
  "zoneOpacity",
  "zonePresetId",
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

function fitZoneLabel(name, maxW) {
  for (let fs = 14; fs >= 8; fs--) {
    const tb = new fabric.Textbox(name, { width: maxW, fontSize: fs, fontWeight: "700" });
    if (tb.calcTextHeight() <= 36) return fs;
  }
  return 8;
}

export function createZoneGroup(points, preset, memo = "") {
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

  const labelW = Math.max(60, Math.min(160, poly.width || 120));
  const label = new fabric.Textbox(preset.name, {
    width: labelW,
    fontSize: fitZoneLabel(preset.name, labelW),
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

  const group = new fabric.Group([poly, label], {
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
    hoverCursor: "pointer",
    subTargetCheck: false,
  });

  group.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true });
  return group;
}

export function updateZoneLabel(group) {
  const label = group._objects?.find((o) => o.type === "textbox");
  const poly = group._objects?.[0];
  if (!label || !poly) return;
  const name = group.zoneName || "区画";
  const labelW = Math.max(60, Math.min(160, (poly.width || 120) * (group.scaleX || 1)));
  label.set({
    text: name,
    width: labelW,
    fontSize: fitZoneLabel(name, labelW),
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
  if (!obj._objects?.some((o) => o.type === "textbox")) {
    updateZoneLabel(obj);
  }
  return obj;
}

export function enableZoneDraw(canvas, getPreset, onDone) {
  const points = [];
  let previewLines = [];
  let vertexDots = [];
  let rubberLine = null;
  let previewPoly = null;

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
      });
      canvas.add(rubberLine);

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
          }
        );
        canvas.add(previewPoly);
      }
      canvas.requestRenderAll();
    }

    if (e.type !== "mouseup" && e.type !== "mousedown") return;

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
        });
        previewLines.push(line);
        canvas.add(line);
      }
      canvas.requestRenderAll();
    }
  };

  const keyHandler = (e) => {
    if (e.key === "Enter" && points.length >= 3) {
      e.preventDefault();
      finish();
    }
    if (e.key === "Escape") {
      cleanup();
      onDone?.();
    }
    if (e.key === "Backspace" && points.length) {
      e.preventDefault();
      const lastDot = vertexDots.pop();
      if (lastDot) canvas.remove(lastDot);
      if (previewLines.length) {
        const lastLine = previewLines.pop();
        canvas.remove(lastLine);
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
      canvas.requestRenderAll();
    }
  };

  function cleanup() {
    canvas.off("mouse:down", handler);
    canvas.off("mouse:move", handler);
    document.removeEventListener("keydown", keyHandler);
    [...previewLines, ...vertexDots, rubberLine, previewPoly].filter(Boolean).forEach((o) => canvas.remove(o));
    previewLines = [];
    vertexDots = [];
    rubberLine = null;
    previewPoly = null;
    points.length = 0;
    canvas.requestRenderAll();
  }

  function finish() {
    const preset = getPreset();
    const zone = createZoneGroup([...points], preset);
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
