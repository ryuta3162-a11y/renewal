/** 辺ラベルは描画だけ。選択枠・リサイズ枠はポリゴン本体のサイズに合わせる */
export function refitZoneGroupBounds(group) {
  if (!group || group.objectType !== "zone" || group.type !== "group") return group;

  const overlays = [];
  const core = [];
  group._objects?.forEach((o) => {
    if (o._zoneDim === "edge") overlays.push(o);
    else core.push(o);
  });
  if (!core.length) return group;

  const saved = group._objects;
  group._objects = core;
  if (typeof group.triggerLayout === "function") {
    group.triggerLayout();
  }
  group._objects = saved;
  group.dirty = true;
  group.setCoords();
  return group;
}
