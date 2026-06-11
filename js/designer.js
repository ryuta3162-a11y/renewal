import { DRAWINGS, DEFAULT_PARTS } from "./constants.js";
import { getInventoryParts, getCategoryOrder } from "./machine-inventory.js";
import { pdfToDataUrl } from "./pdf-loader.js";
import { saveDesign, loadDesign } from "./storage.js";
import {
  loadCustomParts,
  addCustomPart,
  deleteCustomPart,
  CATEGORY_COLORS,
} from "./parts-library.js";
import {
  applyProControls,
  placePart,
  createMemoPin,
  updatePartColors,
  getSerializeProps,
  createPartBox,
} from "./objects.js";

const canvasWrap = document.getElementById("canvas-wrap");
const statusEl = document.getElementById("status");
const memoTooltip = document.getElementById("memo-tooltip");

let canvas;
let currentDrawingId = null;
let currentPage = 1;
let totalPages = 1;
let activeTool = "select";
let pendingPart = null;
let isPanning = false;
let spaceDown = false;
let lastPan = null;
let placeStart = null;
let placePreview = null;
let memoPendingPos = null;
let editingMemo = null;
const history = [];
const historyLimit = 50;

init();
async function init() {
  applyProControls();
  initCanvas();
  buildDrawingSelect();
  setupToolbar();
  setupModals();
  setupPropsForm();
  setupKeyboard();
  rebuildPalette();
  await loadDrawing(DRAWINGS[0].id);
}

function initCanvas() {
  canvas = new fabric.Canvas("design-canvas", {
    selection: true,
    preserveObjectStacking: true,
    backgroundColor: "#374151",
    fireRightClick: true,
    stopContextMenu: true,
  });

  canvas.on("object:modified", () => { pushHistory(); updateProps(); });
  canvas.on("object:scaling", updatePropsLive);
  canvas.on("object:moving", updatePropsLive);
  canvas.on("object:rotating", updatePropsLive);
  canvas.on("selection:created", updateProps);
  canvas.on("selection:updated", updateProps);
  canvas.on("selection:cleared", updateProps);
  canvas.on("mouse:over", onObjectHover);
  canvas.on("mouse:out", onObjectOut);

  canvas.on("mouse:wheel", (opt) => {
    const e = opt.e;
    let z = canvas.getZoom() * 0.999 ** e.deltaY;
    z = Math.min(Math.max(z, 0.15), 10);
    canvas.zoomToPoint({ x: e.offsetX, y: e.offsetY }, z);
    e.preventDefault();
    e.stopPropagation();
  });

  canvas.on("mouse:down", onCanvasMouseDown);
  canvas.on("mouse:move", onCanvasMouseMove);
  canvas.on("mouse:up", onCanvasMouseUp);

  canvasWrap.addEventListener("contextmenu", (e) => e.preventDefault());
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas() {
  const rect = canvasWrap.getBoundingClientRect();
  canvas.setWidth(rect.width);
  canvas.setHeight(rect.height);
  canvas.requestRenderAll();
}

// ── Drawings ────────────────────────────────────────
function buildDrawingSelect() {
  const sel = document.getElementById("drawing-select");
  DRAWINGS.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.name;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => switchDrawing(sel.value));
}

async function switchDrawing(id) {
  if (currentDrawingId) persistCurrent();
  currentPage = 1;
  await loadDrawing(id);
}

async function loadDrawing(id) {
  const drawing = DRAWINGS.find((d) => d.id === id);
  if (!drawing) return;
  setStatus("図面を読み込み中…");
  currentDrawingId = id;
  document.getElementById("drawing-select").value = id;
  try {
    const pdf = await pdfToDataUrl(drawing.file, currentPage, 2);
    totalPages = pdf.numPages;
    updatePageUI();
    canvas.clear();
    canvas.setBackgroundImage(
      pdf.dataUrl,
      () => {
        fitBackground();
        restoreDesign(pageKey());
        pushHistory(true);
        setStatus(`${drawing.name} — ページ ${currentPage}`);
      },
      { originX: "left", originY: "top" }
    );
  } catch (err) {
    setStatus("図面の読み込みに失敗しました");
    console.error(err);
  }
}

function fitBackground() {
  const bg = canvas.backgroundImage;
  if (!bg) return;
  const pad = 32;
  const scale = Math.min(
    (canvas.getWidth() - pad * 2) / bg.width,
    (canvas.getHeight() - pad * 2) / bg.height
  );
  bg.set({
    scaleX: scale,
    scaleY: scale,
    left: (canvas.getWidth() - bg.width * scale) / 2,
    top: (canvas.getHeight() - bg.height * scale) / 2,
  });
  canvas.requestRenderAll();
}

