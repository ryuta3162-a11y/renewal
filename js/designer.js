import { DRAWINGS, DEFAULT_PARTS, MASTER_PROJECT_ID } from "./constants.js";
import {
  refreshProjects,
  setCachedProjects,
  getCachedProjects,
  getProjectSheets,
  addImportedProposal,
} from "./projects.js";
import {
  enablePolygonFill,
  getFillStyle,
  snapPoint,
  setSnapEnabled,
} from "./draw-tools.js";
import { getInventoryParts, getCategoryOrder } from "./machine-inventory.js";
import {
  loadMachineManifest,
  attachImageToPart,
  enrichPartWithImage,
  getManifestHint,
} from "./machine-images.js";
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
  updatePartLabel,
  normalizePartAfterResize,
  upgradePartGroup,
  getSerializeProps,
  createPartBox,
} from "./objects.js";

const canvasWrap = document.getElementById("canvas-wrap");
const statusEl = document.getElementById("status");
const memoTooltip = document.getElementById("memo-tooltip");

let canvas;
let currentProjectId = MASTER_PROJECT_ID;
let currentSheets = DRAWINGS;
let currentDrawingId = null;
let currentPage = 1;
let totalPages = 1;
let polygonCleanup = null;
let activeTool = "select";
let pendingPart = null;
let isPanning = false;
let spaceDown = false;
let lastPan = null;
let placeStart = null;
let placePreview = null;
let memoPendingPos = null;
let editingMemo = null;
let drawingImage = null;
let autoSaveTimer = null;
let lastSavedAt = null;
const history = [];
const historyLimit = 50;

init();
async function init() {
  applyProControls();
  initCanvas();
  await loadMachineManifest();
  const projects = await refreshProjects();
  setCachedProjects(projects);
  buildProjectSelect();
  rebuildSheetSelect();
  setupToolbar();
  setupModals();
  setupProposalModal();
  setupPropsForm();
  setupDrawStyle();
  setupKeyboard();
  await rebuildPalette();
  await loadDrawing(currentSheets[0].id);
}

function initCanvas() {
  canvas = new fabric.Canvas("design-canvas", {
    selection: true,
    preserveObjectStacking: true,
    backgroundColor: "#374151",
    fireRightClick: true,
    stopContextMenu: true,
  });

  canvas.on("object:modified", (e) => {
    if (e.target?.objectType === "part") normalizePartAfterResize(e.target);
    pushHistory();
    updateProps();
    scheduleAutoSave();
  });
  canvas.on("object:added", (e) => {
    if (drawingImage && e.target && e.target !== drawingImage) {
      drawingImage.sendToBack();
    }
    if (!e.target?._skipHistory) {
      pushHistory();
      scheduleAutoSave();
    }
  });
  canvas.on("object:removed", () => {
    pushHistory();
    scheduleAutoSave();
  });
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
    scheduleAutoSave();
    e.preventDefault();
    e.stopPropagation();
  });

  canvas.on("mouse:down", onCanvasMouseDown);
  canvas.on("mouse:move", onCanvasMouseMove);
  canvas.on("mouse:up", onCanvasMouseUp);

  canvasWrap.addEventListener("contextmenu", (e) => e.preventDefault());
  canvasWrap.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", () => persistCurrent());
}

function resizeCanvas() {
  const rect = canvasWrap.getBoundingClientRect();
  canvas.setWidth(rect.width);
  canvas.setHeight(rect.height);
  canvas.requestRenderAll();
}

// ── Projects & sheets ───────────────────────────────
function buildProjectSelect() {
  const sel = document.getElementById("project-select");
  sel.onchange = () => switchProject(sel.value);
  populateProjectSelect(getCachedProjects());
}

