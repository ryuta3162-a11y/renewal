export const CANVAS_LABEL_FONT_SIZE = 14;
export const CANVAS_LABEL_COLOR = "#111827";

export function createCanvasLabel(text, x, y) {
  const label = new fabric.IText(text || "テキスト", {
    left: x,
    top: y,
    originX: "left",
    originY: "top",
    fontSize: CANVAS_LABEL_FONT_SIZE,
    fill: CANVAS_LABEL_COLOR,
    fontFamily: '"Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif',
    fontWeight: "600",
    objectType: "canvasLabel",
    objectCaching: false,
    editable: true,
    selectable: true,
    evented: true,
    lockScalingFlip: true,
  });
  return label;
}

export function upgradeCanvasLabel(obj) {
  if (obj?.objectType !== "canvasLabel") return obj;
  obj.set({
    fill: CANVAS_LABEL_COLOR,
    fontSize: obj.fontSize || CANVAS_LABEL_FONT_SIZE,
    objectCaching: false,
    editable: true,
    objectType: "canvasLabel",
  });
  return obj;
}

export function bringCanvasLabelsToFront(canvas, drawingImage) {
  if (!canvas) return;
  canvas.getObjects().forEach((o) => {
    if (o.objectType === "canvasLabel") canvas.bringToFront(o);
  });
  if (drawingImage) drawingImage.sendToBack();
}