function updatePageUI() {
  document.getElementById("page-info").textContent = `${currentPage} / ${totalPages}`;
  document.getElementById("btn-prev-page").disabled = currentPage <= 1;
  document.getElementById("btn-next-page").disabled = currentPage >= totalPages;
}

document.getElementById("btn-prev-page").addEventListener("click", async () => {
  if (currentPage <= 1) return;
  persistCurrent();
  currentPage--;
  await reloadPage();
});

document.getElementById("btn-next-page").addEventListener("click", async () => {
  if (currentPage >= totalPages) return;
  persistCurrent();
  currentPage++;
  await reloadPage();
});

async function reloadPage() {
  const drawing = DRAWINGS.find((d) => d.id === currentDrawingId);
  const pdf = await pdfToDataUrl(drawing.file, currentPage, 2);
  updatePageUI();
  canvas.getObjects().forEach((o) => canvas.remove(o));
  canvas.setBackgroundImage(
    pdf.dataUrl,
    () => {
      fitBackground();
      restoreDesign(pageKey());
      setStatus(`${drawing.name} — ページ ${currentPage}`);
    },
    { originX: "left", originY: "top" }
  );
}

function pageKey() {
  return `${currentDrawingId}-p${currentPage}`;
}

// ── Palette ─────────────────────────────────────────
function getAllParts() {
  return [...getInventoryParts(), ...DEFAULT_PARTS, ...loadCustomParts()];
}

function rebuildPalette() {
  const container = document.getElementById("palette");
  container.innerHTML = "";
  const parts = getAllParts();
  const order = getCategoryOrder();
  const cats = [
    ...order.filter((c) => parts.some((p) => p.category === c)),
    ...[...new Set(parts.map((p) => p.category))].filter((c) => !order.includes(c)),
  ];

  cats.forEach((cat) => {
    const section = document.createElement("div");
    section.className = "palette-section";
    section.innerHTML = `<h4>${cat}</h4><div class="palette-grid"></div>`;
    const grid = section.querySelector(".palette-grid");

    parts
      .filter((p) => p.category === cat)
      .forEach((def) => {
        const btn = document.createElement("button");
        btn.className = "palette-item";
        btn.dataset.partId = def.id;
        const countBadge = def.count ? `<span class="palette-count">${def.count}台</span>` : "";
        btn.title = def.note || `クリックで選択 → 図面上をドラッグして配置`;
        btn.innerHTML = `
          <span class="palette-swatch" style="background:${def.fill};border-color:${def.stroke}"></span>
          <span class="palette-label">${esc(def.label)}</span>
          ${countBadge}
        `;
        btn.addEventListener("click", () => selectPart(def));
        if (def.isCustom) {
          const del = document.createElement("span");
          del.className = "palette-del";
          del.textContent = "×";
          del.title = "パーツを削除";
          del.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`「${def.label}」をパレットから削除しますか？`)) {
              deleteCustomPart(def.id);
              if (pendingPart?.id === def.id) pendingPart = null;
              rebuildPalette();
            }
          });
          btn.appendChild(del);
        }
        grid.appendChild(btn);
      });
    container.appendChild(section);
  });

  highlightSelectedPart();
}

function selectPart(def) {
  pendingPart = def;
  setTool("place");
  flashStatus(`「${def.label}」— 図面上をドラッグしてサイズを決めて配置`);
  highlightSelectedPart();
}

function highlightSelectedPart() {
  document.querySelectorAll(".palette-item").forEach((btn) => {
    btn.classList.toggle("selected", pendingPart && btn.dataset.partId === pendingPart.id);
  });
}

// ── Canvas interaction ──────────────────────────────
function onCanvasMouseDown(opt) {
  const e = opt.e;
  if (activeTool === "line" || activeTool === "rect" || activeTool === "pen") return;

  if (e.button === 2) {
    const ptr = canvas.getPointer(e);
    if (opt.target?.objectType === "memo") {
      editingMemo = opt.target;
      openMemoModal(ptr, opt.target.memoData, opt.target);
    } else {
      memoPendingPos = ptr;
      editingMemo = null;
      openMemoModal(ptr);
    }
    return;
  }

  if (activeTool === "pan" || spaceDown) {
    isPanning = true;
    lastPan = { x: e.clientX, y: e.clientY };
    canvas.selection = false;
    canvas.defaultCursor = "grabbing";
    return;
  }

  if (activeTool === "place" && pendingPart && !opt.target) {
    placeStart = canvas.getPointer(e);
    placePreview = new fabric.Rect({
      left: placeStart.x,
      top: placeStart.y,
      width: 0,
      height: 0,
      fill: pendingPart.fill + "99",
      stroke: pendingPart.stroke,
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
    });
    canvas.add(placePreview);
    canvas.requestRenderAll();
  }
}