function populateProjectSelect(projects) {
  const sel = document.getElementById("project-select");
  sel.innerHTML = "";
  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    const tag = p.type === "master" ? "" : p.author ? ` (${p.author})` : " (案)";
    opt.textContent = p.name + tag;
    sel.appendChild(opt);
  });
  if ([...sel.options].some((o) => o.value === currentProjectId)) {
    sel.value = currentProjectId;
  }
}

function rebuildSheetSelect() {
  const sel = document.getElementById("drawing-select");
  sel.innerHTML = "";
  currentSheets = getProjectSheets(currentProjectId);
  currentSheets.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  sel.onchange = () => switchDrawing(sel.value);
}

async function switchProject(projectId) {
  if (currentDrawingId) persistCurrent();
  currentProjectId = projectId;
  currentPage = 1;
  rebuildSheetSelect();
  if (currentSheets.length) await loadDrawing(currentSheets[0].id);
}

function getCurrentSheet(id) {
  return currentSheets.find((s) => s.id === id);
}

function isImageSheet(sheet) {
  return sheet.kind === "image" || /\.(png|jpe?g|webp)$/i.test(sheet.file || "");
}

async function switchDrawing(id) {
  if (currentDrawingId) persistCurrent();
  currentPage = 1;
  await loadDrawing(id);
}

async function loadSheetBackground(sheet) {
  if (isImageSheet(sheet)) {
    totalPages = 1;
    updatePageUI();
    const src = sheet.file.startsWith("data:") ? sheet.file : sheet.file;
    await loadDrawingImage(src);
    return;
  }
  const pdf = await pdfToDataUrl(sheet.file, currentPage, 2);
  totalPages = pdf.numPages;
  updatePageUI();
  await loadDrawingImage(pdf.dataUrl);
}

async function loadDrawing(id) {
  const sheet = getCurrentSheet(id);
  if (!sheet) return;
  setStatus("図面を読み込み中…");
  currentDrawingId = id;
  document.getElementById("drawing-select").value = id;
  try {
    canvas.clear();
    drawingImage = null;
    await loadSheetBackground(sheet);
    restoreDesign(pageKey());
    pushHistory(true);
    const proj = document.getElementById("project-select").selectedOptions[0]?.textContent || "";
    setStatus(`${proj} / ${sheet.name} — ページ ${currentPage}`);
  } catch (err) {
    setStatus("図面の読み込みに失敗しました");
    console.error(err);
  }
}

function loadDrawingImage(dataUrl) {
  return new Promise((resolve, reject) => {
    fabric.Image.fromURL(
      dataUrl,
      (img) => {
        if (!img) {
          reject(new Error("image load failed"));
          return;
        }
        img.set({
          objectType: "drawing",
          selectable: false,
          evented: true,
          hoverCursor: "grab",
          moveCursor: "grabbing",
          hasControls: false,
          hasBorders: false,
          lockRotation: true,
          lockScaling: true,
          lockMovement: true,
        });
        drawingImage = img;
        canvas.add(img);
        img.sendToBack();
        fitDrawing(true);
        resolve(img);
      },
      { crossOrigin: "anonymous" }
    );
  });
}

function fitDrawing(resetView = false) {
  if (!drawingImage) return;
  const pad = 32;
  const iw = drawingImage.width;
  const ih = drawingImage.height;
  const scale = Math.min(
    (canvas.getWidth() - pad * 2) / iw,
    (canvas.getHeight() - pad * 2) / ih
  );
  drawingImage.set({
    scaleX: scale,
    scaleY: scale,
    left: (canvas.getWidth() - iw * scale) / 2,
    top: (canvas.getHeight() - ih * scale) / 2,
  });
  if (resetView) canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.requestRenderAll();
}

function getUserObjects() {
  return canvas.getObjects().filter((o) => o.objectType !== "drawing");
}

function snapshotUserObjects() {
  return JSON.stringify(getUserObjects().map((o) => o.toObject(getSerializeProps())));
}

