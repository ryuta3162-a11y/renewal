import { DRAWINGS, EQUIPMENT } from "./constants.js";
import { pdfToDataUrl } from "./pdf-loader.js";
import { saveDesign, loadDesign } from "./storage.js";

const canvasEl = document.getElementById("design-canvas");
const canvasWrap = document.getElementById("canvas-wrap");
const statusEl = document.getElementById("status");

let canvas;
let currentDrawingId = null;
let currentPage = 1;
let totalPages = 1;
let bgMeta = { width: 0, height: 0 };
let activeTool = "select";
const history = [];
const historyLimit = 40;

// ── Init ──────────────────────────────────────────────
initCanvas();
buildDrawingSelect();
buildPalette();
setupToolbar();
setupKeyboard();
loadDrawing(DRAWINGS[0].id);

function initCanvas() {
  canvas = new fabric.Canvas("design-canvas", {
    selection: true,
    preserveObjectStacking: true,
    backgroundColor: "#e5e7eb",
  });

  canvas.on("object:modified", pushHistory);
  canvas.on("object:added", (e) => {
    if (!e.target?._skipHistory) pushHistory();
  });
  canvas.on("selection:created", updateProps);
  canvas.on("selection:updated", updateProps);
  canvas.on("selection:cleared", updateProps);

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
    bgMeta = { width: pdf.width, height: pdf.height };
    updatePageUI();

    canvas.clear();
    canvas.setBackgroundImage(
      pdf.dataUrl,
      () => {
        fitBackground();
        restoreDesign(id);
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
  const pad = 40;
  const cw = canvas.getWidth() - pad * 2;
  const ch = canvas.getHeight() - pad * 2;
  const scale = Math.min(cw / bg.width, ch / bg.height);
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
  bgMeta = { width: pdf.width, height: pdf.height };
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
function buildPalette() {
  const container = document.getElementById("palette");
  const categories = [...new Set(Object.values(EQUIPMENT).map((e) => e.category))];

  categories.forEach((cat) => {
    const section = document.createElement("div");
    section.className = "palette-section";
    section.innerHTML = `<h4>${cat}</h4><div class="palette-grid"></div>`;
    const grid = section.querySelector(".palette-grid");

    Object.entries(EQUIPMENT)
      .filter(([, v]) => v.category === cat)
      .forEach(([key, def]) => {
        const btn = document.createElement("button");
        btn.className = "palette-item";
        btn.draggable = true;
        btn.title = "クリックまたはドラッグで配置";
        btn.innerHTML = `<span class="palette-swatch" style="background:${def.fill};border-color:${def.stroke}"></span>${def.label}`;
        btn.addEventListener("click", () => placeEquipment(key));
        btn.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("equipment", key);
          e.dataTransfer.effectAllowed = "copy";
        });
        grid.appendChild(btn);
      });

    container.appendChild(section);
  });

  canvasWrap.addEventListener("dragover", (e) => e.preventDefault());
  canvasWrap.addEventListener("drop", (e) => {
    e.preventDefault();
    const key = e.dataTransfer.getData("equipment");
    if (!key) return;
    const ptr = canvas.getPointer(e);
    placeEquipment(key, ptr.x, ptr.y);
  });
}

function makeEquipment(type, x, y) {
  const def = EQUIPMENT[type];
  const objects = [];

  const shapeOpts = {
    width: def.w,
    height: def.h,
    fill: def.fill,
    stroke: def.stroke,
    strokeWidth: 2,
    originX: "center",
    originY: "center",
  };

  if (def.round) {
    objects.push(new fabric.Circle({ ...shapeOpts, radius: def.w / 2 }));
  } else {
    objects.push(new fabric.Rect({ ...shapeOpts, rx: 4, ry: 4 }));
  }

  if (def.mark) {
    objects.push(
      new fabric.Text(def.mark, {
        fontSize: def.mark === "✕" ? 28 : 22,
        fill: def.stroke,
        fontWeight: "bold",
        originX: "center",
        originY: "center",
      })
    );
  } else {
    objects.push(
      new fabric.Text(def.label, {
        fontSize: 11,
        fill: "#1f2937",
        originX: "center",
        originY: "center",
      })
    );
  }

  const group = new fabric.Group(objects, {
    left: x ?? canvas.getWidth() / 2,
    top: y ?? canvas.getHeight() / 2,
    originX: "center",
    originY: "center",
    equipmentType: type,
    hasControls: true,
    hasBorders: true,
    lockScalingFlip: true,
  });

  if (def.editable) {
    group.set({ subTargetCheck: true });
  }

  return group;
}

function placeEquipment(type, x, y) {
  const obj = makeEquipment(type, x, y);
  obj._skipHistory = false;
  canvas.add(obj);
  canvas.setActiveObject(obj);
  setTool("select");
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
    if (!confirm("配置・描画をすべて消しますか？（図面は残ります）")) return;
    canvas.getObjects().forEach((o) => canvas.remove(o));
    pushHistory();
  });
  document.getElementById("btn-delete").addEventListener("click", deleteSelected);
  document.getElementById("btn-zoom-in").addEventListener("click", () => zoom(1.15));
  document.getElementById("btn-zoom-out").addEventListener("click", () => zoom(0.87));
  document.getElementById("btn-zoom-fit").addEventListener("click", () => {
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fitBackground();
  });

  document.getElementById("prop-rotation").addEventListener("input", (e) => {
    const obj = canvas.getActiveObject();
    if (!obj) return;
    obj.set("angle", Number(e.target.value));
    canvas.requestRenderAll();
  });
}