function onCanvasMouseMove(opt) {
  const e = opt.e;

  if (isPanning && lastPan) {
    const vpt = canvas.viewportTransform;
    vpt[4] += e.clientX - lastPan.x;
    vpt[5] += e.clientY - lastPan.y;
    lastPan = { x: e.clientX, y: e.clientY };
    canvas.requestRenderAll();
    return;
  }

  if (placeStart && placePreview) {
    const ptr = canvas.getPointer(e);
    placePreview.set({
      width: Math.abs(ptr.x - placeStart.x),
      height: Math.abs(ptr.y - placeStart.y),
      left: Math.min(ptr.x, placeStart.x),
      top: Math.min(ptr.y, placeStart.y),
    });
    canvas.requestRenderAll();
  }
}

async function onCanvasMouseUp(opt) {
  if (isPanning) {
    isPanning = false;
    lastPan = null;
    canvas.selection = activeTool === "select";
    canvas.defaultCursor = activeTool === "pan" ? "grab" : "default";
    return;
  }

  if (placeStart && placePreview && pendingPart) {
    const rawW = placePreview.width;
    const rawH = placePreview.height;
    const left = placePreview.left;
    const top = placePreview.top;
    const start = { ...placeStart };
    canvas.remove(placePreview);
    placePreview = null;
    placeStart = null;

    if (rawW > 12 && rawH > 12) {
      await addPartToCanvas(pendingPart, left + rawW / 2, top + rawH / 2, rawW, rawH);
    } else {
      await addPartToCanvas(pendingPart, start.x, start.y);
    }
    pushHistory();
    setTool("select");
  }
}

async function addPartToCanvas(def, x, y, w, h) {
  if (def.mark) {
    const obj = createPartBox(
      { ...def, label: def.mark, w: w ?? def.w, h: h ?? def.h },
      x,
      y,
      w,
      h
    );
    canvas.add(obj);
    canvas.setActiveObject(obj);
    return;
  }
  const obj = await placePart(def, x, y, w, h);
  canvas.add(obj);
  canvas.setActiveObject(obj);
}

// ── Memo tooltip ────────────────────────────────────
function onObjectHover(opt) {
  const obj = opt.target;
  if (obj?.objectType !== "memo") return;
  showMemoTooltip(opt.e, obj.memoData);
}

function onObjectOut(opt) {
  if (opt.target?.objectType === "memo") hideMemoTooltip();
}

function showMemoTooltip(e, data) {
  if (!data) return;
  const lines = [
    data.title && `<strong>${esc(data.title)}</strong>`,
    data.size && `サイズ: ${esc(data.size)}`,
    data.dimensions && `寸法: ${esc(data.dimensions)}`,
    data.colors && `色・仕様: ${esc(data.colors)}`,
    data.content && esc(data.content),
  ].filter(Boolean);

  memoTooltip.innerHTML = lines.join("<br>");
  memoTooltip.hidden = false;
  positionTooltip(e);
}

function positionTooltip(e) {
  const wrap = canvasWrap.getBoundingClientRect();
  memoTooltip.style.left = `${e.clientX - wrap.left + 12}px`;
  memoTooltip.style.top = `${e.clientY - wrap.top + 12}px`;
}

function hideMemoTooltip() {
  memoTooltip.hidden = true;
}

