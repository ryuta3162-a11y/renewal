const SERIALIZE_PROPS = [
  "objectType",
  "partId",
  "memoData",
  "partLabel",
  "partCategory",
  "realWidthMm",
  "realHeightMm",
  "inventoryCount",
  "partImageMode",
  "imageUrl",
  "imageHasLabel",
  "partMarkRole",
  "partMarkIndex",
  "partLinkIndex",
  "zoneName",
  "zoneMemo",
  "zoneColor",
  "zoneOpacity",
  "zonePresetId",
  "zoneInstanceId",
  "zoneShowEdgeLengths",
  "zoneShowBBoxDims",
  "zoneShowTsubo",
];

const LABEL_PAD = 5;
const CAPTION_H = 20;

export function getSerializeProps() {
  return SERIALIZE_PROPS;
}

export function applyProControls() {
  fabric.Object.prototype.set({
    transparentCorners: false,
    cornerColor: "#ffffff",
    cornerStrokeColor: "#3b82f6",
    borderColor: "#60a5fa",
    borderScaleFactor: 1,
    cornerSize: 8,
    cornerStyle: "rect",
    padding: 0,
    borderOpacityWhenMoving: 0.9,
    touchCornerSize: 24,
  });
}

export function getPartBodyRect(group) {
  if (!group?._objects) return null;
  return group._objects.find((o) => o.partBody) || group._objects.find((o) => o.type === "rect");
}

export function applyInteractiveControls(obj) {
  if (!obj || obj.objectType === "drawing" || obj.objectType === "memo" || obj.hasControls === false) return;
  const w = obj.getScaledWidth?.() || obj.width || 80;
  const h = obj.getScaledHeight?.() || obj.height || 60;
  const minDim = Math.min(w, h);
  const corner = Math.max(5, Math.min(8, Math.round(minDim * 0.14)));
  obj.set({
    cornerStyle: "rect",
    cornerSize: corner,
    touchCornerSize: Math.max(corner + 14, 22),
    borderColor: "#60a5fa",
    borderScaleFactor: 1,
    padding: 0,
  });
  obj.setCoords();
}

function makeBodyRect(props) {
  return new fabric.Rect({
    rx: 0,
    ry: 0,
    strokeWidth: 0,
    stroke: null,
    partBody: true,
    originX: "center",
    originY: "center",
    ...props,
  });
}

function fitFontSize(label, innerW, innerH) {
  for (let fs = 11; fs >= 6; fs--) {
    const tb = new fabric.Textbox(label, {
      width: innerW,
      fontSize: fs,
      splitByGrapheme: true,
      lineHeight: 1.15,
    });
    if (tb.calcTextHeight() <= innerH) return fs;
  }
  return 6;
}

function makeLabelTextbox(label, boxW, boxH) {
  const innerW = Math.max(boxW - LABEL_PAD * 2, 20);
  const innerH = Math.max(boxH - LABEL_PAD * 2, 14);
  const fontSize = fitFontSize(label, innerW, innerH);
  return new fabric.Textbox(label, {
    width: innerW,
    fontSize,
    fill: "#1e293b",
    fontWeight: "600",
    textAlign: "center",
    originX: "center",
    originY: "center",
    splitByGrapheme: true,
    lineHeight: 1.15,
    objectCaching: false,
  });
}

function makeLabelBackdrop(boxW, boxH) {
  return new fabric.Rect({
    width: Math.max(boxW - 4, 16),
    height: Math.max(boxH - 4, 14),
    fill: "rgba(255,255,255,0.82)",
    strokeWidth: 0,
    rx: 0,
    ry: 0,
    originX: "center",
    originY: "center",
  });
}

function basePartProps(def, x, y) {
  return {
    left: x,
    top: y,
    originX: "center",
    originY: "center",
    partId: def.id,
    partLabel: def.label,
    partCategory: def.category,
    partMarkRole: def.markRole || "",
    partMarkIndex: def.partMarkIndex || "",
    partLinkIndex: def.partLinkIndex || "",
    realWidthMm: def.realWidthMm || "",
    realHeightMm: def.realHeightMm || "",
    inventoryCount: def.count || null,
    objectType: "part",
    lockScalingFlip: true,
    subTargetCheck: false,
    imageUrl: def.imageUrl || "",
    partImageMode: false,
  };
}

export function getMarkDisplayText(groupOrDef) {
  const role = groupOrDef.partMarkRole || groupOrDef.markRole;
  const mark = groupOrDef.mark;
  if (role === "move-from") return groupOrDef.partMarkIndex || "?";
  if (role === "move-to") return `→${groupOrDef.partLinkIndex || "?"}`;
  return mark || "●";
}

