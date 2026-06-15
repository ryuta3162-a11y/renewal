/** 図面の中心（キャンバス座標） */
export function getDrawingCenter(img) {
  if (!img) return { x: 0, y: 0 };
  return {
    x: img.left + (img.width * img.scaleX) / 2,
    y: img.top + (img.height * img.scaleY) / 2,
  };
}

export function captureDrawingState(img) {
  if (!img) return null;
  return {
    left: img.left,
    top: img.top,
    scaleX: img.scaleX,
    scaleY: img.scaleY,
    center: getDrawingCenter(img),
  };
}

export function applyDrawingTransform(img, t) {
  if (!img || !t) return;
  img.set({
    left: t.left,
    top: t.top,
    scaleX: t.scaleX,
    scaleY: t.scaleY,
    angle: 0,
  });
  img.setCoords();
}

/** 保存済みの図面位置が有効か */
export function isValidDrawingTransform(t) {
  if (!t) return false;
  const { left, top, scaleX, scaleY } = t;
  if (![left, top, scaleX, scaleY].every((n) => Number.isFinite(n))) return false;
  if (scaleX <= 0.001 || scaleY <= 0.001) return false;
  if (scaleX > 100 || scaleY > 100) return false;
  return true;
}

/** 図面がキャンバス上に十分見えているか */
export function isDrawingOnScreen(img, canvas) {
  if (!img || !canvas) return false;
  const w = img.getScaledWidth?.() ?? 0;
  const h = img.getScaledHeight?.() ?? 0;
  if (w < 20 || h < 20) return false;
  const b = img.getBoundingRect(true);
  const cw = canvas.getWidth();
  const ch = canvas.getHeight();
  if (!cw || !ch) return false;
  const overlapW = Math.min(b.left + b.width, cw) - Math.max(b.left, 0);
  const overlapH = Math.min(b.top + b.height, ch) - Math.max(b.top, 0);
  return overlapW > 40 && overlapH > 40;
}

/** 図面のスケール変更を区画・測定線などへ同期 */
export function syncUserObjectsToDrawing(canvas, getUserObjects, before, after) {
  if (!before || !after || !canvas) return;
  const ratioX = after.scaleX / before.scaleX;
  const ratioY = after.scaleY / before.scaleY;
  if (!Number.isFinite(ratioX) || !Number.isFinite(ratioY)) return;
  if (Math.abs(ratioX - 1) < 0.0001 && Math.abs(ratioY - 1) < 0.0001) return;

  getUserObjects().forEach((obj) => {
    const pt = obj.getCenterPoint();
    const dx = pt.x - before.center.x;
    const dy = pt.y - before.center.y;
    const newPt = new fabric.Point(
      after.center.x + dx * ratioX,
      after.center.y + dy * ratioY
    );
    obj.set({
      scaleX: (obj.scaleX || 1) * ratioX,
      scaleY: (obj.scaleY || 1) * ratioY,
    });
    obj.setPositionByOrigin(newPt, "center", "center");
    obj.setCoords();
  });
}

export function configureDrawingResize(img, enabled) {
  if (!img) return;
  img.set({
    selectable: enabled,
    evented: true,
    lockMovement: true,
    lockRotation: true,
    lockScaling: !enabled,
    lockUniScaling: true,
    hasControls: enabled,
    hasBorders: enabled,
    hoverCursor: enabled ? "nwse-resize" : "default",
    borderColor: "#3b82f6",
    cornerColor: "#3b82f6",
    cornerStrokeColor: "#fff",
  });
  if (enabled) {
    img.setControlsVisibility({
      mt: false,
      mb: false,
      ml: false,
      mr: false,
      mtr: false,
      tl: true,
      tr: true,
      bl: true,
      br: true,
    });
  }
}
