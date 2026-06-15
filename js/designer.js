import { DRAWINGS, DEFAULT_PARTS, MASTER_PROJECT_ID, MACHINES_UI_ENABLED, DEFAULT_PLAN_WIDTH_MM } from "./constants.js";
import {
  refreshProjects,
  setCachedProjects,
  getCachedProjects,
  getProjectSheets,
  addImportedProposal,
} from "./projects.js";
import {
  snapPoint,
  setSnapEnabled,
} from "./draw-tools.js";
import {
  ZONE_PRESETS,
  getAllZonePresets,
  enableZoneDraw,
  updateZoneLabel,
  updateZoneColors,
  upgradeZoneObject,
  removeOrphanZonePreviews,
  refreshZoneDisplay,
  ensureZoneDimensionMarkers,
} from "./zones.js";
import {
  addCustomZonePreset,
  updateCustomZonePreset,
  deleteCustomZonePreset,
} from "./zone-custom-presets.js";
import { getInventoryParts, getCategoryOrder } from "./machine-inventory.js";
import {
  loadMachineManifest,
  attachImageToPart,
  enrichPartWithImage,
  getManifestHint,
} from "./machine-images.js";
import { pdfToDataUrl } from "./pdf-loader.js";
import {
  canvasToImagePx,
  imagePxDistance,
  mmPerImagePxFromCalibration,
  computeZoneMetrics,
  computeZoneMetricsFromCanvasPoints,
  segmentMetrics,
  formatZoneSizeText,
  formatZoneSizeShort,
  formatScaleStatus,
  formatEdgeLength,
} from "./drawing-scale.js";
import {
  captureDrawingState,
  applyDrawingTransform,
  syncUserObjectsToDrawing,
  configureDrawingResize,
} from "./drawing-transform.js";
import { saveDesign, loadDesign } from "./storage.js";
import {
  loadCustomParts,
  addCustomPart,
  deleteCustomPart,
  CATEGORY_COLORS,
} from "./parts-library.js";
import {
  applyProControls,
  applyInteractiveControls,
  getPartBodyRect,
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
const zoneTooltip = document.getElementById("zone-tooltip");
const drawDimHud = document.getElementById("draw-dim-hud");

let canvas;
let currentProjectId = MASTER_PROJECT_ID;
let currentSheets = DRAWINGS;
let currentDrawingId = null;
let currentPage = 1;
let totalPages = 1;
let polygonCleanup = null;
let activeTool = "zone";
let pendingZonePreset = ZONE_PRESETS[0];
let pendingPart = null;
let isPanning = false;
let spaceDown = false;
let lastPan = null;
let placeStart = null;
let placePreview = null;
let zoneTapStart = null;
let memoPendingPos = null;
let editingMemo = null;
let editingZone = null;
let zoneActionTarget = null;
let editingCustomPresetId = null;
let drawingImage = null;
let drawingTransformBefore = null;
let currentMmPerImagePx = null;
let scaleCalibCleanup = null;
let autoSaveTimer = null;
let lastSavedAt = null;
const history = [];
const historyLimit = 50;
let isRestoringHistory = false;

init();
async function init() {
  applyProControls();
  initCanvas();
  if (MACHINES_UI_ENABLED) await loadMachineManifest();
  const projects = await refreshProjects();
  setCachedProjects(projects);
  buildProjectSelect();
  rebuildSheetSelect();
  setupToolbar();
  setupModals();
  setupProposalModal();
  setupPropsForm();
  setupDrawStyle();
  setupZoneUI();
  setupKeyboard();
  if (MACHINES_UI_ENABLED) await rebuildPalette();
  await loadDrawing(currentSheets[0].id);
  setTool("zone");
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
    if (isRestoringHistory) return;
    if (e.target?.objectType === "drawing") {
      onDrawingTransformEnd();
      return;
    }
    if (e.target?.objectType === "part") {
      enforceMinPartSize(e.target);
      normalizePartAfterResize(e.target);
    }
    if (e.target?.objectType === "zone") {
      refreshZoneOnCanvas(e.target, computeZoneMetricsFor(e.target));
      refreshZoneHooksList();
    }
    if (e.target) applyInteractiveControls(e.target);
    pushHistory();
    updateProps();
    scheduleAutoSave();
  });
  canvas.on("object:added", (e) => {
    if (drawingImage && e.target && e.target !== drawingImage) {
      drawingImage.sendToBack();
    }
    if (e.target?.objectType === "zone") refreshZoneHooksList();
    if (!isRestoringHistory && !e.target?._skipHistory) {
      pushHistory();
      scheduleAutoSave();
    }
  });
  canvas.on("object:removed", (e) => {
    if (isRestoringHistory) return;
    if (e.target?.objectType === "zone") refreshZoneHooksList();
    pushHistory();
    scheduleAutoSave();
  });
  canvas.on("object:scaling", (e) => {
    if (e.target?.objectType === "drawing" && !drawingTransformBefore) {
      drawingTransformBefore = captureDrawingState(drawingImage);
    }
    if (e.target?.objectType === "zone") {
      refreshZoneOnCanvas(e.target, computeZoneMetricsFor(e.target));
    }
    if (e.target) applyInteractiveControls(e.target);
    updatePropsLive();
  });
  canvas.on("before:transform", (e) => {
    if (e.transform?.target?.objectType === "drawing" && !drawingTransformBefore) {
      drawingTransformBefore = captureDrawingState(drawingImage);
    }
  });
  canvas.on("object:moving", (e) => {
    if (e.target?.objectType === "zone") {
      refreshZoneOnCanvas(e.target, computeZoneMetricsFor(e.target));
    }
    updatePropsLive();
  });
  canvas.on("object:rotating", updatePropsLive);
  canvas.on("selection:created", (e) => {
    e.selected?.forEach(applyInteractiveControls);
    updateProps();
  });
  canvas.on("selection:updated", (e) => {
    e.selected?.forEach(applyInteractiveControls);
    updateProps();
  });
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