function shouldStartPan(opt) {
  const e = opt.e;
  if (e.button === 2) return false;
  if (e.button === 1) return true;
  if (activeTool === "pan" && e.button === 0) return true;
  if (spaceDown && e.button === 0) return true;
  if (activeTool === "select" && e.button === 0) {
    const t = opt.target;
    if (!t || t.objectType === "drawing") return true;
  }
  return false;
}

function startPan(e) {
  isPanning = true;
  lastPan = { x: e.clientX, y: e.clientY };
  canvas.selection = false;
  canvas.setCursor("grabbing");
  canvas.discardActiveObject();
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
  const sheet = getCurrentSheet(currentDrawingId);
  if (!sheet) return;
  updatePageUI();
  getUserObjects().forEach((o) => canvas.remove(o));
  if (drawingImage) canvas.remove(drawingImage);
  drawingImage = null;
  if (isImageSheet(sheet)) {
    await loadDrawingImage(sheet.file);
  } else {
    const pdf = await pdfToDataUrl(sheet.file, currentPage, 2);
    await loadDrawingImage(pdf.dataUrl);
  }
  restoreDesign(pageKey());
  setStatus(`${sheet.name} — ページ ${currentPage}`);
}

function pageKey() {
  return `${currentProjectId}-${currentDrawingId}-p${currentPage}`;
}

function getDrawStyle() {
  const color = document.getElementById("fill-color")?.value || "#fbbf24";
  const opacity = Number(document.getElementById("fill-opacity")?.value || 0.35);
  return getFillStyle(color, opacity);
}

function setupDrawStyle() {
  document.getElementById("snap-grid")?.addEventListener("change", (e) => {
    setSnapEnabled(e.target.checked);
  });
}

function setupProposalModal() {
  document.getElementById("btn-import-proposal")?.addEventListener("click", () => {
    document.getElementById("proposal-form").reset();
    document.getElementById("proposal-modal").showModal();
  });

  document.getElementById("proposal-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("proposal-name").value.trim();
    const author = document.getElementById("proposal-author").value.trim();
    const file = document.getElementById("proposal-image").files?.[0];
    if (!name || !file) return;

    const fileRef = await readFileAsDataURL(file);

    const entry = addImportedProposal({
      name,
      author,
      sheets: [
        {
          id: "sheet-1",
          name: name,
          file: fileRef,
          kind: file.type === "application/pdf" ? "pdf" : "image",
        },
      ],
    });

    document.getElementById("proposal-modal").close();
    const projects = await refreshProjects();
    setCachedProjects(projects);
    populateProjectSelect(projects);
    document.getElementById("project-select").value = entry.id;
    await switchProject(entry.id);
    flashStatus(`「${name}」を取り込みました`);
  });
}

// ── Palette ─────────────────────────────────────────
function getAllParts() {
  return [...getInventoryParts(), ...DEFAULT_PARTS, ...loadCustomParts()].map(attachImageToPart);
}

function getUseImagePref() {
  return localStorage.getItem("renewal-use-image") !== "false";
}

async function rebuildPalette() {
  const container = document.getElementById("palette");
  container.innerHTML = "";
  const parts = getAllParts();
  const order = getCategoryOrder();
  const cats = [
    ...order.filter((c) => parts.some((p) => p.category === c)),
    ...[...new Set(parts.map((p) => p.category))].filter((c) => !order.includes(c)),
  ];

  for (const cat of cats) {
    const section = document.createElement("div");
    section.className = "palette-section";
    section.innerHTML = `<h4>${cat}</h4><div class="palette-grid"></div>`;
    const grid = section.querySelector(".palette-grid");

    for (const def of parts.filter((p) => p.category === cat)) {
        const enriched = await enrichPartWithImage(attachImageToPart(def));
        const btn = document.createElement("button");
        btn.className = "palette-item";
        btn.dataset.partId = def.id;
        const countBadge = def.count ? `<span class="palette-count">${def.count}台</span>` : "";
        btn.title = def.note || `クリックで選択 → 図面上をドラッグして配置`;
        const thumb = enriched.hasImage
          ? `<img class="palette-thumb" src="${enriched.imageUrl}" alt="" />`
          : `<span class="palette-swatch" style="background:${def.fill};border-color:${def.stroke}"></span>`;
        btn.innerHTML = `
          ${thumb}
          <span class="palette-label">${esc(def.label)}</span>
          ${countBadge}
        `;
        btn.addEventListener("click", () => selectPart(enriched));
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
    }
    container.appendChild(section);
  }

  highlightSelectedPart();
}