// ── Modals ──────────────────────────────────────────
function setupModals() {
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest("dialog").close());
  });

  document.getElementById("btn-new-part").addEventListener("click", () => {
    document.getElementById("part-form").reset();
    document.getElementById("new-part-fill").value = "#dbeafe";
    document.getElementById("new-part-stroke").value = "#2563eb";
    document.getElementById("part-modal").showModal();
  });

  document.getElementById("new-part-category").addEventListener("change", (e) => {
    const c = CATEGORY_COLORS[e.target.value];
    if (c) {
      document.getElementById("new-part-fill").value = c.fill;
      document.getElementById("new-part-stroke").value = c.stroke;
    }
  });

  document.getElementById("part-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const imageInput = document.getElementById("new-part-image");
    let imageData = null;
    if (imageInput.files?.[0]) {
      imageData = await readFileAsDataURL(imageInput.files[0]);
    }
    const part = addCustomPart({
      label: document.getElementById("new-part-label").value.trim(),
      category: document.getElementById("new-part-category").value,
      w: document.getElementById("new-part-w").value,
      h: document.getElementById("new-part-h").value,
      fill: document.getElementById("new-part-fill").value,
      stroke: document.getElementById("new-part-stroke").value,
      realWidthMm: document.getElementById("new-part-mm-w").value,
      realHeightMm: document.getElementById("new-part-mm-h").value,
      note: document.getElementById("new-part-note").value,
      imageData,
    });
    document.getElementById("part-modal").close();
    rebuildPalette();
    selectPart(part);
    flashStatus(`「${part.label}」を登録しました`);
  });

  document.getElementById("memo-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      title: document.getElementById("memo-title").value.trim() || "メモ",
      content: document.getElementById("memo-content").value.trim(),
      size: document.getElementById("memo-size").value.trim(),
      colors: document.getElementById("memo-colors").value.trim(),
      dimensions: document.getElementById("memo-dimensions").value.trim(),
    };

    if (editingMemo) {
      editingMemo.set("memoData", data);
      canvas.requestRenderAll();
    } else if (memoPendingPos) {
      const pin = createMemoPin(memoPendingPos.x, memoPendingPos.y, data);
      canvas.add(pin);
    }
    document.getElementById("memo-modal").close();
    memoPendingPos = null;
    editingMemo = null;
    pushHistory();
  });

  document.getElementById("memo-delete").addEventListener("click", () => {
    if (editingMemo) {
      canvas.remove(editingMemo);
      editingMemo = null;
      document.getElementById("memo-modal").close();
      pushHistory();
    }
  });
}

function openMemoModal(ptr, data = null, target = null) {
  editingMemo = target;
  memoPendingPos = target ? null : ptr;
  document.getElementById("memo-title").value = data?.title ?? "";
  document.getElementById("memo-content").value = data?.content ?? "";
  document.getElementById("memo-size").value = data?.size ?? "";
  document.getElementById("memo-colors").value = data?.colors ?? "";
  document.getElementById("memo-dimensions").value = data?.dimensions ?? "";
  document.getElementById("memo-delete").hidden = !target;
  document.getElementById("memo-modal").showModal();
}

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

// ── Tools ───────────────────────────────────────────
function setupToolbar() {
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });
  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-save").addEventListener("click", () => {
    persistCurrent();
    flashStatus("保存しました");
  });
  document.getElementById("btn-export").addEventListener("click", exportPng);
  document.getElementById("btn-clear-objects").addEventListener("click", () => {
    if (!confirm("配置・描画・メモをすべて消しますか？")) return;
    canvas.getObjects().forEach((o) => canvas.remove(o));
    pushHistory();
  });
  document.getElementById("btn-delete").addEventListener("click", deleteSelected);
  document.getElementById("btn-zoom-in").addEventListener("click", () => zoomCanvas(1.2));
  document.getElementById("btn-zoom-out").addEventListener("click", () => zoomCanvas(0.83));
  document.getElementById("btn-zoom-fit").addEventListener("click", () => {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fitBackground();
  });
}

function setTool(tool) {
  activeTool = tool;
  disableShapeDraw();
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });

  canvas.isDrawingMode = tool === "pen";
  canvas.selection = tool === "select";

  if (tool === "pen") {
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = "#ef4444";
    canvas.freeDrawingBrush.width = 2;
  }

  if (tool === "line" || tool === "rect") {
    canvas.selection = false;
    canvas.defaultCursor = "crosshair";
    enableShapeDraw(tool);
  } else if (tool === "place") {
    canvas.selection = false;
    canvas.defaultCursor = "crosshair";
  } else if (tool === "pan") {
    canvas.defaultCursor = "grab";
  } else {
    canvas.defaultCursor = "default";
  }
}

let shapeHandler = null;