function getSheetPdfFile(sheet, pageNum = currentPage) {
  if (sheet.pages?.length) return sheet.pages[Math.min(pageNum, sheet.pages.length) - 1];
  return sheet.file;
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
  const pdf = await pdfToDataUrl(getSheetPdfFile(sheet), 1, 2);
  if (!sheet.pages?.length) totalPages = pdf.numPages;
  else totalPages = sheet.pages.length;
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
    isRestoringHistory = true;
    canvas.clear();
    drawingImage = null;
    polygonCleanup = null;
    await loadSheetBackground(sheet);
    await restoreDesign(pageKey());
    if (!currentMmPerImagePx) tryDefaultScale();
    refreshAllZoneMetrics();
    updateScaleUI();
    if (currentMmPerImagePx) scheduleAutoSave();
    pushHistory(true);
    isRestoringHistory = false;
    applyMachinesVisibility();
    refreshZoneHooksList();
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
          originX: "left",
          originY: "top",
          objectCaching: false,
        });
        drawingImage = img;
        canvas.add(img);
        img.sendToBack();
        configureDrawingResize(img, activeTool === "select");
        resolve(img);
      },
      { crossOrigin: "anonymous" }
    );
  });
}

function fitDrawing(resetView = false) {
  if (!drawingImage) return;
  const before = captureDrawingState(drawingImage);
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
  drawingImage.setCoords();
  const after = captureDrawingState(drawingImage);
  if (getUserObjects().length) {
    syncUserObjectsToDrawing(canvas, getUserObjects, before, after);
    refreshAllZoneMetrics();
  }
  if (resetView) canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.requestRenderAll();
}

function updateDrawingInteractivity() {
  configureDrawingResize(drawingImage, activeTool === "select");
  canvas?.requestRenderAll();
}

function onDrawingTransformEnd() {
  if (!drawingImage || !drawingTransformBefore) return;
  const after = captureDrawingState(drawingImage);
  syncUserObjectsToDrawing(canvas, getUserObjects, drawingTransformBefore, after);
  drawingTransformBefore = null;
  refreshAllZoneMetrics();
  refreshZoneHooksList();
  pushHistory();
  updateProps();
  scheduleAutoSave();
  canvas.requestRenderAll();
}

function applySavedDrawingTransform(t) {
  if (!drawingImage || !t) return false;
  applyDrawingTransform(drawingImage, t);
  configureDrawingResize(drawingImage, activeTool === "select");
  return true;
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
    if (!t) return true;
    if (t.objectType === "drawing") return false;
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
  isRestoringHistory = true;
  getUserObjects().forEach((o) => canvas.remove(o));
  if (drawingImage) canvas.remove(drawingImage);
  drawingImage = null;
  if (isImageSheet(sheet)) {
    await loadDrawingImage(sheet.file);
  } else {
    const pdf = await pdfToDataUrl(getSheetPdfFile(sheet), 1, 2);
    await loadDrawingImage(pdf.dataUrl);
  }
  await restoreDesign(pageKey());
  if (!currentMmPerImagePx) tryDefaultScale();
  refreshAllZoneMetrics();
  updateScaleUI();
  if (currentMmPerImagePx) scheduleAutoSave();
  pushHistory(true);
  isRestoringHistory = false;
  setStatus(`${sheet.name} — ページ ${currentPage}`);
}

function pageKey() {
  return `${currentProjectId}-${currentDrawingId}-p${currentPage}`;
}

function setupDrawStyle() {
  document.getElementById("snap-grid")?.addEventListener("change", (e) => {
    setSnapEnabled(e.target.checked);
  });
}

function setupZoneUI() {
  buildZoneHooks();
  setupZoneModal();
  setupZoneActionModal();
  setupCustomPresetModal();
  setupScaleUI();

  document.getElementById("btn-hooks-expand-all")?.addEventListener("click", () => {
    setAllHooksCollapsed(false);
  });
  document.getElementById("btn-hooks-collapse-all")?.addEventListener("click", () => {
    setAllHooksCollapsed(true);
  });

  document.getElementById("btn-clear-zones")?.addEventListener("click", () => {
    if (!confirm("区画をすべて消しますか？")) return;
    canvas.getObjects().filter((o) => o.objectType === "zone").forEach((o) => canvas.remove(o));
    pushHistory();
    refreshZoneHooksList();
  });
}

function refreshZoneOnCanvas(zone, metrics) {
  refreshZoneDisplay(zone, metrics, drawingImage, currentMmPerImagePx);
}

function computeZoneMetricsFor(zone) {
  return computeZoneMetrics(zone, drawingImage, currentMmPerImagePx);
}

function refreshAllZoneMetrics() {
  getZonesOnCanvas().forEach((zone) => {
    ensureZoneDimensionMarkers(zone);
    refreshZoneOnCanvas(zone, computeZoneMetricsFor(zone));
  });
  canvas?.requestRenderAll();
}

function showDrawDimHud(metrics) {
  if (!drawDimHud) return;
  if (!metrics) {
    drawDimHud.hidden = true;
    return;
  }
  drawDimHud.textContent = formatEdgeLength(metrics);
  drawDimHud.hidden = false;
}