async function selectPart(def) {
  const enriched = await enrichPartWithImage({
    ...attachImageToPart(def),
    useImage: getUseImagePref(),
  });
  pendingPart = enriched;
  setTool("place");
  flashStatus(`「${def.label}」— 図面上をドラッグしてサイズを決めて配置`);
  highlightSelectedPart();
  await showMachinePreview(enriched);
}

async function showMachinePreview(def) {
  const panel = document.getElementById("machine-preview-panel");
  const imgEl = document.getElementById("machine-preview-img");
  const placeholder = document.getElementById("machine-preview-placeholder");
  const hint = document.getElementById("machine-preview-hint");
  const useImageCb = document.getElementById("prop-use-image");

  if (!def || def.mark) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const enriched = await enrichPartWithImage(attachImageToPart(def));
  useImageCb.checked = enriched.hasImage && def.useImage !== false;

  if (enriched.hasImage) {
    imgEl.src = enriched.imageUrl;
    imgEl.hidden = false;
    placeholder.hidden = true;
    hint.textContent = "LPマシンラインナップ画像を自動表示中";
  } else {
    imgEl.hidden = true;
    placeholder.hidden = false;
    const fileHint = getManifestHint(def.label);
    placeholder.textContent = fileHint
      ? `画像未登録\nLPの画像を renewal/machines/ にコピーしてください\n（${fileHint}）`
      : "画像未登録（枠のみで配置されます）";
    hint.textContent = fileHint
      ? `GitHubにpushすれば「${def.label}」に自動表示されます`
      : "";
  }
}

function highlightSelectedPart() {
  document.querySelectorAll(".palette-item").forEach((btn) => {
    btn.classList.toggle("selected", pendingPart && btn.dataset.partId === pendingPart.id);
  });
}

// ── Canvas interaction ──────────────────────────────
function onCanvasMouseDown(opt) {
  const e = opt.e;
  if (activeTool === "line" || activeTool === "rect" || activeTool === "pen" || activeTool === "fill-poly") return;

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

  if (shouldStartPan(opt)) {
    if (e.button === 1) e.preventDefault();
    startPan(e);
    return;
  }

  if (activeTool === "place" && pendingPart && (!opt.target || opt.target?.objectType === "drawing")) {
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
    scheduleAutoSave();
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
    updateCanvasCursor();
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
    if (!confirm("配置・描画・メモをすべて消しますか？（図面は残ります）")) return;
    getUserObjects().forEach((o) => canvas.remove(o));
    pushHistory();
  });
  document.getElementById("btn-delete").addEventListener("click", deleteSelected);
  document.getElementById("btn-zoom-in").addEventListener("click", () => zoomCanvas(1.2));
  document.getElementById("btn-zoom-out").addEventListener("click", () => zoomCanvas(0.83));
  document.getElementById("btn-zoom-fit").addEventListener("click", () => {
    fitDrawing(true);
    flashStatus("全体表示に戻しました");
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
    canvas.skipTargetFind = true;
    enableShapeDraw(tool);
  } else if (tool === "fill-poly") {
    canvas.selection = false;
    canvas.skipTargetFind = true;
    polygonCleanup = enablePolygonFill(canvas, getDrawStyle, () => {
      polygonCleanup = null;
      pushHistory();
      setTool("select");
    });
    flashStatus("塗り：頂点をクリック → 始点で閉じる / Enterで確定 / Escで取消");
  } else if (tool === "place") {
    canvas.selection = false;
    canvas.skipTargetFind = false;
  } else if (tool === "pan") {
    canvas.skipTargetFind = true;
  } else {
    canvas.skipTargetFind = false;
  }
  updateCanvasCursor();
}

