const SERIALIZE_PROPS = [
  "partId",
  "objectType",
  "memoData",
  "partLabel",
  "partCategory",
  "realWidthMm",
  "realHeightMm",
  "inventoryCount",
  "partImageMode",
  "imageUrl",
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
    borderColor: "#3b82f6",
    borderScaleFactor: 1.5,
    cornerSize: 14,
    cornerStyle: "circle",
    padding: 8,
    borderOpacityWhenMoving: 0.8,
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
    fill: "rgba(255,255,255,0.88)",
    stroke: "rgba(0,0,0,0.06)",
    strokeWidth: 1,
    rx: 3,
    ry: 3,
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

export function reflowPartLabel(group) {
  if (group.partImageMode) return;
  const rect = group._objects?.[0];
  if (!rect || rect.type !== "rect" || rect.strokeWidth !== 2) return;

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
  const scale = Math.min(areaW / img.width, areaH / img.height) * 0.92;
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
  const objects = [];

  objects.push(
    new fabric.Rect({
      width,
      height,
      fill: def.fill || "rgba(255,255,255,0.95)",
      stroke: def.stroke || "#2563eb",
      strokeWidth: 2,
      rx: 4,
      ry: 4,
      originX: "center",
      originY: "center",
    })
  );

  scaleImageToFit(img, width - 8, height - CAPTION_H - 8);
  objects.push(img);

  const capW = width - 4;
  objects.push(
    new fabric.Rect({
      width: capW,
      height: CAPTION_H,
      fill: "rgba(255,255,255,0.95)",
      stroke: "rgba(0,0,0,0.08)",
      strokeWidth: 1,
      rx: 2,
      ry: 2,
      originX: "center",
      originY: "center",
      top: height / 2 - CAPTION_H / 2 - 1,
    })
  );

  const capText = new fabric.Textbox(label, {
    width: capW - 6,
    fontSize: Math.max(7, Math.min(9, capW / (label.length * 0.55))),
    fill: "#1e293b",
    fontWeight: "600",
    textAlign: "center",
    originX: "center",
    originY: "center",
    splitByGrapheme: true,
    lineHeight: 1.1,
    top: height / 2 - CAPTION_H / 2 - 1,
  });
  objects.push(capText);

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
        });
        group.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true });
        resolve(group);
      },
      { crossOrigin: "anonymous" }
    );
  });
}

export function normalizePartAfterResize(group) {
  if (group.objectType !== "part" || group.type !== "group") return;

  if (group.partImageMode && group.imageUrl) {
    const w = group.getScaledWidth();
    const h = group.getScaledHeight();
    const { left, top, angle } = group;
    const def = {
      id: group.partId,
      label: group.partLabel,
      category: group.partCategory,
      fill: group._objects?.[0]?.fill,
      stroke: group._objects?.[0]?.stroke,
      imageUrl: group.imageUrl,
    };
    fabric.Image.fromURL(group.imageUrl, (img) => {
      const objects = buildImagePartObjects(def, w, h, img);
      group._objects = objects;
      group.set({ scaleX: 1, scaleY: 1, left, top, angle, width: w, height: h });
      group.dirty = true;
      group.setCoords();
    }, { crossOrigin: "anonymous" });
    return;
  }

  const rect = group._objects?.find((o) => o.type === "rect" && o.strokeWidth === 2);
  if (!rect) return;

  const w = group.getScaledWidth();
  const h = group.getScaledHeight();
  const { left, top, angle } = group;

  rect.set({ width: w, height: h, scaleX: 1, scaleY: 1 });
  group.set({ scaleX: 1, scaleY: 1, left, top, angle });
  reflowPartLabel(group);
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

  objects.push(
    new fabric.Rect({
      width,
      height,
      fill: def.fill,
      stroke: def.stroke,
      strokeWidth: 2,
      rx: 4,
      ry: 4,
      originX: "center",
      originY: "center",
    })
  );

  if (def.mark) {
    objects.push(
      new fabric.Text(def.mark, {
        fontSize: def.mark === "✕" ? 26 : 20,
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
  const isMark = group._objects?.some(
    (o) => o.type === "text" && (o.text === "✕" || o.text === "○")
  );
  if (isMark) return;
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
  const rect = obj._objects?.find((o) => o.type === "rect" && o.strokeWidth === 2);
  if (rect) {
    rect.set({ fill, stroke });
    obj.dirty = true;
  }
}

export function serializeObjects(canvas) {
  return canvas.getObjects().map((o) => o.toObject(SERIALIZE_PROPS));
}