function hideDrawDimHud() {
  if (drawDimHud) drawDimHud.hidden = true;
}

function tryDefaultScale() {
  if (currentMmPerImagePx || !drawingImage?.width) return false;
  const sheet = getCurrentSheet(currentDrawingId);
  const planWidth = sheet?.planWidthMm ?? DEFAULT_PLAN_WIDTH_MM;
  currentMmPerImagePx = planWidth / drawingImage.width;
  return true;
}

function ensureDrawingScale() {
  if (currentMmPerImagePx) return true;
  const applied = tryDefaultScale();
  if (applied) {
    updateScaleUI();
    scheduleAutoSave();
  }
  return !!currentMmPerImagePx;
}

function updateScaleUI() {
  const el = document.getElementById("scale-status");
  if (el) el.textContent = formatScaleStatus(currentMmPerImagePx);
}

function setupScaleUI() {
  document.getElementById("btn-scale-calibrate")?.addEventListener("click", () => {
    const mm = parseFloat(document.getElementById("scale-known-mm")?.value);
    if (!mm || mm <= 0) {
      flashStatus("既知の距離（mm）を入力してください");
      return;
    }
    if (!drawingImage) {
      flashStatus("図面を読み込んでから設定してください");
      return;
    }
    startScaleCalibration(mm);
  });
}

function startScaleCalibration(realMm) {
  if (scaleCalibCleanup) scaleCalibCleanup();
  if (polygonCleanup) {
    polygonCleanup();
    polygonCleanup = null;
  }
  removeOrphanZonePreviews(canvas);

  const points = [];
  let previewLine = null;
  const dots = [];

  const cleanup = () => {
    canvas.off("mouse:down", handler);
    canvas.off("mouse:move", handler);
    document.removeEventListener("keydown", keyHandler);
    dots.forEach((d) => canvas.remove(d));
    if (previewLine) canvas.remove(previewLine);
    canvas.requestRenderAll();
    scaleCalibCleanup = null;
  };

  scaleCalibCleanup = cleanup;

  const handler = (opt) => {
    const e = opt.e;
    const ptr = canvas.getPointer(e);

    if (e.type === "mousemove" && points.length === 1) {
      if (previewLine) canvas.remove(previewLine);
      previewLine = new fabric.Line([points[0].x, points[0].y, ptr.x, ptr.y], {
        stroke: "#f59e0b",
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        _skipHistory: true,
        _scalePreview: true,
      });
      canvas.add(previewLine);
      canvas.requestRenderAll();
    }

    if (e.type !== "mousedown" || e.button !== 0) return;

    points.push(ptr);
    const dot = new fabric.Circle({
      left: ptr.x,
      top: ptr.y,
      radius: 5,
      fill: "#f59e0b",
      stroke: "#fff",
      strokeWidth: 2,
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
      _skipHistory: true,
      _scalePreview: true,
    });
    dots.push(dot);
    canvas.add(dot);

    if (points.length === 2) {
      const ip1 = canvasToImagePx(points[0], drawingImage);
      const ip2 = canvasToImagePx(points[1], drawingImage);
      const dist = imagePxDistance(ip1, ip2);
      currentMmPerImagePx = mmPerImagePxFromCalibration(dist, realMm);
      cleanup();
      refreshAllZoneMetrics();
      updateScaleUI();
      refreshZoneHooksList();
      pushHistory();
      scheduleAutoSave();
      flashStatus(`縮尺を設定しました（${formatScaleStatus(currentMmPerImagePx)}）`);
    }
    canvas.requestRenderAll();
  };

  const keyHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cleanup();
      flashStatus("縮尺設定をキャンセルしました");
    }
  };

  canvas.on("mouse:down", handler);
  canvas.on("mouse:move", handler);
  document.addEventListener("keydown", keyHandler);
  flashStatus("縮尺: 図面上の2点をクリック（Escでキャンセル）");
}

const HOOK_STATE_KEY = "renewal-zone-hook-collapsed";