function updateCanvasCursor() {
  if (isPanning || spaceDown) {
    canvas.setCursor("grabbing");
    return;
  }
  if (activeTool === "pan") {
    canvas.setCursor("grab");
    return;
  }
  if (activeTool === "place") {
    canvas.setCursor("crosshair");
    return;
  }
  if (activeTool === "line" || activeTool === "rect" || activeTool === "fill-poly") {
    canvas.setCursor("crosshair");
    return;
  }
  canvas.setCursor("default");
}

let shapeHandler = null;

function enableShapeDraw(kind) {
  disableShapeDraw();
  let start = null;
  let shape = null;
  const rectStyle = () => ({ ...getDrawStyle(), objectType: "fillArea" });
  shapeHandler = (opt) => {
    const ptr = snapPoint(canvas.getPointer(opt.e), canvas, opt.e);
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
              ...rectStyle(),
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
      if (kind === "rect" && shape && (shape.width < 4 || shape.height < 4)) {
        canvas.remove(shape);
      }
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
  if (polygonCleanup) {
    polygonCleanup();
    polygonCleanup = null;
  }
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

  document.getElementById("prop-use-image")?.addEventListener("change", (e) => {
    const on = e.target.checked;
    localStorage.setItem("renewal-use-image", on);
    if (pendingPart) pendingPart.useImage = on;
  });

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
  if (!obj) return;

  if (obj.objectType === "fillArea") {
    if (field === "fill") {
      const color = document.getElementById("prop-fill").value;
      const opacity = Number(document.getElementById("fill-opacity")?.value || 0.35);
      const style = getFillStyle(color, opacity);
      obj.set({ fill: style.fill, stroke: style.stroke });
    }
    if (field === "stroke") {
      obj.set("stroke", document.getElementById("prop-stroke").value);
    }
    canvas.requestRenderAll();
    scheduleAutoSave();
    return;
  }

  if (obj.objectType !== "part") return;

  if (field === "label") {
    updatePartLabel(obj, document.getElementById("prop-label").value);
    scheduleAutoSave();
  }
  if (field === "width" || field === "height") {
    const tw = Number(document.getElementById("prop-width").value);
    const th = Number(document.getElementById("prop-height").value);
    if (tw > 0 && th > 0) resizePart(obj, tw, th);
    scheduleAutoSave();
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
  normalizePartAfterResize(obj);
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
    if (pendingPart) showMachinePreview(pendingPart);
    else document.getElementById("machine-preview-panel").hidden = true;
    return;
  }

  if (obj.objectType === "memo") {
    form.hidden = true;
    document.getElementById("machine-preview-panel").hidden = true;
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

  if (obj.objectType === "fillArea") {
    form.hidden = false;
    document.getElementById("machine-preview-panel").hidden = true;
    content.innerHTML = `<p class="prop-type">塗りつぶし</p>`;
    document.getElementById("prop-label").closest(".prop-field").hidden = true;
    document.querySelectorAll("#props-form .prop-row").forEach((row, i) => {
      row.hidden = i < 2;
    });
    document.getElementById("prop-rotation").closest(".prop-field").hidden = false;
    document.getElementById("prop-fill").value = rgbaToHex(obj.fill) || "#fbbf24";
    document.getElementById("prop-stroke").value = rgbToHex(obj.stroke) || "#fbbf24";
    document.getElementById("prop-width").value = Math.round(obj.getScaledWidth());
    document.getElementById("prop-height").value = Math.round(obj.getScaledHeight());
    document.getElementById("prop-rotation").value = Math.round(obj.angle || 0);
    document.getElementById("prop-rotation-val").textContent = `${Math.round(obj.angle || 0)}°`;
    return;
  }

  document.getElementById("prop-label").closest(".prop-field").hidden = false;
  document.querySelectorAll("#props-form .prop-row").forEach((row) => {
    row.hidden = false;
  });

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
    document.getElementById("prop-use-image").checked = !!obj.partImageMode;
    showMachinePreview({
      label: obj.partLabel,
      category: obj.partCategory,
      imageUrl: obj.imageUrl,
      useImage: obj.partImageMode,
      id: obj.partId,
    });
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
  const snap = snapshotUserObjects();
  if (history.length && history[history.length - 1] === snap) return;
  history.push(snap);
  if (history.length > historyLimit) history.shift();
}

function undo() {
  if (history.length < 2) return;
  history.pop();
  getUserObjects().forEach((o) => canvas.remove(o));
  const objs = JSON.parse(history[history.length - 1]);
  fabric.util.enlivenObjects(objs, (restored) => {
    restored.forEach((o) => canvas.add(o));
    if (drawingImage) drawingImage.sendToBack();
    canvas.requestRenderAll();
    updateProps();
  });
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    persistCurrent();
    showAutoSaved();
  }, 600);
}

