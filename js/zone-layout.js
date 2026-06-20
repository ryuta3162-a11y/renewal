function polygonLocalCenter(poly) {
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

/** 辺ラベルを一時的にポリゴン内へ退避してからレイアウト（_objects の差し替えはしない） */
export function collapseEdgeDimMarkers(group) {
  if (!group?._objects) return;
  const poly = group._objects[0];
  const anchor = polygonLocalCenter(poly);
  group._objects.forEach((o) => {
    if (o._zoneDim !== "edge") return;
    if (!o._edgeDimStash) {
      o._edgeDimStash = { left: o.left, top: o.top, angle: o.angle, visible: o.visible, text: o.text };
    }
    o.set({ left: anchor.x, top: anchor.y, angle: 0, visible: false, text: "" });
  });
  group.dirty = true;
}

export function restoreEdgeDimMarkers(group) {
  if (!group?._objects) return;
  group._objects.forEach((o) => {
    if (o._zoneDim !== "edge" || !o._edgeDimStash) return;
    const s = o._edgeDimStash;
    o.set({
      left: s.left,
      top: s.top,
      angle: s.angle,
      visible: s.visible,
      text: s.text,
    });
    delete o._edgeDimStash;
  });
  group.dirty = true;
}

/** 選択枠はポリゴン本体基準。辺ラベルはレイアウト計算から除外する */
export function refitZoneGroupBounds(group) {
  if (!group || group.objectType !== "zone" || group.type !== "group") return group;
  const poly = group._objects?.[0];
  if (!poly?.points?.length) return group;

  collapseEdgeDimMarkers(group);
  try {
    if (typeof group.triggerLayout === "function") group.triggerLayout();
    group.setCoords();
  } catch (err) {
    console.warn("refitZoneGroupBounds:", err);
  } finally {
    restoreEdgeDimMarkers(group);
    group.setCoords();
  }
  return group;
}
