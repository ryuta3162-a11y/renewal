const SERIALIZE_PROPS = [
  "partId",
  "objectType",
  "memoData",
  "partLabel",
  "partCategory",
  "realWidthMm",
  "realHeightMm",
  "inventoryCount",
];

const LABEL_PAD = 5;

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

export function reflowPartLabel(group) {
  if (group.objectType !== "part" || group.type !== "group") return;
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

export function normalizePartAfterResize(group) {
  if (group.objectType !== "part" || group.type !== "group") return;
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
  reflowPartLabel(group);
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

  const group = new fabric.Group(objects, {
    left: x,
    top: y,
    originX: "center",
    originY: "center",
    partId: def.id,
    partLabel: label,
    partCategory: def.category,
    realWidthMm: def.realWidthMm || "",
    realHeightMm: def.realHeightMm || "",
    inventoryCount: def.count || null,
    objectType: "part",
    lockScalingFlip: true,
    subTargetCheck: false,
  });

  group.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true });
  return group;
}

export function createPartFromImage(def, x, y, w, h) {
  return new Promise((resolve) => {
    const width = w ?? def.w;
    const height = h ?? def.h;
    fabric.Image.fromURL(def.imageData, (img) => {
      img.set({
        scaleX: width / img.width,
        scaleY: height / img.height,
        originX: "center",
        originY: "center",
      });
      const group = new fabric.Group([img], {
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
      });
      group.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true });
      resolve(group);
    });
  });
}

export async function placePart(def, x, y, w, h) {
  if (def.imageData) return createPartFromImage(def, x, y, w, h);
  return createPartBox(def, x, y, w, h);
}

/** 保存済みの旧ラベルを折り返し表示に更新 */
export function upgradePartGroup(group) {
  if (group.objectType !== "part") return;
  const isMark = group._objects?.some(
    (o) => o.type === "text" && (o.text === "✕" || o.text === "○")
  );
  if (isMark) return;
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
