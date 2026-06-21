export const CANVAS_LABEL_FONT_SIZE = 14;
export const CANVAS_LABEL_COLOR = "#111827";
export const CANVAS_LABEL_FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

const LABEL_FONT =
  '"Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';

function makeMainText(text, fontSize) {
  return new fabric.IText(text || "", {
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    fontSize,
    fill: CANVAS_LABEL_COLOR,
    fontFamily: LABEL_FONT,
    fontWeight: "600",
    canvasLabelRole: "main",
    objectCaching: false,
    editable: true,
    selectable: false,
    evented: true,
    exitEditingOnEnter: false,
    splitByGrapheme: true,
  });
}

function makeMemoText(memo, fontSize) {
  const memoFs = Math.max(8, Math.round(fontSize * 0.85));
  return new fabric.IText(memo || "", {
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    fontSize: memoFs,
    fill: CANVAS_LABEL_COLOR,
    fontFamily: LABEL_FONT,
    fontWeight: "400",
    canvasLabelRole: "memo",
    objectCaching: false,
    editable: false,
    selectable: false,
    evented: false,
    splitByGrapheme: true,
  });
}

export function getCanvasLabelMain(group) {
  if (!group) return null;
  if (group.type === "i-text" && group.objectType === "canvasLabel") return group;
  return group._objects?.find((o) => o.canvasLabelRole === "main") || group._objects?.[0] || null;
}

export function getCanvasLabelMemoObj(group) {
  if (!group || group.type === "i-text") return null;
  return group._objects?.find((o) => o.canvasLabelRole === "memo") || null;
}

export function getCanvasLabelMainText(group) {
  return getCanvasLabelMain(group)?.text || "";
}

export function layoutCanvasLabelGroup(group) {
  if (!group || group.objectType !== "canvasLabel") return group;
  const main = getCanvasLabelMain(group);
  if (!main) return group;

  const fontSize = group.fontSize || main.fontSize || CANVAS_LABEL_FONT_SIZE;
  group.fontSize = fontSize;
  main.set({
    fontSize,
    fontWeight: "600",
    fill: CANVAS_LABEL_COLOR,
    exitEditingOnEnter: false,
    splitByGrapheme: true,
  });

  const memoObj = getCanvasLabelMemoObj(group);
  const memoText = group.canvasLabelMemo ?? memoObj?.text ?? "";
  if (memoObj) {
    const memoFs = Math.max(8, Math.round(fontSize * 0.85));
    memoObj.set({
      text: memoText,
      fontSize: memoFs,
      fontWeight: "400",
      fill: CANVAS_LABEL_COLOR,
      visible: !!memoText,
      top: main.calcTextHeight() + (memoText ? 4 : 0),
      left: 0,
    });
  }

  group.dirty = true;
  group.setCoords();
  return group;
}

function buildCanvasLabelGroup({ text, x, y, fontSize, memo }) {
  const main = makeMainText(text, fontSize);
  const memoObj = makeMemoText(memo, fontSize);
  const group = new fabric.Group([main, memoObj], {
    left: x,
    top: y,
    originX: "left",
    originY: "top",
    objectType: "canvasLabel",
    canvasLabelMemo: memo || "",
    fontSize,
    subTargetCheck: true,
    lockScalingFlip: true,
    objectCaching: false,
  });
  layoutCanvasLabelGroup(group);
  return group;
}

export function createCanvasLabel(text, x, y, fontSize = CANVAS_LABEL_FONT_SIZE, memo = "") {
  return buildCanvasLabelGroup({ text, x, y, fontSize, memo });
}

export function setCanvasLabelMemo(group, memo) {
  if (group?.objectType !== "canvasLabel") return;
  const value = memo ?? "";
  group.set("canvasLabelMemo", value);
  if (group.type === "i-text") {
    group.set("canvasLabelMemo", value);
    return;
  }
  layoutCanvasLabelGroup(group);
}

export function setCanvasLabelFontSize(group, fontSize) {
  if (group?.objectType !== "canvasLabel" || !(fontSize > 0)) return;
  group.set("fontSize", fontSize);
  if (group.type === "i-text") {
    group.set({ fontSize });
    return;
  }
  layoutCanvasLabelGroup(group);
}

export function upgradeCanvasLabel(obj) {
  if (obj?.objectType !== "canvasLabel") return obj;

  if (obj.type === "i-text") {
    const fontSize = obj.fontSize || CANVAS_LABEL_FONT_SIZE;
    const group = buildCanvasLabelGroup({
      text: obj.text || "",
      x: obj.left,
      y: obj.top,
      fontSize,
      memo: obj.canvasLabelMemo || "",
    });
    group.set({
      angle: obj.angle || 0,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
    });
    return group;
  }

  if (obj.type === "group") {
    if (!getCanvasLabelMemoObj(obj)) {
      obj.add(makeMemoText(obj.canvasLabelMemo || "", obj.fontSize || CANVAS_LABEL_FONT_SIZE));
    }
    obj.set({
      subTargetCheck: true,
      objectType: "canvasLabel",
      objectCaching: false,
    });
    layoutCanvasLabelGroup(obj);
  }
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
  if (obj?.type === "activeSelection") {
    return obj.getObjects().some((o) => o.isEditing);
  }
  const ae = document.activeElement;
  if (!ae) return false;
  if (ae.tagName === "TEXTAREA" && ae.classList.contains("hidden-textarea")) return true;
  if (ae.closest?.(".canvas-container")) return ae.tagName === "TEXTAREA";
  return false;
}