function enableShapeDraw(kind) {
  disableShapeDraw();
  let start = null;
  let shape = null;
  shapeHandler = (opt) => {
    const ptr = canvas.getPointer(opt.e);
    const t = opt.e.type;
    if (t === "mousedown") {
      start = ptr;
      shape =
        kind === "line"
          ? new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], { stroke: "#ef4444", strokeWidth: 2 })
          : new fabric.Rect({
              left: ptr.x,
              top: ptr.y,
              width: 0,
              height: 0,
              fill: "rgba(239,68,68,0.08)",
              stroke: "#ef4444",
              strokeWidth: 2,
            });
      canvas.add(shape);
    } else if (t === "mousemove" && start && shape) {
      if (kind === "line") shape.set({ x2: ptr.x, y2: ptr.y });
      else
        shape.set({
          width: Math.abs(ptr.x - start.x),
          height: Math.abs(ptr.y - start.y),
          left: Math.min(ptr.x, start.x),
          top: Math.min(ptr.y, start.y),
        });
      canvas.requestRenderAll();
    } else if (t === "mouseup") {
      start = null;
      shape = null;
      pushHistory();
      setTool("select");
    }
  };
  canvas.on("mouse:down", shapeHandler);
  canvas.on("mouse:move", shapeHandler);
  canvas.on("mouse:up", shapeHandler);
}

function disableShapeDraw() {
  if (!shapeHandler) return;
  canvas.off("mouse:down", shapeHandler);
  canvas.off("mouse:move", shapeHandler);
  canvas.off("mouse:up", shapeHandler);
  shapeHandler = null;
}

function deleteSelected() {
  canvas.getActiveObjects().forEach((o) => canvas.remove(o));
  canvas.discardActiveObject();
  pushHistory();
  updateProps();
}

function zoomCanvas(factor) {
  const z = Math.min(Math.max(canvas.getZoom() * factor, 0.15), 10);
  canvas.zoomToPoint({ x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 }, z);
}

// ── Properties ────────────────────────────────────
function setupPropsForm() {
  const bind = (id, fn) => document.getElementById(id)?.addEventListener("input", fn);

  bind("prop-label", () => applyPropToSelection("label"));
  bind("prop-width", () => applyPropToSelection("width"));
  bind("prop-height", () => applyPropToSelection("height"));
  bind("prop-mm-w", () => applyPropToSelection("mmW"));
  bind("prop-mm-h", () => applyPropToSelection("mmH"));
  bind("prop-fill", () => applyPropToSelection("fill"));
  bind("prop-stroke", () => applyPropToSelection("stroke"));
  bind("prop-rotation", () => applyPropToSelection("rotation"));
}

function applyPropToSelection(field) {
  const obj = canvas.getActiveObject();
  if (!obj || obj.objectType !== "part") return;

  if (field === "label") {
    obj.set("partLabel", document.getElementById("prop-label").value);
    const text = obj._objects?.find((o) => o.type === "text");
    if (text) text.set("text", document.getElementById("prop-label").value);
    obj.dirty = true;
  }
  if (field === "width" || field === "height") {
    const tw = Number(document.getElementById("prop-width").value);
    const th = Number(document.getElementById("prop-height").value);
    if (tw > 0 && th > 0) resizePart(obj, tw, th);
  }
  if (field === "mmW") obj.set("realWidthMm", document.getElementById("prop-mm-w").value);
  if (field === "mmH") obj.set("realHeightMm", document.getElementById("prop-mm-h").value);
  if (field === "fill" || field === "stroke") {
    updatePartColors(obj, document.getElementById("prop-fill").value, document.getElementById("prop-stroke").value);
  }
  if (field === "rotation") {
    const deg = Number(document.getElementById("prop-rotation").value);
    obj.set("angle", deg);
    document.getElementById("prop-rotation-val").textContent = `${deg}°`;
  }
  canvas.requestRenderAll();
}

function resizePart(obj, tw, th) {
  const cw = obj.getScaledWidth();
  const ch = obj.getScaledHeight();
  if (!cw || !ch) return;
  obj.set({ scaleX: (obj.scaleX * tw) / cw, scaleY: (obj.scaleY * th) / ch });
}

function updatePropsLive() {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  document.getElementById("prop-width").value = Math.round(obj.getScaledWidth());
  document.getElementById("prop-height").value = Math.round(obj.getScaledHeight());
  document.getElementById("prop-rotation").value = Math.round(obj.angle || 0);
  document.getElementById("prop-rotation-val").textContent = `${Math.round(obj.angle || 0)}°`;
}

