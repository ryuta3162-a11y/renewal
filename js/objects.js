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

export function createPartBox(def, x, y, w, h) {
  const width = w ?? def.w;
  const height = h ?? def.h;
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

  const label = def.label || "パーツ";
  const fontSize = Math.max(8, Math.min(12, width / Math.max(label.length * 0.5, 4)));
  objects.push(
    new fabric.Text(label, {
      fontSize,
      fill: "#111827",
      fontWeight: "600",
      originX: "center",
      originY: "center",
    })
  );

  const group = new fabric.Group(objects, {
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
  const rect = obj._objects?.find((o) => o.type === "rect");
  if (rect) {
    rect.set({ fill, stroke });
    obj.dirty = true;
  }
}

export function serializeObjects(canvas) {
  return canvas.getObjects().map((o) => o.toObject(SERIALIZE_PROPS));
}