function setTool(tool) {
  activeTool = tool;
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });

  canvas.isDrawingMode = tool === "pen";
  canvas.selection = tool === "select";

  if (tool === "pen") {
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = "#ef4444";
    canvas.freeDrawingBrush.width = 3;
  }

  if (tool === "line" || tool === "rect" || tool === "text") {
    canvas.selection = false;
    canvas.defaultCursor = "crosshair";
    enableShapeDraw(tool);
  } else {
    canvas.defaultCursor = "default";
    disableShapeDraw();
  }
}

let shapeHandler = null;

function enableShapeDraw(kind) {
  disableShapeDraw();
  let start = null;
  let shape = null;

  shapeHandler = (opt) => {
    const ptr = canvas.getPointer(opt.e);
    if (opt.e.type === "mousedown" || opt.e.type === "touchstart") {
      start = ptr;
      if (kind === "text") {
        const text = prompt("テキストを入力");
        if (text) {
          const t = new fabric.Textbox(text, {
            left: ptr.x,
            top: ptr.y,
            fontSize: 16,
            fill: "#1e40af",
            width: 160,
          });
          canvas.add(t);
          pushHistory();
        }
        setTool("select");
        return;
      }
      if (kind === "line") {
        shape = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
          stroke: "#ef4444",
          strokeWidth: 3,
          selectable: true,
        });
      } else {
        shape = new fabric.Rect({
          left: ptr.x,
          top: ptr.y,
          width: 0,
          height: 0,
          fill: "rgba(239,68,68,0.1)",
          stroke: "#ef4444",
          strokeWidth: 2,
        });
      }
      canvas.add(shape);
    } else if ((opt.e.type === "mousemove" || opt.e.type === "touchmove") && start && shape) {
      if (kind === "line") {
        shape.set({ x2: ptr.x, y2: ptr.y });
      } else {
        shape.set({
          width: Math.abs(ptr.x - start.x),
          height: Math.abs(ptr.y - start.y),
          left: Math.min(ptr.x, start.x),
          top: Math.min(ptr.y, start.y),
        });
      }
      canvas.requestRenderAll();
    } else if (opt.e.type === "mouseup" || opt.e.type === "touchend") {
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
  const active = canvas.getActiveObjects();
  if (!active.length) return;
  active.forEach((o) => canvas.remove(o));
  canvas.discardActiveObject();
  pushHistory();
}

function zoom(factor) {
  const zoom = canvas.getZoom() * factor;
  canvas.setZoom(Math.max(0.3, Math.min(4, zoom)));
  canvas.requestRenderAll();
}

// ── History ─────────────────────────────────────────
function pushHistory(reset = false) {
  if (reset) {
    history.length = 0;
  }
  const json = JSON.stringify(canvas.toJSON(["equipmentType"]));
  if (history.length && history[history.length - 1] === json) return;
  history.push(json);
  if (history.length > historyLimit) history.shift();
}

function undo() {
  if (history.length < 2) return;
  history.pop();
  const prev = history[history.length - 1];
  canvas.loadFromJSON(prev, () => {
    canvas.requestRenderAll();
    fitBackground();
  });
}

// ── Persist ─────────────────────────────────────────
function persistCurrent() {
  if (!currentDrawingId) return;
  const data = {
    objects: canvas.getObjects().map((o) => o.toObject(["equipmentType"])),
  };
  saveDesign(pageKey(), data);
}

function restoreDesign(key) {
  const data = loadDesign(key);
  if (!data?.objects?.length) return;
  fabric.util.enlivenObjects(data.objects, (objs) => {
    objs.forEach((o) => canvas.add(o));
    canvas.requestRenderAll();
  });
}

// ── Export ────────────────────────────────────────────
function exportPng() {
  persistCurrent();
  const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
  const a = document.createElement("a");
  const name = DRAWINGS.find((d) => d.id === currentDrawingId)?.name ?? "design";
  a.download = `renewal-${name}-p${currentPage}.png`;
  a.href = dataUrl;
  a.click();
  flashStatus("PNGをダウンロードしました");
}

// ── Properties panel ────────────────────────────────
function updateProps() {
  const obj = canvas.getActiveObject();
  const panel = document.getElementById("props-content");
  if (!obj) {
    panel.innerHTML = `<p class="props-empty">オブジェクトを選択すると<br>回転・削除ができます</p>`;
    return;
  }
  const type = obj.equipmentType ? EQUIPMENT[obj.equipmentType]?.label : obj.type;
  document.getElementById("prop-rotation").value = Math.round(obj.angle || 0);
  panel.innerHTML = `
    <p class="prop-type">${type ?? "図形"}</p>
    <p class="prop-meta">位置: ${Math.round(obj.left)}, ${Math.round(obj.top)}</p>
    <p class="prop-meta">サイズ: ${Math.round(obj.getScaledWidth())} × ${Math.round(obj.getScaledHeight())}</p>
  `;
}

// ── Keyboard ────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undo();
    }
  });
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function flashStatus(msg) {
  setStatus(msg);
  setTimeout(() => {
    if (currentDrawingId) {
      const d = DRAWINGS.find((x) => x.id === currentDrawingId);
      setStatus(`${d?.name} — ページ ${currentPage}`);
    }
  }, 2000);
}