export function refreshMarkPartDisplay(group) {
  if (group.objectType !== "part") return;
  const textObj = group._objects?.find((o) => o.type === "text" && o !== group._objects?.[0]);
  if (!textObj) return;
  const body = getPartBodyRect(group);
  const role = group.partMarkRole;
  if (role === "move-from" || role === "move-to") {
    textObj.set({
      text: getMarkDisplayText(group),
      fontSize: role === "move-from" ? 22 : 17,
      fill: body?.stroke || "#0f172a",
      fontWeight: "800",
    });
  }
  group.dirty = true;
  group.setCoords();
}

export function reflowPartLabel(group) {
  if (group.partImageMode) return;
  const rect = getPartBodyRect(group);
  if (!rect || rect.type !== "rect") return;

  const label = group.partLabel || "パーツ";
  const boxW = rect.width;
  const boxH = rect.height;

  group._objects.length = 1;
  group._objects.push(makeLabelBackdrop(boxW, boxH));
  group._objects.push(makeLabelTextbox(label, boxW, boxH));
  group.dirty = true;
  group.setCoords();
}

function scaleImageToFit(img, areaW, areaH) {
  const scale = Math.min(areaW / img.width, areaH / img.height);
  img.set({
    scaleX: scale,
    scaleY: scale,
    originX: "center",
    originY: "center",
    top: -CAPTION_H / 2,
  });
}

function buildImagePartObjects(def, width, height, img) {
  const label = def.label || "パーツ";
  const hasCaptionInImage = !!def.imageHasLabel;
  const objects = [];

  objects.push(
    makeBodyRect({
      width,
      height,
      fill: hasCaptionInImage ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.96)",
    })
  );

  if (hasCaptionInImage) {
    const scale = Math.min(width / img.width, height / img.height);
    img.set({
      scaleX: scale,
      scaleY: scale,
      originX: "center",
      originY: "center",
      top: 0,
    });
    objects.push(img);
    return objects;
  }

  scaleImageToFit(img, width - 4, height - CAPTION_H - 4);
  objects.push(img);

  const capW = width - 6;
  objects.push(
    new fabric.Textbox(label, {
      width: capW,
      fontSize: Math.max(7, Math.min(9, capW / (label.length * 0.55))),
      fill: "#1e293b",
      fontWeight: "600",
      textAlign: "center",
      originX: "center",
      originY: "center",
      splitByGrapheme: true,
      lineHeight: 1.1,
      top: height / 2 - CAPTION_H / 2 + 1,
    })
  );

  return objects;
}

export function createPartWithMachineImage(def, x, y, w, h) {
  const width = w ?? def.w;
  const height = h ?? def.h;
  const url = def.imageData || def.imageUrl;

  return new Promise((resolve, reject) => {
    if (!url) {
      resolve(createPartBox(def, x, y, w, h));
      return;
    }
    fabric.Image.fromURL(
      url,
      (img) => {
        if (!img) {
          resolve(createPartBox(def, x, y, w, h));
          return;
        }
        const objects = buildImagePartObjects(def, width, height, img);
        const group = new fabric.Group(objects, {
          ...basePartProps(def, x, y),
          partImageMode: true,
          imageHasLabel: !!def.imageHasLabel,
        });
        group.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true });
        applyInteractiveControls(group);
        resolve(group);
      },
      { crossOrigin: "anonymous" }
    );
  });
}

export function normalizePartAfterResize(group) {
  if (group.objectType !== "part" || group.type !== "group") return;

  if (group.partImageMode && group.imageUrl) {
    const w = Math.max(group.getScaledWidth(), 16);
    const h = Math.max(group.getScaledHeight(), 16);
    const { left, top, angle } = group;
    const body = getPartBodyRect(group);
    const def = {
      id: group.partId,
      label: group.partLabel,
      category: group.partCategory,
      fill: body?.fill,
      imageUrl: group.imageUrl,
      imageHasLabel: group.imageHasLabel,
    };
    const token = (group._resizeToken = (group._resizeToken || 0) + 1);
    fabric.Image.fromURL(
      group.imageUrl,
      (img) => {
        if (group._resizeToken !== token) return;
        const objects = buildImagePartObjects(def, w, h, img);
        group._objects = objects;
        group.set({ scaleX: 1, scaleY: 1, left, top, angle, width: w, height: h });
        group.dirty = true;
        group.setCoords();
        applyInteractiveControls(group);
        group.canvas?.requestRenderAll();
      },
      { crossOrigin: "anonymous" }
    );
    return;
  }

  const rect = getPartBodyRect(group);
  if (!rect) return;

  const w = Math.max(group.getScaledWidth(), 16);
  const h = Math.max(group.getScaledHeight(), 16);
  const { left, top, angle } = group;

  rect.set({ width: w, height: h, scaleX: 1, scaleY: 1, rx: 0, ry: 0 });
  group.set({ scaleX: 1, scaleY: 1, left, top, angle, width: w, height: h });
  reflowPartLabel(group);
  applyInteractiveControls(group);
}

