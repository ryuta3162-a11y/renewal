import { getZoneCanvasPoints } from "./drawing-scale.js";
import { snapPoint } from "./draw-tools.js";
import { updateZonePointsInPlace } from "./zones.js";

let vertexHandles = [];
let activeZone = null;

function handleRadius(canvas) {
  return Math.max(5, 6 / (canvas?.getZoom() || 1));
}

function syncVertexHandlePositions(zone, skipIndex = -1) {
  const pts = getZoneCanvasPoints(zone);
  vertexHandles.forEach((handle) => {
    if (handle._zoneRef !== zone) return;
    const i = handle._vertexIndex;
    if (i === skipIndex || !pts[i]) return;
    handle.set({ left: pts[i].x, top: pts[i].y });
    handle.setCoords();
  });
}

function clearVertexHandles(canvas) {
  vertexHandles.forEach((h) => {
    if (h.canvas) h.canvas.remove(h);
  });
  vertexHandles = [];
  activeZone = null;
  canvas?.requestRenderAll();
}

export function hideZoneVertexHandles(canvas) {
  clearVertexHandles(canvas);
}

export function showZoneVertexHandles(zone, canvas) {
  if (!zone || !canvas || zone.objectType !== "zone") return;
  clearVertexHandles(canvas);
  activeZone = zone;

  zone.set({
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    hasControls: false,
    hasBorders: true,
    borderColor: "#60a5fa",
  });
  zone.setCoords();

  const pts = getZoneCanvasPoints(zone);
  const r = handleRadius(canvas);
  pts.forEach((p, i) => {
    const handle = new fabric.Circle({
      left: p.x,
      top: p.y,
      radius: r,
      fill: "#ffffff",
      stroke: "#3b82f6",
      strokeWidth: 2,
      originX: "center",
      originY: "center",
      selectable: true,
      evented: true,
      hasControls: false,
      hasBorders: false,
      hoverCursor: "grab",
      moveCursor: "grabbing",
      objectType: "zoneVertex",
      _zoneVertex: true,
      _zoneRef: zone,
      _vertexIndex: i,
      _skipHistory: true,
    });
    canvas.add(handle);
    vertexHandles.push(handle);
  });
  vertexHandles.forEach((h) => h.bringToFront());
  zone.bringToFront();
  canvas.requestRenderAll();
}

export function onZoneVertexHandleMoving(handle, canvas, snapEnabled) {
  const zone = handle._zoneRef;
  const i = handle._vertexIndex;
  if (!zone || i == null) return null;

  let x = handle.left;
  let y = handle.top;
  if (snapEnabled) {
    const snapped = snapPoint({ x, y }, canvas, { shiftKey: false });
    x = snapped.x;
    y = snapped.y;
    handle.set({ left: x, top: y });
    handle.setCoords();
  }

  const pts = getZoneCanvasPoints(zone);
  pts[i] = { x, y };
  updateZonePointsInPlace(zone, pts);
  syncVertexHandlePositions(zone, i);
  return zone;
}

export function onZoneBodyMoving(zone, canvas) {
  if (!zone || activeZone !== zone) return;
  syncVertexHandlePositions(zone);
  canvas?.requestRenderAll();
}

export function normalizeZoneIfTransformed(zone) {
  if (!zone || zone.objectType !== "zone") return zone;
  const needs =
    Math.abs((zone.scaleX || 1) - 1) > 0.001 ||
    Math.abs((zone.scaleY || 1) - 1) > 0.001 ||
    Math.abs(zone.angle || 0) > 0.1 ||
    Math.abs(zone.skewX || 0) > 0.1 ||
    Math.abs(zone.skewY || 0) > 0.1;
  if (!needs) return zone;
  const pts = getZoneCanvasPoints(zone);
  updateZonePointsInPlace(zone, pts);
  return zone;
}

export function refreshActiveVertexHandles(canvas) {
  if (!activeZone || !canvas) return;
  syncVertexHandlePositions(activeZone);
  const r = handleRadius(canvas);
  vertexHandles.forEach((h) => h.set({ radius: r }));
  canvas.requestRenderAll();
}
