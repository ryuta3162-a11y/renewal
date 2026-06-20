import { MARK_PARTS } from "./constants.js";
import { refitZoneGroupBounds } from "./zone-layout.js";

const BADGE_H = 18;
const BADGE_PAD_X = 6;
const BADGE_FONT = 10;

const ROLE_LABELS = {
  demolish: "取り壊し",
  build: "制作",
  "move-from": "移動元",
  "move-to": "移動先",
  keep: "残す",
};

export function getMarkDefByRole(role) {
  return MARK_PARTS.find((p) => p.markRole === role) || null;
}

export function getZoneMarkRoleLabel(role) {
  return ROLE_LABELS[role] || role || "";
}

export function formatZoneMarkSummary(zone) {
  if (!zone?.zoneMarkRole) return "";
  const def = getMarkDefByRole(zone.zoneMarkRole);
  const label = zone.zoneMarkLabel || def?.label || getZoneMarkRoleLabel(zone.zoneMarkRole);
  if (zone.zoneMarkRole === "move-from") {
    return `${zone.zoneMarkIndex || "?"} · ${label}`;
  }
  if (zone.zoneMarkRole === "move-to") {
    return `→${zone.zoneMarkLinkIndex || "?"} · ${label}`;
  }
  const sym = def?.mark || "●";
  return `${sym} ${label}`;
}

function polygonBBoxTopRight(poly, inset = 4) {
  const pts = poly?.points;
  if (!pts?.length) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
  });
  return { x: maxX - inset, y: minY + inset };
}

function removeZoneMarkBadgeObjects(group) {
  if (!group?._objects) return;
  group._objects = group._objects.filter((o) => !o._zoneMarkBadge);
  group.dirty = true;
}

function badgeTextForZone(group) {
  const def = getMarkDefByRole(group.zoneMarkRole);
  const label = group.zoneMarkLabel || def?.label || "";
  if (group.zoneMarkRole === "move-from") {
    return `${group.zoneMarkIndex || "?"} ${label}`;
  }
  if (group.zoneMarkRole === "move-to") {
    return `→${group.zoneMarkLinkIndex || "?"} ${label}`;
  }
  return `${def?.mark || "●"} ${label}`;
}

/** 区画右上に固定サイズの記号バッジを描画（最前面） */
export function refreshZoneMarkBadge(group) {
  if (!group || group.objectType !== "zone" || group.type !== "group") return group;
  removeZoneMarkBadgeObjects(group);
  if (!group.zoneMarkRole) return group;

  const def = getMarkDefByRole(group.zoneMarkRole);
  const poly = group._objects?.[0];
  if (!poly || !def) return group;

  const anchor = polygonBBoxTopRight(poly);
  const text = badgeTextForZone(group);
  const badgeW = Math.min(96, Math.max(48, text.length * (BADGE_FONT * 0.62) + BADGE_PAD_X * 2));

  const bg = new fabric.Rect({
    width: badgeW,
    height: BADGE_H,
    rx: 3,
    ry: 3,
    fill: def.fill,
    stroke: def.stroke,
    strokeWidth: 1.5,
    originX: "right",
    originY: "top",
    left: anchor.x,
    top: anchor.y,
    _zoneMarkBadge: true,
    selectable: false,
    evented: false,
    objectCaching: false,
  });

  const txt = new fabric.Text(text, {
    fontSize: BADGE_FONT,
    fontWeight: "800",
    fill: def.stroke,
    originX: "center",
    originY: "center",
    left: anchor.x - badgeW / 2,
    top: anchor.y + BADGE_H / 2,
    _zoneMarkBadge: true,
    selectable: false,
    evented: false,
    objectCaching: false,
  });

  group._objects.push(bg, txt);
  refitZoneGroupBounds(group);
  group.dirty = true;
  return group;
}

export function clearZoneMark(group) {
  if (!group) return;
  group.set({
    zoneMarkRole: "",
    zoneMarkLabel: "",
    zoneMarkIndex: "",
    zoneMarkLinkIndex: "",
  });
  refreshZoneMarkBadge(group);
}

export function applyZoneMark(group, markDef, { getNextIndex, getMoveFromIndices } = {}) {
  if (!group || group.objectType !== "zone" || !markDef?.markRole) return group;

  const patch = {
    zoneMarkRole: markDef.markRole,
    zoneMarkLabel: markDef.label || "",
    zoneMarkIndex: "",
    zoneMarkLinkIndex: "",
  };

  if (markDef.markRole === "move-from") {
    patch.zoneMarkIndex = getNextIndex?.() || "A";
  } else if (markDef.markRole === "move-to") {
    const sources = getMoveFromIndices?.() || [];
    patch.zoneMarkLinkIndex = sources.length === 1 ? sources[0] : sources[0] || "A";
  }

  group.set(patch);
  refreshZoneMarkBadge(group);
  return group;
}

export function upgradeZoneMarkBadge(group) {
  if (!group || group.objectType !== "zone") return group;
  removeZoneMarkBadgeObjects(group);
  if (group.zoneMarkRole) refreshZoneMarkBadge(group);
  return group;
}