function showAutoSaved() {
  lastSavedAt = new Date();
  const time = lastSavedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const base = statusEl.dataset.base || statusEl.textContent;
  statusEl.dataset.base = base;
  statusEl.textContent = `自動保存しました（${time}）`;
  setTimeout(() => {
    if (lastSavedAt && Date.now() - lastSavedAt.getTime() < 2500) {
      statusEl.textContent = statusEl.dataset.base || base;
    }
  }, 2000);
}

function persistCurrent() {
  if (!currentDrawingId) return;
  saveDesign(pageKey(), {
    objects: getUserObjects().map((o) => o.toObject(getSerializeProps())),
    viewport: canvas.viewportTransform?.slice() ?? [1, 0, 0, 1, 0, 0],
  });
}

function restoreDesign(key) {
  const data = loadDesign(key);
  if (!data) return;
  if (data.viewport?.length === 6) {
    canvas.setViewportTransform(data.viewport);
  }
  if (!data.objects?.length) return;
  fabric.util.enlivenObjects(data.objects, (objs) => {
    objs.forEach((o) => {
      upgradePartGroup(o);
      canvas.add(o);
    });
    if (drawingImage) drawingImage.sendToBack();
    canvas.requestRenderAll();
    scheduleAutoSave();
  });
}

function exportPng() {
  persistCurrent();
  const a = document.createElement("a");
  const sheet = getCurrentSheet(currentDrawingId);
  const name = sheet?.name ?? "design";
  a.download = `renewal-${currentProjectId}-${name}-p${currentPage}.png`;
  a.href = canvas.toDataURL({ format: "png", multiplier: 2 });
  a.click();
  flashStatus("PNGをダウンロードしました");
}

// ── Keyboard ──────────────────────────────────────
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.code === "Space") {
      spaceDown = true;
      e.preventDefault();
      updateCanvasCursor();
    }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    if (e.key === "v" || e.key === "V") setTool("select");
    if (e.key === "h" || e.key === "H") setTool("pan");
    if (e.key === "p" || e.key === "P") setTool("pen");
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceDown = false;
      isPanning = false;
      updateCanvasCursor();
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
  statusEl.dataset.base = msg;
}

function flashStatus(msg) {
  setStatus(msg);
  setTimeout(() => {
    const sheet = getCurrentSheet(currentDrawingId);
    if (sheet) {
      const proj = document.getElementById("project-select").selectedOptions[0]?.textContent || "";
      setStatus(`${proj} / ${sheet.name} — ページ ${currentPage}`);
    }
  }, 2500);
}

function rgbaToHex(color) {
  if (!color) return null;
  if (color.startsWith("#")) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}