function loadHookCollapsedState() {
  try {
    const raw = localStorage.getItem(HOOK_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHookCollapsedState(map) {
  localStorage.setItem(HOOK_STATE_KEY, JSON.stringify(map));
}

function buildZoneHooks() {
  const customContainer = document.getElementById("zone-custom-hooks");
  const standardContainer = document.getElementById("zone-hooks");
  if (!standardContainer) return;

  const collapsed = loadHookCollapsedState();
  customContainer.innerHTML = "";
  standardContainer.innerHTML = "";

  const customs = getAllZonePresets().filter((p) => p.isCustom);
  if (!customs.length) {
    customContainer.innerHTML = `<p class="zone-custom-empty">「＋ 追加」で名称・色を自由に設定</p>`;
  } else {
    customs.forEach((preset) => {
      customContainer.appendChild(createZoneHookElement(preset, collapsed, true));
    });
  }

  ZONE_PRESETS.forEach((preset) => {
    standardContainer.appendChild(createZoneHookElement(preset, collapsed, false));
  });

  if (!Object.keys(collapsed).length) {
    const first =
      customContainer.querySelector(".zone-hook") || standardContainer.querySelector(".zone-hook");
    first?.classList.remove("collapsed");
    first?.querySelector(".zone-hook-header")?.setAttribute("aria-expanded", "true");
  }

  if (!pendingZonePreset) pendingZonePreset = ZONE_PRESETS[0];
  updateZoneActiveLabel();
  refreshZoneHooksList();
}

function createZoneHookElement(preset, collapsed, isCustom) {
  const hook = document.createElement("section");
  hook.className = "zone-hook" + (isCustom ? " zone-hook-custom" : "");
  hook.dataset.presetId = preset.id;
  if (collapsed[preset.id]) hook.classList.add("collapsed");
  if (preset.id === pendingZonePreset?.id) hook.classList.add("active");

  const customActions = isCustom
    ? `<button type="button" class="zone-hook-edit" title="区分を編集">✎</button>
       <button type="button" class="zone-hook-del" title="区分を削除">×</button>`
    : "";

  hook.innerHTML = `
    <button type="button" class="zone-hook-header" aria-expanded="${!collapsed[preset.id]}">
      <span class="zone-hook-bar" style="background:${preset.color}"></span>
      <span class="zone-hook-title">${esc(preset.name)}</span>
      <span class="zone-hook-count" data-count-for="${preset.id}">0</span>
      ${customActions}
      <span class="zone-hook-chevron">▼</span>
    </button>
    <div class="zone-hook-body">
      <p class="zone-hook-desc">${esc(preset.desc || "")}</p>
      <button type="button" class="btn btn-primary btn-sm btn-block btn-draw-zone">区画を描く</button>
      <ul class="zone-hook-list" data-list-for="${preset.id}"></ul>
    </div>
  `;

  const header = hook.querySelector(".zone-hook-header");
  header.addEventListener("click", (e) => {
    if (e.target.closest(".btn-draw-zone, .zone-hook-edit, .zone-hook-del")) return;
    const isCollapsed = hook.classList.toggle("collapsed");
    header.setAttribute("aria-expanded", String(!isCollapsed));
    const state = loadHookCollapsedState();
    state[preset.id] = isCollapsed;
    saveHookCollapsedState(state);
    selectZonePreset(preset, false);
  });

  hook.querySelector(".btn-draw-zone").addEventListener("click", (e) => {
    e.stopPropagation();
    hook.classList.remove("collapsed");
    header.setAttribute("aria-expanded", "true");
    const state = loadHookCollapsedState();
    state[preset.id] = false;
    saveHookCollapsedState(state);
    selectZonePreset(preset, true);
  });

  hook.querySelector(".zone-hook-edit")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openCustomPresetModal(preset);
  });

  hook.querySelector(".zone-hook-del")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!confirm(`自作区分「${preset.name}」を一覧から削除しますか？\n（図面上の区画は残ります）`)) return;
    deleteCustomZonePreset(preset.id);
    if (pendingZonePreset?.id === preset.id) pendingZonePreset = ZONE_PRESETS[0];
    buildZoneHooks();
    flashStatus(`「${preset.name}」を一覧から削除しました`);
  });

  return hook;
}

function setupCustomPresetModal() {
  document.getElementById("btn-add-zone-preset")?.addEventListener("click", () => {
    openCustomPresetModal(null);
  });

  document.getElementById("custom-preset-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("custom-preset-name").value.trim();
    if (!name) return;
    const data = {
      name,
      color: document.getElementById("custom-preset-color").value,
      opacity: Number(document.getElementById("custom-preset-opacity").value),
      desc: document.getElementById("custom-preset-desc").value.trim() || "自作の区画区分",
    };

    let preset;
    if (editingCustomPresetId) {
      preset = updateCustomZonePreset(editingCustomPresetId, data);
    } else {
      preset = addCustomZonePreset(data);
    }

    document.getElementById("custom-preset-modal").close();
    editingCustomPresetId = null;
    buildZoneHooks();
    if (preset) selectZonePreset(preset, true);
    flashStatus(`「${name}」を保存しました`);
  });

  document.getElementById("custom-preset-delete")?.addEventListener("click", () => {
    if (!editingCustomPresetId) return;
    const id = editingCustomPresetId;
    const name = document.getElementById("custom-preset-name").value.trim();
    if (!confirm(`自作区分「${name}」を削除しますか？`)) return;
    deleteCustomZonePreset(id);
    document.getElementById("custom-preset-modal").close();
    editingCustomPresetId = null;
    if (pendingZonePreset?.id === id) pendingZonePreset = ZONE_PRESETS[0];
    buildZoneHooks();
  });
}

function openCustomPresetModal(preset) {
  editingCustomPresetId = preset?.id ?? null;
  document.getElementById("custom-preset-modal-title").textContent = preset
    ? "自作区分を編集"
    : "自作区分を追加";
  document.getElementById("custom-preset-name").value = preset?.name ?? "";
  document.getElementById("custom-preset-color").value = preset?.color ?? "#a78bfa";
  document.getElementById("custom-preset-opacity").value = preset?.opacity ?? 0.3;
  document.getElementById("custom-preset-desc").value =
    preset?.desc && preset.desc !== "自作の区画区分" ? preset.desc : "";
  document.getElementById("custom-preset-delete").hidden = !preset;
  document.getElementById("custom-preset-modal").showModal();
}

function setAllHooksCollapsed(collapsed) {
  const state = {};
  document.querySelectorAll(".zone-hook").forEach((hook) => {
    hook.classList.toggle("collapsed", collapsed);
    hook.querySelector(".zone-hook-header")?.setAttribute("aria-expanded", String(!collapsed));
    state[hook.dataset.presetId] = collapsed;
  });
  saveHookCollapsedState(state);
}

function getZonesOnCanvas() {
  return canvas?.getObjects().filter((o) => o.objectType === "zone") ?? [];
}