export function updatePartLabel(group, label) {
  group.set("partLabel", label);
  if (group.partImageMode) {
    normalizePartAfterResize(group);
  } else {
    reflowPartLabel(group);
  }
}

export function createPartBox(def, x, y, w, h) {
  const width = w ?? def.w;
  const height = h ?? def.h;
  const label = def.label || "パーツ";
  const objects = [];

  if (def.mark) {
    objects.push(
      makeBodyRect({
        width,
        height,
        fill: def.fill,
        stroke: def.stroke,
        strokeWidth: 1.5,
      })
    );
  } else {
    objects.push(
      makeBodyRect({
        width,
        height,
        fill: def.fill,
      })
    );
  }

  if (def.mark) {
    const display = def.markRole === "move-from" || def.markRole === "move-to"
      ? getMarkDisplayText(def)
      : def.mark;
    const fontSize = def.markRole === "move-from" ? 22 : def.markRole === "move-to" ? 17 : def.mark === "✕" ? 26 : 20;
    objects.push(
      new fabric.Text(display, {
        fontSize,
        fill: def.stroke,
        fontWeight: "bold",
        originX: "center",
        originY: "center",
      })
    );
  } else {
    objects.push(makeLabelBackdrop(width, height));
    objects.push(makeLabelTextbox(label, width, height));
  }

  const group = new fabric.Group(objects, basePartProps(def, x, y));
  group.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true });
  applyInteractiveControls(group);
  return group;
}

export async function placePart(def, x, y, w, h) {
  const useImage = def.useImage !== false && (def.imageData || def.imageUrl);
  if (useImage) {
    return createPartWithMachineImage(def, x, y, w, h);
  }
  return createPartBox(def, x, y, w, h);
}

export function upgradePartGroup(group) {
  if (group.objectType !== "part") return;
  if (!group.partMarkRole) {
    if (group.partId === "preset-remove" || group.partId === "mark-demolish") {
      group.set({ partMarkRole: "demolish" });
    } else if (group.partId === "preset-keep") {
      group.set({ partMarkRole: "keep" });
    } else if (group.partId === "mark-build") {
      group.set({ partMarkRole: "build" });
    } else if (group.partId === "mark-move-from") {
      group.set({ partMarkRole: "move-from" });
    } else if (group.partId === "mark-move-to") {
      group.set({ partMarkRole: "move-to" });
    }
  }
  const body = getPartBodyRect(group);
  if (body) {
    body.set({ rx: 0, ry: 0 });
    if (!group._objects?.some((o) => o.type === "text" && (o.text === "✕" || o.text === "○"))) {
      body.set({ strokeWidth: 0, stroke: null });
    }
    body.set("partBody", true);
  }
  group._objects?.forEach((o) => {
    if (o !== body && o.type === "rect") o.set({ rx: 0, ry: 0, strokeWidth: 0, stroke: null });
  });
  applyInteractiveControls(group);
  const isMark = group._objects?.some(
    (o) => o.type === "text" && (o.text === "✕" || o.text === "○" || group.partMarkRole)
  );
  if (isMark) {
    refreshMarkPartDisplay(group);
    return;
  }
  if (group.partImageMode) return;
  if (group._objects?.some((o) => o.type === "textbox")) return;
  normalizePartAfterResize(group);
}

export function createMemoPin(x, y, data = {}) {
  const glow = new fabric.Circle({
    radius: 14,
    fill: "rgba(251,191,36,0.2)",
    stroke: "rgba(251,191,36,0.5)",
    strokeWidth: 1,
    originX: "center",
    originY: "center",
    shadow: new fabric.Shadow({ color: "rgba(251,191,36,0.7)", blur: 16 }),
  });
  const dot = new fabric.Circle({
    radius: 5,
    fill: "#fbbf24",
    stroke: "#f59e0b",
    strokeWidth: 1.5,
    originX: "center",
    originY: "center",
  });
  return new fabric.Group([glow, dot], {
    left: x,
    top: y,
    originX: "center",
    originY: "center",
    objectType: "memo",
    memoData: {
      title: data.title || "メモ",
      content: data.content || "",
      dimensions: data.dimensions || "",
      colors: data.colors || "",
      size: data.size || "",
    },
    hasControls: false,
    hoverCursor: "help",
  });
}

export function updatePartColors(obj, fill, stroke) {
  if (obj.objectType !== "part" || obj.type !== "group") return;
  const rect = getPartBodyRect(obj);
  if (rect) {
    const isMark = obj._objects?.some(
      (o) => o.type === "text" && (o.text === "✕" || o.text === "○")
    );
    rect.set({ fill, ...(isMark ? { stroke } : { strokeWidth: 0, stroke: null }) });
    obj.dirty = true;
  }
}

export function serializeObjects(canvas) {
  return canvas.getObjects().map((o) => o.toObject(SERIALIZE_PROPS));
}
