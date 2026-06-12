import { SNAP_GRID } from "./constants.js";

let snapEnabled = true;

export function setSnapEnabled(on) {
  snapEnabled = on;
}

export function isSnapEnabled() {
  return snapEnabled;
}

export function snapPoint(ptr, canvas, e) {
  if (!snapEnabled || e?.shiftKey) return { x: ptr.x, y: ptr.y };
  const zoom = canvas?.getZoom?.() || 1;
  const grid = SNAP_GRID / zoom;
  return {
    x: Math.round(ptr.x / grid) * grid,
    y: Math.round(ptr.y / grid) * grid,
  };
}

export function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function getFillStyle(color, opacity) {
  return {
    fill: hexToRgba(color, opacity),
    stroke: color,
    strokeWidth: 1.5,
  };
}

export function enablePolygonFill(canvas, getStyle, onDone) {
  const points = [];
  let previewLines = [];
  let vertexDots = [];
  let rubberLine = null;
  let previewPoly = null;

  const handler = (opt) => {
    const e = opt.e;
    const ptr = snapPoint(canvas.getPointer(e), canvas, e);

    if (e.type === "mousemove" && points.length) {
      if (rubberLine) canvas.remove(rubberLine);
      const last = points[points.length - 1];
      rubberLine = new fabric.Line([last.x, last.y, ptr.x, ptr.y], {
        stroke: getStyle().stroke,
        strokeWidth: 1,
        strokeDashArray: [4, 4],
        selectable: false,
        evented: false,
      });
      canvas.add(rubberLine);

      if (points.length >= 2) {
        if (previewPoly) canvas.remove(previewPoly);
        const style = getStyle();
        previewPoly = new fabric.Polygon(
          [...points, ptr].map((p) => ({ x: p.x, y: p.y })),
          {
            fill: style.fill,
            stroke: style.stroke,
            strokeWidth: 1,
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
        const closeDist = 12 / (canvas.getZoom() || 1);
        const dist = Math.hypot(ptr.x - first.x, ptr.y - first.y);
        if (dist < closeDist) {
          finish();
          return;
        }
      }
      points.push(ptr);
      const dot = new fabric.Circle({
        left: ptr.x,
        top: ptr.y,
        radius: points.length === 1 ? 5 : 3,
        fill: points.length === 1 ? getStyle().stroke : "#fff",
        stroke: getStyle().stroke,
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
          stroke: getStyle().stroke,
          strokeWidth: 1.5,
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
    const style = getStyle();
    const poly = new fabric.Polygon(points.map((p) => ({ x: p.x, y: p.y })), {
      ...style,
      objectType: "fillArea",
      originX: "center",
      originY: "center",
    });
    cleanup();
    canvas.add(poly);
    canvas.setActiveObject(poly);
    onDone?.(poly);
  }

  canvas.on("mouse:down", handler);
  canvas.on("mouse:move", handler);
  document.addEventListener("keydown", keyHandler);

  return cleanup;
}