function updateProps() {
  const obj = canvas.getActiveObject();
  const content = document.getElementById("props-content");
  const form = document.getElementById("props-form");

  if (!obj) {
    content.innerHTML = `<p class="props-empty">オブジェクトを選択すると<br>詳細を編集できます</p>`;
    form.hidden = true;
    return;
  }

  if (obj.objectType === "memo") {
    form.hidden = true;
    const d = obj.memoData || {};
    content.innerHTML = `
      <p class="prop-type">微光メモ</p>
      <p class="prop-meta">${esc(d.title || "メモ")}</p>
      <p class="prop-meta">${esc(d.content || "")}</p>
      <button class="btn btn-ghost btn-block btn-sm" id="btn-edit-memo">メモを編集</button>
    `;
    document.getElementById("btn-edit-memo")?.addEventListener("click", () => {
      openMemoModal(null, d, obj);
    });
    return;
  }

  if (obj.objectType === "part") {
    const countLine = obj.inventoryCount
      ? `<p class="prop-meta">現状在庫: ${obj.inventoryCount}台</p>`
      : "";
    content.innerHTML = `
      <p class="prop-type">${esc(obj.partLabel || "パーツ")}</p>
      <p class="prop-meta">${esc(obj.partCategory || "")}</p>
      ${countLine}
    `;
    form.hidden = false;
    document.getElementById("prop-label").value = obj.partLabel || "";
    document.getElementById("prop-width").value = Math.round(obj.getScaledWidth());
    document.getElementById("prop-height").value = Math.round(obj.getScaledHeight());
    document.getElementById("prop-mm-w").value = obj.realWidthMm || "";
    document.getElementById("prop-mm-h").value = obj.realHeightMm || "";
    const rect = obj._objects?.find((o) => o.type === "rect");
    document.getElementById("prop-fill").value = rgbToHex(rect?.fill) || "#dbeafe";
    document.getElementById("prop-stroke").value = rgbToHex(rect?.stroke) || "#2563eb";
    document.getElementById("prop-rotation").value = Math.round(obj.angle || 0);
    document.getElementById("prop-rotation-val").textContent = `${Math.round(obj.angle || 0)}°`;
    return;
  }

  form.hidden = true;
  content.innerHTML = `
    <p class="prop-type">${obj.type}</p>
    <p class="prop-meta">${Math.round(obj.getScaledWidth())} × ${Math.round(obj.getScaledHeight())} px</p>
  `;
}

// ── History & persist ─────────────────────────────
function pushHistory(reset = false) {
  if (reset) history.length = 0;
  const snap = JSON.stringify(canvas.toJSON(getSerializeProps()));
  if (history.length && history[history.length - 1] === snap) return;
  history.push(snap);
  if (history.length > historyLimit) history.shift();
}

function undo() {
  if (history.length < 2) return;
  history.pop();
  const bg = canvas.backgroundImage;
  canvas.loadFromJSON(history[history.length - 1], () => {
    if (bg) canvas.setBackgroundImage(bg, canvas.requestRenderAll.bind(canvas));
    canvas.requestRenderAll();
    updateProps();
  });
}

function persistCurrent() {
  if (!currentDrawingId) return;
  saveDesign(pageKey(), {
    objects: canvas.getObjects().map((o) => o.toObject(getSerializeProps())),
  });
}

function restoreDesign(key) {
  const data = loadDesign(key);
  if (!data?.objects?.length) return;
  fabric.util.enlivenObjects(data.objects, (objs) => {
    objs.forEach((o) => canvas.add(o));
    canvas.requestRenderAll();
  });
}

function exportPng() {
  persistCurrent();
  const a = document.createElement("a");
  const name = DRAWINGS.find((d) => d.id === currentDrawingId)?.name ?? "design";
  a.download = `renewal-${name}-p${currentPage}.png`;
  a.href = canvas.toDataURL({ format: "png", multiplier: 2 });
  a.click();
  flashStatus("PNGをダウンロードしました");
}

// ── Keyboard ──────────────────────────────────────
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.code === "Space") { spaceDown = true; e.preventDefault(); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    if (e.key === "v" || e.key === "V") setTool("select");
    if (e.key === "p" || e.key === "P") setTool("pen");
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceDown = false;
      isPanning = false;
      if (activeTool !== "pan") canvas.defaultCursor = "default";
    }
  });
}

// ── Utils ───────────────────────────────────────
function rgbToHex(color) {
  if (!color || color.startsWith("#")) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#000000";
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function flashStatus(msg) {
  setStatus(msg);
  setTimeout(() => {
    const d = DRAWINGS.find((x) => x.id === currentDrawingId);
    if (d) setStatus(`${d.name} — ページ ${currentPage}`);
  }, 2500);
}
