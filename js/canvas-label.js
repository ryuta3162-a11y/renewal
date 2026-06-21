export const CANVAS_LABEL_FONT_SIZE = 14;
export const CANVAS_LABEL_COLOR = "#111827";
export const CANVAS_LABEL_FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

export function createCanvasLabel(text, x, y, fontSize = CANVAS_LABEL_FONT_SIZE) {
  const label = new fabric.IText(text || "テキスト", {
    left: x,
    top: y,
    originX: "left",
    originY: "top",
    fontSize,
    fill: CANVAS_LABEL_COLOR,
    fontFamily: '"Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif',
    fontWeight: "600",
    objectType: "canvasLabel",
    objectCaching: false,
    editable: true,
    selectable: true,
    evented: true,
    lockScalingFlip: true,
    exitEditingOnEnter: false,
    splitByGrapheme: true,
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
    exitEditingOnEnter: false,
    splitByGrapheme: true,
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

/** Fabric IText の hidden textarea 編集中か */
export function isFabricTextEditing(canvas) {
  const obj = canvas?.getActiveObject();
  if (obj?.isEditing) return true;
  const ae = document.activeElement;
  if (!ae) return false;
  if (ae.tagName === "TEXTAREA" && ae.classList.contains("hidden-textarea")) return true;
  if (ae.closest?.(".canvas-container")) return ae.tagName === "TEXTAREA";
  return false;
}