function refreshZoneHooksList() {
  if (!canvas) return;
  const zones = getZonesOnCanvas();
  const allPresets = getAllZonePresets();
  const counts = Object.fromEntries(allPresets.map((p) => [p.id, 0]));

  zones.forEach((z) => {
    if (!z.zoneInstanceId) z.set("zoneInstanceId", crypto.randomUUID());
    const id = resolveZonePresetId(z, allPresets);
    if (counts[id] !== undefined) counts[id]++;
    else counts.other = (counts.other || 0) + 1;
  });

  allPresets.forEach((preset) => {
    const countEl = document.querySelector(`[data-count-for="${preset.id}"]`);
    if (countEl) countEl.textContent = String(counts[preset.id] || 0);

    const list = document.querySelector(`[data-list-for="${preset.id}"]`);
    if (!list) return;
    list.innerHTML = "";

    const matched = zones.filter((z) => resolveZonePresetId(z, allPresets) === preset.id);

    if (!matched.length) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "zone-hook-item empty";
      btn.textContent = "まだ区画なし（何個でも追加可）";
      li.appendChild(btn);
      list.appendChild(li);
      return;
    }

    matched.forEach((zone, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "zone-hook-item";
      const memo = zone.zoneMemo?.trim();
      const baseName = zone.zoneName || preset.name;
      const numTag = matched.length > 1 ? ` #${i + 1}` : "";
      const sizeTag = formatZoneSizeShort(zone._zoneMetrics);
      const sizeSuffix = sizeTag ? ` · ${sizeTag}` : "";
      btn.textContent = memo
        ? `${baseName}${numTag}${sizeSuffix} — ${memo.slice(0, 12)}${memo.length > 12 ? "…" : ""}`
        : `${baseName}${numTag}${sizeSuffix}`;
      btn.addEventListener("click", () => {
        canvas.setActiveObject(zone);
        canvas.requestRenderAll();
        openZoneAction(zone);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  });
}

function resolveZonePresetId(zone, allPresets = getAllZonePresets()) {
  if (zone.zonePresetId && allPresets.some((p) => p.id === zone.zonePresetId)) {
    return zone.zonePresetId;
  }
  const byName = allPresets.find((p) => p.name === zone.zoneName);
  return byName?.id || "other";
}

function selectZonePreset(preset, startDraw = true) {
  pendingZonePreset = preset;
  highlightZonePreset();
  updateZoneActiveLabel();
  if (startDraw) setTool("zone");
  else flashStatus(`「${preset.name}」を選択中`);
}

function highlightZonePreset() {
  document.querySelectorAll(".zone-hook").forEach((hook) => {
    hook.classList.toggle("active", hook.dataset.presetId === pendingZonePreset?.id);
  });
}

function updateZoneActiveLabel() {
  const el = document.getElementById("zone-active-label");
  if (el && pendingZonePreset) el.textContent = pendingZonePreset.name;
}

function setupZoneModal() {
  document.getElementById("zone-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("zone-name").value.trim();
    const memo = document.getElementById("zone-memo").value.trim();
    if (!name) return;

    if (editingZone) {
      editingZone.set({ zoneName: name, zoneMemo: memo });
      refreshZoneOnCanvas(editingZone, computeZoneMetricsFor(editingZone));
      canvas.requestRenderAll();
    }
    document.getElementById("zone-modal").close();
    editingZone = null;
    pushHistory();
    scheduleAutoSave();
    refreshZoneHooksList();
  });

  document.getElementById("zone-delete")?.addEventListener("click", () => {
    if (editingZone) deleteZone(editingZone);
  });
}

function setupZoneActionModal() {
  document.getElementById("zone-action-edit")?.addEventListener("click", () => {
    if (!zoneActionTarget) return;
    document.getElementById("zone-action-modal").close();
    openZoneModal(zoneActionTarget);
  });

  document.getElementById("zone-action-delete")?.addEventListener("click", () => {
    if (zoneActionTarget) deleteZone(zoneActionTarget);
  });

  document.getElementById("zone-action-modal")?.addEventListener("close", () => {
    zoneActionTarget = null;
  });
}

function openZoneAction(zone) {
  if (!zone) return;
  zoneActionTarget = zone;
  editingZone = null;
  document.getElementById("zone-action-title").textContent = zone.zoneName || "区画";
  const memoEl = document.getElementById("zone-action-memo");
  const memo = zone.zoneMemo?.trim();
  if (memo) {
    memoEl.textContent = memo;
    memoEl.classList.remove("empty");
  } else {
    memoEl.textContent = "メモはまだありません";
    memoEl.classList.add("empty");
  }
  document.getElementById("zone-action-modal").showModal();
}

function deleteZone(zone) {
  if (!zone) return;
  const name = zone.zoneName || "区画";
  if (!confirm(`「${name}」を削除しますか？`)) return;

  canvas.remove(zone);
  if (editingZone === zone) editingZone = null;
  if (zoneActionTarget === zone) zoneActionTarget = null;
  canvas.discardActiveObject();
  document.getElementById("zone-action-modal")?.close();
  document.getElementById("zone-modal")?.close();
  pushHistory();
  refreshZoneHooksList();
  scheduleAutoSave();
  updateProps();
  flashStatus(`「${name}」を削除しました`);
}

function openZoneModal(zone) {
  editingZone = zone;
  document.getElementById("zone-name").value = zone.zoneName || "";
  document.getElementById("zone-memo").value = zone.zoneMemo || "";
  document.getElementById("zone-delete").hidden = !zone;
  document.getElementById("zone-modal").showModal();
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
  if (!MACHINES_UI_ENABLED) return;
  const container = document.getElementById("palette");
  if (!container) return;
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
  if (!MACHINES_UI_ENABLED) return;
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
  if (!MACHINES_UI_ENABLED) return;
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

function cancelZoneDrawing() {
  if (polygonCleanup) {
    polygonCleanup();
    polygonCleanup = null;
  }
  removeOrphanZonePreviews(canvas);
  setTool("select");
  flashStatus("区画描画をやめました（右クリック / Esc）");
}

// ── Canvas interaction ──────────────────────────────
function onCanvasMouseDown(opt) {
  const e = opt.e;

  if (activeTool === "zone" && e.button === 2) {
    e.preventDefault();
    cancelZoneDrawing();
    return;
  }

  if (activeTool === "line" || activeTool === "pen" || activeTool === "zone") return;

  if (e.button === 0 && activeTool === "select" && opt.target?.objectType === "zone") {
    zoneTapStart = { x: e.clientX, y: e.clientY, target: opt.target };
    return;
  }

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

  if (MACHINES_UI_ENABLED && activeTool === "place" && pendingPart && (!opt.target || opt.target?.objectType === "drawing")) {
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
  if (zoneTapStart && activeTool === "select") {
    const e = opt.e;
    const moved = Math.hypot(e.clientX - zoneTapStart.x, e.clientY - zoneTapStart.y);
    if (moved < 6 && opt.target?.objectType === "zone") {
      canvas.setActiveObject(opt.target);
      openZoneAction(opt.target);
    }
    zoneTapStart = null;
  }

  if (isPanning) {
    isPanning = false;
    lastPan = null;
    canvas.selection = activeTool === "select";
    updateCanvasCursor();
    return;
  }

  if (placeStart && placePreview && pendingPart && MACHINES_UI_ENABLED) {
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
  let obj;
  if (def.mark) {
    obj = createPartBox(
      { ...def, label: def.mark, w: w ?? def.w, h: h ?? def.h },
      x,
      y,
      w,
      h
    );
  } else {
    obj = await placePart(def, x, y, w, h);
  }
  canvas.add(obj);
  applyInteractiveControls(obj);
  canvas.setActiveObject(obj);
}

// ── Memo tooltip ────────────────────────────────────
function onObjectHover(opt) {
  const obj = opt.target;
  if (obj?.objectType === "memo") {
    showMemoTooltip(opt.e, obj.memoData);
    return;
  }
  if (obj?.objectType === "zone") {
    showZoneTooltip(opt.e, obj);
    return;
  }
}

function onObjectOut(opt) {
  if (opt.target?.objectType === "memo") hideMemoTooltip();
  if (opt.target?.objectType === "zone") hideZoneTooltip();
}

function showZoneTooltip(e, zone) {
  const memo = zone.zoneMemo?.trim();
  const sizeLine = formatZoneSizeText(zone._zoneMetrics);
  const sizeHtml = sizeLine
    ? `<span class="zone-tip-size">${esc(sizeLine.replace("\n", " / "))}</span>`
    : `<span style="color:var(--muted)">縮尺未設定 — 左パネルで設定</span>`;
  zoneTooltip.innerHTML = memo
    ? `<strong>${esc(zone.zoneName || "区画")}</strong>${sizeHtml}${esc(memo)}`
    : `<strong>${esc(zone.zoneName || "区画")}</strong>${sizeHtml}<span style="color:var(--muted)">クリックで修正・削除</span>`;
  zoneTooltip.hidden = false;
  const wrap = canvasWrap.getBoundingClientRect();
  zoneTooltip.style.left = `${e.clientX - wrap.left + 12}px`;
  zoneTooltip.style.top = `${e.clientY - wrap.top + 12}px`;
}

function hideZoneTooltip() {
  zoneTooltip.hidden = true;
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

  document.getElementById("btn-new-part")?.addEventListener("click", () => {
    document.getElementById("part-form").reset();
    document.getElementById("new-part-fill").value = "#dbeafe";
    document.getElementById("new-part-stroke").value = "#2563eb";
    document.getElementById("part-modal").showModal();
  });

  document.getElementById("new-part-category")?.addEventListener("change", (e) => {
    const c = CATEGORY_COLORS[e.target.value];
    if (c) {
      document.getElementById("new-part-fill").value = c.fill;
      document.getElementById("new-part-stroke").value = c.stroke;
    }
  });

  document.getElementById("part-form")?.addEventListener("submit", async (e) => {
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
  document.getElementById("btn-clear-objects")?.addEventListener("click", () => {
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

  if (tool === "line") {
    canvas.selection = false;
    canvas.skipTargetFind = true;
    enableShapeDraw(tool);
  } else if (tool === "zone") {
    ensureDrawingScale();
    canvas.selection = false;
    canvas.skipTargetFind = true;
    polygonCleanup = enableZoneDraw(
      canvas,
      () => pendingZonePreset,
      (zone) => {
        polygonCleanup = null;
        if (!zone) {
          setTool("select");
          return;
        }
        ensureDrawingScale();
        pushHistory();
        applyInteractiveControls(zone);
        ensureZoneDimensionMarkers(zone);
        refreshZoneOnCanvas(zone, computeZoneMetricsFor(zone));
        refreshZoneHooksList();
        canvas.requestRenderAll();
        openZoneModal(zone);
        setTool("select");
      },
      (points) => computeZoneMetricsFromCanvasPoints(points, drawingImage, currentMmPerImagePx),
      (a, b) => segmentMetrics(a, b, drawingImage, currentMmPerImagePx),
      (metrics) => showDrawDimHud(metrics)
    );
    flashStatus(`「${pendingZonePreset.name}」— 角クリックで囲む / 右クリック・Escでやめる`);
  } else if (tool === "place" && MACHINES_UI_ENABLED) {
    canvas.selection = false;
    canvas.skipTargetFind = false;
  } else if (tool === "pan") {
    canvas.skipTargetFind = true;
  } else {
    canvas.skipTargetFind = false;
  }
  updateCanvasCursor();
  updateDrawingInteractivity();
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
  if (MACHINES_UI_ENABLED && activeTool === "place") {
    canvas.setCursor("crosshair");
    return;
  }
  if (activeTool === "line" || activeTool === "zone") {
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
  let liveDimLabel = null;

  shapeHandler = (opt) => {
    const ptr = snapPoint(canvas.getPointer(opt.e), canvas, opt.e);
    const t = opt.e.type;
    if (t === "mousedown") {
      start = ptr;
      shape = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
        stroke: "#ef4444",
        strokeWidth: 2,
        selectable: false,
        evented: false,
        _skipHistory: true,
      });
      canvas.add(shape);
    } else if (t === "mousemove" && start && shape) {
      shape.set({ x2: ptr.x, y2: ptr.y });
      const metrics = segmentMetrics(start, ptr, drawingImage, currentMmPerImagePx);
      showDrawDimHud(metrics);
      const text = formatEdgeLength(metrics);
      const mx = (start.x + ptr.x) / 2;
      const my = (start.y + ptr.y) / 2;
      if (!liveDimLabel) {
        liveDimLabel = new fabric.Text(text, {
          left: mx,
          top: my - 8,
          fontSize: 11,
          fill: "#1e40af",
          fontWeight: "600",
          backgroundColor: "rgba(255,255,255,0.9)",
          originX: "center",
          originY: "bottom",
          selectable: false,
          evented: false,
          _skipHistory: true,
        });
        canvas.add(liveDimLabel);
      } else {
        liveDimLabel.set({ text, left: mx, top: my - 8 });
      }
      canvas.requestRenderAll();
    } else if (t === "mouseup" && start && shape) {
      const x1 = start.x;
      const y1 = start.y;
      const x2 = ptr.x;
      const y2 = ptr.y;
      const metrics = segmentMetrics(start, ptr, drawingImage, currentMmPerImagePx);
      canvas.remove(shape);
      if (liveDimLabel) canvas.remove(liveDimLabel);
      hideDrawDimHud();

      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const line = new fabric.Line([x1 - cx, y1 - cy, x2 - cx, y2 - cy], {
        stroke: "#ef4444",
        strokeWidth: 2,
      });
      const label = new fabric.Text(formatEdgeLength(metrics), {
        left: 0,
        top: -10,
        fontSize: 11,
        fill: "#1e40af",
        fontWeight: "600",
        backgroundColor: "rgba(255,255,255,0.9)",
        originX: "center",
        originY: "bottom",
      });
      const group = new fabric.Group([line, label], {
        left: cx,
        top: cy,
        originX: "center",
        originY: "center",
        objectType: "measureLine",
      });
      canvas.add(group);
      canvas.setActiveObject(group);

      start = null;
      shape = null;
      liveDimLabel = null;
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
  hideDrawDimHud();
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
    if (!MACHINES_UI_ENABLED) return;
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

  if (obj.objectType === "zone" || obj.objectType === "fillArea") {
    if (field === "label") {
      obj.set("zoneName", document.getElementById("prop-label").value.trim());
      updateZoneLabel(obj);
    }
    if (field === "fill") {
      updateZoneColors(obj, document.getElementById("prop-fill").value, obj.zoneOpacity);
    }
    canvas.requestRenderAll();
    scheduleAutoSave();
    updateProps();
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
  if (!cw || !ch || tw < 16 || th < 16) return;
  obj.set({ scaleX: (obj.scaleX * tw) / cw, scaleY: (obj.scaleY * th) / ch });
  enforceMinPartSize(obj);
  normalizePartAfterResize(obj);
  applyInteractiveControls(obj);
}

function enforceMinPartSize(obj) {
  if (obj?.objectType !== "part") return;
  const min = 16;
  const w = obj.getScaledWidth();
  const h = obj.getScaledHeight();
  if (w >= min && h >= min) return;
  const factor = Math.max(min / Math.max(w, 1), min / Math.max(h, 1));
  obj.set({ scaleX: obj.scaleX * factor, scaleY: obj.scaleY * factor });
  obj.setCoords();
}

function updatePropsLive() {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  if (obj.objectType === "drawing") {
    updateProps();
    return;
  }
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
    if (MACHINES_UI_ENABLED && pendingPart) showMachinePreview(pendingPart);
    return;
  }

  if (obj.objectType === "drawing") {
    form.hidden = true;
    const pct = Math.round((obj.scaleX || 1) * 100);
    const w = Math.round(obj.getScaledWidth());
    const h = Math.round(obj.getScaledHeight());
    content.innerHTML = `
      <p class="prop-type">図面</p>
      <p class="prop-meta">表示倍率: <strong>${pct}%</strong></p>
      <p class="prop-meta">表示サイズ: ${w} × ${h} px</p>
      <p class="prop-meta" style="color:var(--muted);line-height:1.5">四隅をドラッグで拡大縮小。区画・測定線・㎡表示も自動で連動します。</p>
      <button class="btn btn-ghost btn-block btn-sm" id="btn-fit-drawing">全体にフィット</button>
    `;
    document.getElementById("btn-fit-drawing")?.addEventListener("click", () => {
      fitDrawing(true);
      pushHistory();
      scheduleAutoSave();
      updateProps();
      flashStatus("図面を全体表示に戻しました");
    });
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

  if (obj.objectType === "zone" || obj.objectType === "fillArea") {
    if (obj.objectType === "fillArea") upgradeZoneObject(obj);
    applyInteractiveControls(obj);
    form.hidden = false;
    const memo = obj.zoneMemo?.trim();
    const metrics = obj._zoneMetrics;
    const sizeBlock = metrics
      ? `<p class="prop-meta zone-size-meta">${esc(formatZoneSizeText(metrics).replace("\n", " · "))}</p>`
      : `<p class="prop-meta" style="color:var(--muted)">サイズ: 縮尺未設定</p>`;
    content.innerHTML = `
      <p class="prop-type">区画</p>
      <p class="prop-meta">${esc(obj.zoneName || "区画")}</p>
      ${sizeBlock}
      ${memo ? `<p class="prop-meta">${esc(memo)}</p>` : `<p class="prop-meta" style="color:var(--muted)">メモなし</p>`}
      <div class="zone-prop-actions">
        <button class="btn btn-primary btn-sm" id="btn-edit-zone">✎ 修正</button>
        <button class="btn btn-danger btn-sm zone-delete-btn" id="btn-delete-zone" title="削除">🗑</button>
      </div>
    `;
    document.getElementById("btn-edit-zone")?.addEventListener("click", () => openZoneModal(obj));
    document.getElementById("btn-delete-zone")?.addEventListener("click", () => deleteZone(obj));
    document.getElementById("prop-label").closest(".prop-field").hidden = false;
    document.querySelectorAll("#props-form .prop-row").forEach((row) => {
      row.hidden = true;
    });
    document.getElementById("prop-rotation").closest(".prop-field").hidden = true;
    document.getElementById("prop-stroke").closest(".prop-field").hidden = true;
    document.getElementById("prop-label").value = obj.zoneName || "";
    document.getElementById("prop-fill").value = rgbToHex(obj.zoneColor) || "#f59e0b";
    return;
  }

  document.getElementById("prop-label").closest(".prop-field").hidden = false;
  document.querySelectorAll("#props-form .prop-row").forEach((row) => {
    row.hidden = false;
  });

  if (obj.objectType === "part" && MACHINES_UI_ENABLED) {
    document.getElementById("prop-stroke").closest(".prop-field").hidden =
      !!obj.partImageMode && !obj._objects?.some((o) => o.type === "text" && (o.text === "✕" || o.text === "○"));
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
    const rect = getPartBodyRect(obj);
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

  if (obj.objectType === "part") {
    form.hidden = true;
    content.innerHTML = `
      <p class="prop-type">配置オブジェクト</p>
      <p class="prop-meta">${esc(obj.partLabel || "パーツ")}</p>
      <p class="prop-meta" style="color:var(--muted)">マシン配置は現在オフです</p>
    `;
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
  if (history.length < 2) {
    flashStatus("これ以上戻せません");
    return;
  }
  isRestoringHistory = true;
  history.pop();
  getUserObjects().forEach((o) => canvas.remove(o));
  const objs = JSON.parse(history[history.length - 1]);
  fabric.util.enlivenObjects(objs, (restored) => {
    restored.forEach((o) => {
      if (o.objectType === "fillArea" || o.objectType === "zone") {
        upgradeZoneObject(o);
        applyInteractiveControls(o);
      } else {
        upgradePartGroup(o);
      }
      canvas.add(o);
    });
    if (drawingImage) drawingImage.sendToBack();
    canvas.requestRenderAll();
    applyMachinesVisibility();
    refreshZoneHooksList();
    refreshAllZoneMetrics();
    isRestoringHistory = false;
    updateProps();
    persistCurrent();
    flashStatus("1つ戻しました");
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
    mmPerImagePx: currentMmPerImagePx,
    drawingTransform: drawingImage
      ? {
          left: drawingImage.left,
          top: drawingImage.top,
          scaleX: drawingImage.scaleX,
          scaleY: drawingImage.scaleY,
        }
      : null,
  });
}

function restoreDesign(key) {
  return new Promise((resolve) => {
    const data = loadDesign(key);
    currentMmPerImagePx = data?.mmPerImagePx ?? null;

    if (drawingImage) {
      if (data?.drawingTransform) {
        applySavedDrawingTransform(data.drawingTransform);
      } else {
        fitDrawing(false);
      }
    }

    if (!data) {
      resolve();
      return;
    }
    if (data.viewport?.length === 6) {
      canvas.setViewportTransform(data.viewport);
    }
    if (!data.objects?.length) {
      resolve();
      return;
    }
    isRestoringHistory = true;
    fabric.util.enlivenObjects(data.objects, (objs) => {
      objs.forEach((o) => {
        if (o.objectType === "fillArea" || o.objectType === "zone") {
          upgradeZoneObject(o);
          applyInteractiveControls(o);
        } else {
          upgradePartGroup(o);
        }
        canvas.add(o);
      });
      if (drawingImage) drawingImage.sendToBack();
      canvas.requestRenderAll();
      applyMachinesVisibility();
      refreshZoneHooksList();
      refreshAllZoneMetrics();
      isRestoringHistory = false;
      resolve();
    });
  });
}

function applyMachinesVisibility() {
  if (!canvas) return;
  canvas.getObjects().forEach((o) => {
    if (o.objectType !== "part") return;
    const show = MACHINES_UI_ENABLED;
    o.set({
      visible: show,
      evented: show,
      selectable: show,
    });
  });
  canvas.requestRenderAll();
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
    if (e.key === "Delete" || (e.key === "Backspace" && activeTool === "select")) {
      e.preventDefault();
      deleteSelected();
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    else if (e.key === "z" || e.key === "Z") setTool("zone");
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
