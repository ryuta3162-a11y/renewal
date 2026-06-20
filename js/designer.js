import { DRAWINGS, DEFAULT_PARTS, MASTER_PROJECT_ID, MACHINES_UI_ENABLED, MARKS_UI_ENABLED, getMarkPaletteParts, DEFAULT_PLAN_WIDTH_MM, resolveDrawingUrl, DRAWING_ID_ALIASES, drawingFileKey } from "./constants.js";
import {
  refreshProjects,
  setCachedProjects,
  getCachedProjects,
  getProjectSheets,
  duplicateProjectSheet,
  deleteProjectSheet,
  isCustomSheet,
} from "./projects.js";
import {
  snapPoint,
  setSnapEnabled,
  isInsideWorkBoundary,
  setWorkBoundaryPoints,
  getWorkBoundaryPoints,
} from "./draw-tools.js";
import {
  ZONE_PRESETS,
  getAllZonePresets,
  enableZoneDraw,
  enableCalibPolygonDraw,
  updateZoneLabel,
  updateZoneColors,
  upgradeZoneObject,
  removeOrphanZonePreviews,
  purgeCanvasPreviews,
  purgeOrphanZoneDimensions,
  purgeVertexEditOverlays,
  normalizeZoneAfterResize,
  clearZoneRenderCache,
  enableZoneVertexEdit,
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
import { pdfToDataUrl, pdfToStackedDataUrl } from "./pdf-loader.js";
import {
  canvasToImagePx,
  mmPerImagePxFromAreaPx,
  polygonAreaImagePx,
  bboxMetricsFromCanvasPoints,
  M2_PER_TSUBO,
  computeZoneMetrics,
  computeZoneMetricsFromCanvasPoints,
  segmentMetrics,
  formatZoneSizeText,
  formatZoneSizeShort,
  formatEdgeLength,
} from "./drawing-scale.js";
import {
  captureDrawingState,
  applyDrawingTransform,
  syncUserObjectsToDrawing,
  configureDrawingResize,
  isValidDrawingTransform,
  isDrawingOnScreen,
  isPointInsideDrawing,
} from "./drawing-transform.js";
import {
  saveDesign,
  loadDesign,
  designPageKey,
  copySheetDesign,
  deleteSheetDesign,
  sheetHasSavedDesign,
  designHasContent,
} from "./storage.js";
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
  refreshMarkPartDisplay,
} from "./objects.js";

const canvasWrap = document.getElementById("canvas-wrap");
const statusEl = document.getElementById("status");
const memoTooltip = document.getElementById("memo-tooltip");
const drawDimHud = document.getElementById("draw-dim-hud");

let canvas;
let currentProjectId = MASTER_PROJECT_ID;
let currentSheets = DRAWINGS;
let currentDrawingId = null;
let currentPage = 1;
let totalPages = 1;
/** 1つのPDF内のページ数（縦並び表示時は totalPages は 1 のまま） */
let drawingPdfPageCount = 0;
let loadDrawingSeq = 0;
let polygonCleanup = null;
let activeTool = "zone";
let pendingZonePreset = ZONE_PRESETS[0];
let pendingPlacementZone = null;
let pendingPart = null;
let isPanning = false;
let spaceDown = false;
let lastPan = null;
let placeStart = null;
let placePreview = null;
let memoPendingPos = null;
let editingMemo = null;
let editingCustomPresetId = null;
let drawingImage = null;
let drawingTransformBefore = null;
let currentMmPerImagePx = null;
let scaleCalibrated = false;
let scaleCalibSummary = null;
let scaleCalibCleanup = null;
let scaleCalibPendingPoints = null;
let scaleHudMinimized = false;
let workBoundaryObject = null;
let zoneVertexEditCleanup = null;
let autoSaveTimer = null;
let lastSavedAt = null;
const history = [];
const historyLimit = 50;
let isRestoringHistory = false;
let lastPropsTargetKey = null;
let clipboardObjectData = null;
let marqueeDrag = null;
let marqueeOverlay = null;

const PASTE_OFFSET = 24;
const MARQUEE_MIN_PX = 4;

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
  setupSheetCopyModal();
  setupSheetDuplicateDelete();
  setupPropsForm();
  setupDrawStyle();
  setupZoneUI();
  if (MARKS_UI_ENABLED) rebuildMarksPalette();
  setupKeyboard();
  if (MACHINES_UI_ENABLED) await rebuildPalette();
  await waitForLayout();
  await loadDrawing(currentSheets[0].id);
  setTool("zone");
}

function waitForLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resizeCanvas();
      requestAnimationFrame(resolve);
    });
  });
}

function isMarqueeSelectAllowed() {
  if (!canvas || activeTool !== "select") return false;
  if (pendingPlacementZone || zoneVertexEditCleanup) return false;
  if (scaleCalibCleanup || scaleCalibPendingPoints) return false;
  return true;
}

function getMarqueeSelectableObjects() {
  return canvas.getObjects().filter((o) => {
    if (!o.visible || o._marqueeOverlay) return false;
    if (o.objectType === "drawing" || o.objectType === "workBoundary") return false;
    if (o._zonePendingFix || o._zoneVertexEdit || o._scalePreview || o._zonePreview) return false;
    if (o.objectType === "part") {
      const isMark = !!o.partMarkRole || o._objects?.some((c) => c.type === "text" && (c.text === "✕" || c.text === "○"));
      if (isMark && !MARKS_UI_ENABLED) return false;
      if (!isMark && !MACHINES_UI_ENABLED) return false;
    }
    return o.selectable !== false && o.evented !== false;
  });
}

function objectInMarqueeRect(obj, left, top, width, height) {
  obj.setCoords();
  const b = obj.getBoundingRect(true, true);
  const r = left + width;
  const btm = top + height;
  return !(b.left > r || b.left + b.width < left || b.top > btm || b.top + b.height < top);
}

function cancelMarqueeDrag() {
  marqueeDrag = null;
  if (marqueeOverlay && canvas) {
    canvas.remove(marqueeOverlay);
    marqueeOverlay = null;
    canvas.requestRenderAll();
  }
}

function startMarqueeDrag(ptr) {
  cancelMarqueeDrag();
  marqueeDrag = {
    startX: ptr.x,
    startY: ptr.y,
    left: ptr.x,
    top: ptr.y,
    width: 0,
    height: 0,
    moved: false,
  };
}

function updateMarqueeDrag(ptr) {
  if (!marqueeDrag || !canvas) return;
  const left = Math.min(marqueeDrag.startX, ptr.x);
  const top = Math.min(marqueeDrag.startY, ptr.y);
  const width = Math.abs(ptr.x - marqueeDrag.startX);
  const height = Math.abs(ptr.y - marqueeDrag.startY);
  marqueeDrag.left = left;
  marqueeDrag.top = top;
  marqueeDrag.width = width;
  marqueeDrag.height = height;
  if (width >= MARQUEE_MIN_PX || height >= MARQUEE_MIN_PX) marqueeDrag.moved = true;
  if (!marqueeDrag.moved) return;

  if (!marqueeOverlay) {
    marqueeOverlay = new fabric.Rect({
      left,
      top,
      width,
      height,
      fill: "rgba(59, 130, 246, 0.1)",
      stroke: "#60a5fa",
      strokeWidth: 1.5,
      strokeDashArray: [5, 4],
      selectable: false,
      evented: false,
      objectCaching: false,
      _marqueeOverlay: true,
      _skipHistory: true,
    });
    canvas.add(marqueeOverlay);
  } else {
    marqueeOverlay.set({ left, top, width, height });
  }
  marqueeOverlay.bringToFront();
  canvas.requestRenderAll();
}

function applyMarqueeSelection(bounds) {
  if (!canvas || !bounds?.moved) return;
  const { left, top, width, height } = bounds;
  if (width < MARQUEE_MIN_PX && height < MARQUEE_MIN_PX) return;

  const hits = getMarqueeSelectableObjects().filter((o) =>
    objectInMarqueeRect(o, left, top, width, height)
  );

  if (!hits.length) {
    clearCanvasSelection();
    flashStatus("範囲内に選択できるものがありません");
    return;
  }

  if (hits.length === 1) {
    canvas.setActiveObject(hits[0]);
  } else {
    canvas.setActiveObject(wrapMultiSelection(hits));
  }
  hits.forEach(applyInteractiveControls);
  updateProps();
  canvas.requestRenderAll();
  flashStatus(`${hits.length}件を選択`);
}

function finishMarqueeDrag(ptr) {
  if (!marqueeDrag) return { clicked: true };
  if (ptr) updateMarqueeDrag(ptr);
  const result = { ...marqueeDrag, clicked: !marqueeDrag.moved };
  cancelMarqueeDrag();
  return result;
}

function initCanvas() {
  canvas = new fabric.Canvas("design-canvas", {
    selection: false,
    preserveObjectStacking: true,
    backgroundColor: "#374151",
    fireRightClick: true,
    stopContextMenu: true,
  });
  canvas.selection = false;
  canvas.selectionKey = null;
  canvas.altSelectionKey = null;

  canvas.on("object:modified", (e) => {
    if (isRestoringHistory) return;
    if (e.target?.type === "activeSelection") {
      e.target.getObjects().forEach((obj) => {
        if (obj.objectType === "zone") {
          normalizeZoneAfterResize(obj);
          refreshZoneOnCanvas(obj, computeZoneMetricsFor(obj));
        }
        applyInteractiveControls(obj);
      });
      purgeOrphanZoneDimensions(canvas);
      refreshZoneHooksList();
      pushHistory();
      updateProps();
      scheduleAutoSave();
      return;
    }
    if (e.target?.objectType === "drawing") {
      onDrawingTransformEnd();
      return;
    }
    if (e.target?.objectType === "part") {
      enforceMinPartSize(e.target);
      normalizePartAfterResize(e.target);
    }
    if (e.target?.objectType === "zone") {
      normalizeZoneAfterResize(e.target);
      refreshZoneOnCanvas(e.target, computeZoneMetricsFor(e.target));
      purgeOrphanZoneDimensions(canvas);
      refreshZoneHooksList();
      if (e.target._zonePendingFix) {
        updateProps();
        return;
      }
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
    if (e.target?.objectType === "zone") {
      refreshZoneHooksList();
      purgeOrphanZoneDimensions(canvas);
    }
    pushHistory();
    scheduleAutoSave();
  });
  canvas.on("object:scaling", (e) => {
    if (e.target?.objectType === "drawing" && !drawingTransformBefore) {
      drawingTransformBefore = captureDrawingState(drawingImage);
    }
    if (e.target?.objectType === "zone") {
      clearZoneRenderCache(e.target);
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
    if (e.target?.type === "activeSelection") {
      e.target.getObjects().forEach((obj) => {
        if (obj.objectType === "zone") {
          refreshZoneOnCanvas(obj, computeZoneMetricsFor(obj));
        }
      });
      updatePropsLive();
      return;
    }
    if (e.target?.objectType === "zone") {
      refreshZoneOnCanvas(e.target, computeZoneMetricsFor(e.target));
    }
    updatePropsLive();
  });
  canvas.on("selection:created", (e) => {
    if (zoneVertexEditCleanup) {
      canvas.discardActiveObject();
      return;
    }
    if (pendingPlacementZone && e.selected?.[0] !== pendingPlacementZone) {
      canvas.setActiveObject(pendingPlacementZone);
    }
    e.selected?.forEach(applyInteractiveControls);
    updateProps();
  });
  canvas.on("selection:updated", (e) => {
    if (zoneVertexEditCleanup) {
      canvas.discardActiveObject();
      return;
    }
    if (pendingPlacementZone && e.selected?.[0] !== pendingPlacementZone) {
      canvas.setActiveObject(pendingPlacementZone);
    }
    e.selected?.forEach(applyInteractiveControls);
    updateProps();
  });
  canvas.on("selection:cleared", () => {
    if (zoneVertexEditCleanup) return;
    if (pendingPlacementZone) {
      canvas.setActiveObject(pendingPlacementZone);
      return;
    }
    updateProps();
  });

  canvas.on("mouse:over", (opt) => {
    if (opt.target?.objectType === "memo") showMemoTooltip(opt.e, opt.target.memoData);
  });
  canvas.on("mouse:out", (opt) => {
    if (opt.target?.objectType === "memo") hideMemoTooltip();
  });

  canvas.on("mouse:wheel", (opt) => {
    const e = opt.e;
    if (drawingPdfPageCount > 1 && !e.ctrlKey && !e.metaKey) {
      const vpt = canvas.viewportTransform.slice();
      vpt[5] -= e.deltaY;
      canvas.setViewportTransform(vpt);
      scheduleAutoSave();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    let z = canvas.getZoom() * 0.999 ** e.deltaY;
    z = Math.min(Math.max(z, 0.15), 10);
    canvas.zoomToPoint({ x: e.offsetX, y: e.offsetY }, z);
    scheduleAutoSave();
    e.preventDefault();
    e.stopPropagation();
  });

  canvas.on("path:created", (e) => {
    const path = e.path;
    if (!path) return;
    path.set({ objectType: "sketch" });
    if (!isInsideWorkBoundary(path.getCenterPoint())) {
      canvas.remove(path);
      flashStatus("枠の外");
    } else {
      pushHistory();
      scheduleAutoSave();
    }
  });

  canvas.on("mouse:down", onCanvasMouseDown);
  canvas.on("mouse:move", onCanvasMouseMove);
  canvas.on("mouse:up", onCanvasMouseUp);
  canvas.on("mouse:dblclick", onCanvasDoubleClick);

  const blockContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  canvasWrap.addEventListener("contextmenu", blockContextMenu, true);
  canvas.upperCanvasEl?.addEventListener("contextmenu", blockContextMenu, true);
  canvas.lowerCanvasEl?.addEventListener("contextmenu", blockContextMenu, true);
  canvas.on("contextmenu", (opt) => {
    opt.e.preventDefault();
    opt.e.stopPropagation();
  });

  canvasWrap.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  resizeCanvas();
  window.addEventListener("resize", () => {
    resizeCanvas();
    if (drawingImage && !isDrawingOnScreen(drawingImage, canvas)) {
      fitDrawing(false);
      canvas.requestRenderAll();
    }
  });
  window.addEventListener("beforeunload", () => persistCurrent());
}

function resizeCanvas() {
  const rect = canvasWrap.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(240, Math.floor(rect.height));
  canvas.setWidth(w);
  canvas.setHeight(h);
  canvas.requestRenderAll();
}

function resetViewport() {
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
}

function isValidViewport(vpt) {
  if (!vpt || vpt.length !== 6) return false;
  const [a, , , d, e, f] = vpt;
  if (![a, d, e, f].every(Number.isFinite)) return false;
  if (a < 0.08 || a > 12 || d < 0.08 || d > 12) return false;
  if (Math.abs(e) > 50000 || Math.abs(f) > 50000) return false;
  return true;
}

function ensureDrawingVisible() {
  if (!drawingImage) return;
  if (!isDrawingOnScreen(drawingImage, canvas)) {
    resetViewport();
    fitDrawing(false);
    canvas.requestRenderAll();
  }
}

function placeDrawingOnCanvas(savedTransform) {
  if (!drawingImage) return;
  if (savedTransform && isValidDrawingTransform(savedTransform)) {
    applySavedDrawingTransform(savedTransform);
  } else {
    fitDrawing(false);
  }
  ensureDrawingVisible();
  canvas.requestRenderAll();
}

function applySavedViewport(vpt) {
  if (!vpt || !isValidViewport(vpt)) return;
  canvas.setViewportTransform(vpt);
  ensureDrawingVisible();
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
  syncDrawingSelectValue();
  updateSheetActionButtons();
}

function syncDrawingSelectValue() {
  const sel = document.getElementById("drawing-select");
  if (!sel || !currentDrawingId) return;
  if ([...sel.options].some((o) => o.value === currentDrawingId)) {
    sel.value = currentDrawingId;
  }
}

function updateSheetActionButtons() {
  const delBtn = document.getElementById("btn-sheet-delete");
  if (!delBtn) return;
  const sheet = currentDrawingId ? getCurrentSheet(currentDrawingId) : null;
  delBtn.disabled = !sheet || !isCustomSheet(sheet);
}

function cancelPendingAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

async function switchProject(projectId) {
  cancelPendingAutoSave();
  if (!discardPendingPlacementIfNeeded("案を切り替える")) return;
  if (currentDrawingId) persistCurrent();
  currentProjectId = projectId;
  currentPage = 1;
  rebuildSheetSelect();
  if (currentSheets.length) await loadDrawing(currentSheets[0].id);
  syncDrawingSelectValue();
}

function getCurrentSheet(id) {
  return currentSheets.find((s) => s.id === id);
}

function isImageSheet(sheet) {
  return sheet.kind === "image" || /\.(png|jpe?g|webp)$/i.test(sheet.file || "");
}

function getSheetPdfFile(sheet, pageNum = currentPage) {
  if (sheet.pages?.length) return resolveDrawingUrl(sheet.pages[Math.min(pageNum, sheet.pages.length) - 1]);
  return resolveDrawingUrl(sheet.file);
}

function loadSavedDesignForSheet(sheetId, page = currentPage) {
  const ids = [sheetId];
  const oldId = Object.entries(DRAWING_ID_ALIASES).find(([, v]) => v === sheetId)?.[0];
  if (oldId) ids.push(oldId);
  const newId = DRAWING_ID_ALIASES[sheetId];
  if (newId) ids.push(newId);
  for (const id of [...new Set(ids)]) {
    const data = loadDesign(designPageKey(currentProjectId, id, page));
    if (data) return data;
  }
  return null;
}

function pageKey() {
  return designPageKey(currentProjectId, currentDrawingId, currentPage);
}

async function switchDrawing(id) {
  if (!id || id === currentDrawingId) return;
  const prevId = currentDrawingId;
  const prevSheet = prevId ? getCurrentSheet(prevId) : null;
  cancelPendingAutoSave();
  if (!discardPendingPlacementIfNeeded("図面を切り替える")) {
    syncDrawingSelectValue();
    return;
  }
  if (currentDrawingId) persistCurrent();
  currentPage = 1;
  setStatus(`「${getCurrentSheet(id)?.name || id}」を読み込み中…`);
  const ok = await loadDrawing(id, prevSheet);
  if (!ok && prevId) {
    currentPage = 1;
    setStatusError(`切り替え失敗 — 「${prevSheet?.name || prevId}」に戻します`);
    await loadDrawing(prevId);
  }
  syncDrawingSelectValue();
}

async function loadSheetBackground(sheet) {
  if (isImageSheet(sheet)) {
    totalPages = 1;
    drawingPdfPageCount = 0;
    updatePageUI();
    const src = sheet.file.startsWith("data:") ? sheet.file : resolveDrawingUrl(sheet.file);
    await loadDrawingImage(src);
    return;
  }

  if (sheet.pages?.length) {
    drawingPdfPageCount = 0;
    totalPages = sheet.pages.length;
    updatePageUI();
    const pdf = await pdfToDataUrl(getSheetPdfFile(sheet, currentPage), 1, 2);
    await loadDrawingImage(pdf.dataUrl);
    return;
  }

  setStatus("PDFを読み込み中…");
  const stacked = await pdfToStackedDataUrl(getSheetPdfFile(sheet), 2);
  drawingPdfPageCount = stacked.numPages;
  totalPages = 1;
  currentPage = 1;
  updatePageUI();
  await loadDrawingImage(stacked.dataUrl);
}

async function loadDrawing(id, prevSheet = null) {
  const sheet = getCurrentSheet(id);
  if (!sheet) {
    setStatusError(`図面「${id}」が一覧に見つかりません`);
    return false;
  }

  const seq = ++loadDrawingSeq;
  cancelPendingAutoSave();
  setStatus(`「${sheet.name}」を読み込み中…`);
  currentDrawingId = id;
  syncDrawingSelectValue();
  clearStatusError();

  try {
    isRestoringHistory = true;
    if (zoneVertexEditCleanup) {
      zoneVertexEditCleanup(false);
      zoneVertexEditCleanup = null;
    }
    pendingPlacementZone = null;
    showPlacementHud(false);
    pauseZonePolygonDraw();
    polygonCleanup = null;
    currentMmPerImagePx = null;
    scaleCalibrated = false;
    scaleCalibSummary = null;
    canvas.clear();
    drawingImage = null;
    resizeCanvas();
    resetViewport();

    const saved = loadSavedDesignForSheet(currentDrawingId);
    scaleCalibrated = !!saved?.scaleCalibrated;
    scaleCalibSummary = saved?.scaleCalibSummary ?? null;
    scaleHudMinimized = saved?.scaleHudMinimized ?? !!saved?.scaleCalibrated;
    currentMmPerImagePx = saved?.mmPerImagePx ?? null;

    await loadSheetBackground(sheet);
    if (seq !== loadDrawingSeq) return false;

    resizeCanvas();
    placeDrawingOnCanvas(saved?.drawingTransform);
    await restoreDesign(pageKey(), saved, { skipViewport: true });
    if (seq !== loadDrawingSeq) return false;

    if (saved?.viewport?.length === 6 && isValidViewport(saved.viewport)) {
      applySavedViewport(saved.viewport);
    } else {
      resetViewport();
      fitDrawing(false);
    }

    if (!currentMmPerImagePx) tryDefaultScale();
    fillScaleTsuboFromSheet();
    refreshAllZoneMetrics();
    updateScaleUI();
    if (saved?.workBoundaryCanvasPoints?.length) {
      applyWorkBoundary(saved.workBoundaryCanvasPoints);
    }
    purgeCanvasPreviews(canvas);
    isRestoringHistory = false;
    applyMachinesVisibility();
    refreshZoneHooksList();
    persistCurrent();
    pushHistory(true);
    if (!drawingImage) {
      throw new Error("図面画像の生成に失敗しました");
    }
    const proj = document.getElementById("project-select").selectedOptions[0]?.textContent || "";
    const pageNote =
      drawingPdfPageCount > 1 ? `（${drawingPdfPageCount}ページ・下へ移動で閲覧）` : ` — ページ ${currentPage}`;
    setStatus(`${proj} / ${sheet.name}${pageNote}`);
    if (prevSheet && drawingFileKey(prevSheet.file) === drawingFileKey(sheet.file)) {
      flashStatus(`「${sheet.name}」に切り替えました（PDFは「${prevSheet.name}」と同じファイルです。区画データは別々に保存されます）`);
    }
    updateSheetActionButtons();
    canvas.requestRenderAll();
    return true;
  } catch (err) {
    if (seq !== loadDrawingSeq) return false;
    isRestoringHistory = false;
    cancelPendingAutoSave();
    const msg = err?.message || String(err);
    setStatusError(`「${sheet.name}」の読み込み失敗: ${msg}`);
    console.error("loadDrawing failed:", sheet.name, err);
    return false;
  }
}

function loadDrawingImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const loadOpts = dataUrl.startsWith("data:") ? undefined : { crossOrigin: "anonymous" };
    fabric.Image.fromURL(
      dataUrl,
      (img) => {
        if (!img) {
          reject(new Error("図面画像の読み込みに失敗しました"));
          return;
        }
        const iw = img.width || img._element?.naturalWidth || 0;
        const ih = img.height || img._element?.naturalHeight || 0;
        if (iw < 1 || ih < 1) {
          reject(new Error("図面画像のサイズが0です（PDFの変換に失敗した可能性）"));
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
        configureDrawingResize(img, activeTool === "drawing");
        resolve(img);
      },
      loadOpts
    );
  });
}

function fitDrawing(resetView = false) {
  if (!drawingImage) return;
  const before = captureDrawingState(drawingImage);
  const pad = 32;
  const iw = drawingImage.width;
  const ih = drawingImage.height;
  let scale;
  let top;
  if (drawingPdfPageCount > 1) {
    scale = (canvas.getWidth() - pad * 2) / iw;
    top = pad;
  } else {
    scale = Math.min(
      (canvas.getWidth() - pad * 2) / iw,
      (canvas.getHeight() - pad * 2) / ih
    );
    top = (canvas.getHeight() - ih * scale) / 2;
  }
  if (!Number.isFinite(scale) || scale <= 0) return;
  drawingImage.set({
    scaleX: scale,
    scaleY: scale,
    left: (canvas.getWidth() - iw * scale) / 2,
    top,
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
  configureDrawingResize(drawingImage, activeTool === "drawing");
  canvas?.requestRenderAll();
}

function setUserObjectsInteractive(enabled) {
  canvas?.getObjects().forEach((o) => {
    if (o.objectType === "drawing" || o.objectType === "workBoundary") return;
    if (o._marqueeOverlay || o._zoneVertexEdit) return;
    o.set({ selectable: enabled, evented: enabled });
  });
}

function startDrawingAdjustMode() {
  setUserObjectsInteractive(false);
  canvas.discardActiveObject();
  if (drawingImage) {
    if (!drawingTransformBefore) {
      drawingTransformBefore = captureDrawingState(drawingImage);
    }
    canvas.setActiveObject(drawingImage);
  }
  updateProps();
  flashStatus("図面の角をドラッグでサイズ変更 · Esc で終了");
}

function finishDrawingAdjustMode() {
  setUserObjectsInteractive(true);
  if (drawingTransformBefore && drawingImage) {
    onDrawingTransformEnd();
  } else {
    configureDrawingResize(drawingImage, false);
  }
  canvas.discardActiveObject();
  updateProps();
}

function wrapMultiSelection(hits) {
  if (hits.length === 1) return hits[0];
  const sel = new fabric.ActiveSelection(hits, { canvas });
  sel.set({ lockScaling: true, lockRotation: true });
  return sel;
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
    configureDrawingResize(drawingImage, false);
  return true;
}

function getUserObjects() {
  return canvas.getObjects().filter(
    (o) =>
      o.objectType !== "drawing" &&
      o.objectType !== "workBoundary" &&
      !o._zonePendingFix
  );
}

function snapshotUserObjects() {
  return JSON.stringify(getUserObjects().map((o) => o.toObject(getSerializeProps())));
}

function shouldStartPan(opt) {
  const e = opt.e;
  if (e.button === 2) return false;
  if (pendingPlacementZone || zoneVertexEditCleanup) return false;
  if (activeTool === "drawing") return false;
  if (e.button === 1) return true;
  if (activeTool === "pan" && e.button === 0) return true;
  if (spaceDown && e.button === 0) return true;
  if (activeTool === "select" && e.button === 0) {
    const t = opt.target;
    if (!t) {
      clearCanvasSelection();
      return;
    }
    if (t.objectType === "drawing") return true;
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
  const info = document.getElementById("page-info");
  const prevBtn = document.getElementById("btn-prev-page");
  const nextBtn = document.getElementById("btn-next-page");
  if (drawingPdfPageCount > 1) {
    info.textContent = `${drawingPdfPageCount}ページ`;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    prevBtn.title = "縦スクロール（移動ツールで上下）";
    nextBtn.title = "";
    return;
  }
  prevBtn.title = "";
  nextBtn.title = "";
  info.textContent = `${currentPage} / ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

document.getElementById("btn-prev-page").addEventListener("click", async () => {
  if (currentPage <= 1) return;
  cancelPendingAutoSave();
  persistCurrent();
  currentPage--;
  await reloadPage();
});

document.getElementById("btn-next-page").addEventListener("click", async () => {
  if (currentPage >= totalPages) return;
  cancelPendingAutoSave();
  persistCurrent();
  currentPage++;
  await reloadPage();
});

async function reloadPage() {
  const sheet = getCurrentSheet(currentDrawingId);
  if (!sheet) return;
  cancelPendingAutoSave();
  updatePageUI();
  pendingPlacementZone = null;
  showPlacementHud(false);
  isRestoringHistory = true;
  getUserObjects().forEach((o) => canvas.remove(o));
  if (drawingImage) canvas.remove(drawingImage);
  drawingImage = null;
  if (isImageSheet(sheet)) {
    await loadDrawingImage(sheet.file);
  } else if (sheet.pages?.length) {
    const pdf = await pdfToDataUrl(getSheetPdfFile(sheet, currentPage), 1, 2);
    await loadDrawingImage(pdf.dataUrl);
  } else {
    const stacked = await pdfToStackedDataUrl(getSheetPdfFile(sheet), 2);
    await loadDrawingImage(stacked.dataUrl);
  }
  const saved = loadSavedDesignForSheet(currentDrawingId);
  scaleCalibrated = !!saved?.scaleCalibrated;
  scaleCalibSummary = saved?.scaleCalibSummary ?? null;
  scaleHudMinimized = saved?.scaleHudMinimized ?? !!saved?.scaleCalibrated;
  resizeCanvas();
  placeDrawingOnCanvas(saved?.drawingTransform);
  await restoreDesign(pageKey(), saved, { skipViewport: true });
  applySavedViewport(saved?.viewport);
  if (!currentMmPerImagePx) tryDefaultScale();
  fillScaleTsuboFromSheet();
  refreshAllZoneMetrics();
  purgeOrphanZoneDimensions(canvas);
  updateScaleUI();
  if (saved?.workBoundaryCanvasPoints?.length) {
    applyWorkBoundary(saved.workBoundaryCanvasPoints);
  }
  isRestoringHistory = false;
  persistCurrent();
  pushHistory(true);
  setStatus(`${sheet.name} — ページ ${currentPage}`);
}

function setupDrawStyle() {
  document.getElementById("snap-grid")?.addEventListener("change", (e) => {
    setSnapEnabled(e.target.checked);
  });
}

function setupZoneUI() {
  buildZoneHooks();
  setupCustomPresetModal();
  setupScaleUI();

  document.getElementById("btn-zone-place-confirm")?.addEventListener("click", confirmZonePlacement);
  document.getElementById("btn-zone-place-cancel")?.addEventListener("click", cancelZonePlacement);

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

  setupZoneSidebarResize();
  setupZoneSidebarToggle();
}

function refreshZoneOnCanvas(zone, metrics) {
  refreshZoneDisplay(zone, metrics, drawingImage, currentMmPerImagePx);
}

function showPlacementHud(show) {
  const hud = document.getElementById("zone-place-hud");
  if (hud) hud.hidden = !show;
  canvasWrap?.classList.toggle("placing-zone", !!show);
}

function enterZoneVertexEditMode(zone, isNew = true) {
  if (!zone) return;
  if (pendingPlacementZone && pendingPlacementZone !== zone) {
    confirmZoneVertexEdit();
  }
  pauseZonePolygonDraw();
  pendingPlacementZone = zone;
  if (isNew) {
    zone._zonePendingFix = true;
    zone._skipHistory = true;
  }

  zoneVertexEditCleanup = enableZoneVertexEdit(canvas, zone, {
    getSnapPtr: (raw, e) => snapPoint(raw, canvas, e),
    onPointsChange: () => {
      ensureZoneDimensionMarkers(zone);
      refreshZoneOnCanvas(zone, computeZoneMetricsFor(zone));
    },
  });

  activeTool = "select";
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === "select");
  });
  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.skipTargetFind = false;
  canvas.discardActiveObject();
  showPlacementHud(true);
  hideDrawDimHud();
  updateCanvasCursor();
  updateDrawingInteractivity();
  updateProps();
  canvas.requestRenderAll();
  flashStatus("白い丸の角をドラッグで変形 · Enter で確定");
}

function confirmZoneVertexEdit() {
  const zone = pendingPlacementZone;
  if (!zone) return;
  if (zoneVertexEditCleanup) {
    zoneVertexEditCleanup(false);
    zoneVertexEditCleanup = null;
  }
  const isNew = !!zone._zonePendingFix;
  delete zone._zonePendingFix;
  delete zone._skipHistory;
  pendingPlacementZone = null;
  zone.set({ selectable: true, evented: true, opacity: 1 });
  applyInteractiveControls(zone);
  showPlacementHud(false);
  canvas.skipTargetFind = false;
  normalizeZoneAfterResize(zone);
  purgeVertexEditOverlays(canvas);
  ensureZoneDimensionMarkers(zone);
  refreshZoneOnCanvas(zone, computeZoneMetricsFor(zone));
  purgeOrphanZoneDimensions(canvas);
  canvas.requestRenderAll();
  if (isNew) {
    finalizeNewZone(zone);
  } else {
    pushHistory();
    persistCurrent();
    scheduleAutoSave();
    refreshZoneHooksList();
    flashStatus(`「${zone.zoneName || "区画"}」を更新しました`);
  }
  updateProps();
  resumeZonePolygonDraw();
}

function cancelZoneVertexEdit() {
  const zone = pendingPlacementZone;
  if (!zone) return;
  const isNew = !!zone._zonePendingFix;
  if (zoneVertexEditCleanup) {
    zoneVertexEditCleanup(!isNew);
    zoneVertexEditCleanup = null;
  }
  pendingPlacementZone = null;
  delete zone._zonePendingFix;
  delete zone._skipHistory;
  showPlacementHud(false);
  hideDrawDimHud();
  canvas.skipTargetFind = false;
  if (isNew) {
    canvas.remove(zone);
    canvas.discardActiveObject();
    refreshZoneHooksList();
    flashStatus("取消");
  } else {
    zone.set({ selectable: true, evented: true, opacity: 1 });
    applyInteractiveControls(zone);
    ensureZoneDimensionMarkers(zone);
    refreshZoneOnCanvas(zone, computeZoneMetricsFor(zone));
    canvas.requestRenderAll();
    flashStatus("変更を取り消しました");
  }
  updateProps();
  resumeZonePolygonDraw();
}

/** @deprecated alias */
function enterZonePlacementMode(zone) {
  enterZoneVertexEditMode(zone, true);
}

function confirmZonePlacement() {
  confirmZoneVertexEdit();
}

function cancelZonePlacement() {
  cancelZoneVertexEdit();
}

function discardPendingPlacementIfNeeded(actionLabel) {
  if (!pendingPlacementZone && !zoneVertexEditCleanup) return true;
  if (!confirm(`編集中の区画があります。${actionLabel}すると破棄されます。よろしいですか？`)) {
    return false;
  }
  cancelZonePlacement();
  return true;
}

function finalizeNewZone(zone) {
  if (!zone) return;
  try {
    ensureDrawingScale();
    applyInteractiveControls(zone);
    ensureZoneDimensionMarkers(zone);
    refreshZoneOnCanvas(zone, computeZoneMetricsFor(zone));
    refreshZoneHooksList();
    canvas.requestRenderAll();
    persistCurrent();
    pushHistory();
    scheduleAutoSave();
    const name = zone.zoneName || "区画";
    if (currentMmPerImagePx) {
      flashStatus(`「${name}」固定`);
    } else {
      flashStatus(`「${name}」追加`);
    }
  } catch (err) {
    console.error(err);
    flashStatus("区画は追加しましたが表示更新でエラーがありました");
  }
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

function removeScalePreviews() {
  purgeCanvasPreviews(canvas);
}

function fillScaleTsuboFromSheet() {
  const input = document.getElementById("scale-known-tsubo");
  if (!input || input.value) return;
  const sheet = getCurrentSheet(currentDrawingId);
  if (sheet?.planAreaTsubo) input.value = sheet.planAreaTsubo;
}

function renderWorkBoundaryOverlay() {
  if (workBoundaryObject) {
    canvas.remove(workBoundaryObject);
    workBoundaryObject = null;
  }
  const pts = getWorkBoundaryPoints();
  if (!pts?.length || !canvas) return;
  // 採寸確定後は枠線を表示しない（描画制限だけ維持）
  if (scaleCalibrated && !scaleCalibCleanup && !scaleCalibPendingPoints) return;
  workBoundaryObject = new fabric.Polygon(
    pts.map((p) => ({ x: p.x, y: p.y })),
    {
      fill: "rgba(245,158,11,0.05)",
      stroke: "#f59e0b",
      strokeWidth: 2,
      strokeDashArray: [10, 6],
      selectable: false,
      evented: false,
      objectType: "workBoundary",
      _skipHistory: true,
    }
  );
  canvas.add(workBoundaryObject);
  drawingImage?.sendToBack();
  workBoundaryObject.moveTo((drawingImage ? 1 : 0));
  canvas.requestRenderAll();
}

function applyWorkBoundary(points) {
  setWorkBoundaryPoints(points);
  renderWorkBoundaryOverlay();
}

function minimizeScaleHud() {
  scaleHudMinimized = true;
  updateScaleHudVisibility();
  scheduleAutoSave();
}

function expandScaleHud() {
  scaleHudMinimized = false;
  updateScaleHudVisibility();
}

function updateScaleHudVisibility() {
  const hud = document.getElementById("scale-calib-hud");
  const fab = document.getElementById("scale-calib-fab");
  const closeBtn = document.getElementById("btn-scale-hud-close");
  const isDone = !!(currentMmPerImagePx && scaleCalibrated);

  if (!isDone) {
    hud?.removeAttribute("hidden");
    fab?.setAttribute("hidden", "");
    closeBtn?.setAttribute("hidden", "");
    return;
  }

  if (scaleHudMinimized) {
    hud?.setAttribute("hidden", "");
    fab?.removeAttribute("hidden");
    if (fab && scaleCalibSummary?.knownTsubo != null) {
      fab.textContent = "○";
      fab.title = `${scaleCalibSummary.knownTsubo}坪`;
    }
  } else {
    hud?.removeAttribute("hidden");
    fab?.setAttribute("hidden", "");
    closeBtn?.removeAttribute("hidden");
  }
}

function setScaleCalibMode(mode) {
  const applyBtn = document.getElementById("btn-scale-apply");
  const cancelBtn = document.getElementById("btn-scale-cancel");
  const calibBtn = document.getElementById("btn-area-calibrate");
  const hud = document.getElementById("scale-calib-hud");
  const badge = document.getElementById("scale-badge");
  if (applyBtn) applyBtn.hidden = mode !== "ready";
  if (cancelBtn) cancelBtn.hidden = mode === "idle";
  if (calibBtn) calibBtn.disabled = mode === "drawing";
  hud?.classList.toggle("scale-calib-hud--drawing", mode === "drawing");
  canvasWrap?.classList.toggle("scale-calibrating", mode === "drawing");
  if (mode === "drawing" && badge && !scaleCalibrated) {
    badge.textContent = "採寸中";
    badge.className = "scale-badge tentative";
  } else if (mode === "ready" && badge) {
    badge.textContent = "坪→確定";
    badge.className = "scale-badge tentative";
  } else if (!scaleCalibrated) {
    updateScaleUI();
  }
}

function updateScaleUI() {
  const hud = document.getElementById("scale-calib-hud");
  const badge = document.getElementById("scale-badge");
  const doneLine = document.getElementById("scale-calib-done-line");
  const doneText = document.getElementById("scale-calib-done-text");
  const summary = document.getElementById("scale-calib-summary");
  const calibBtn = document.getElementById("btn-area-calibrate");
  const isDone = !!(currentMmPerImagePx && scaleCalibrated && scaleCalibSummary);

  hud?.classList.toggle("scale-calib-hud--done", isDone);
  if (doneLine) doneLine.hidden = !isDone;
  if (doneText) doneText.hidden = !isDone;
  if (summary) summary.hidden = !isDone;

  if (isDone) {
    const s = scaleCalibSummary;
    if (summary) {
      summary.textContent = `${s.knownTsubo}坪 · 横${s.widthM.toFixed(1)}m 縦${s.depthM.toFixed(1)}m`;
    }
    if (badge) {
      badge.textContent = "完了";
      badge.className = "scale-badge ok";
    }
    if (calibBtn) calibBtn.textContent = "やり直し";
    updateScaleHudVisibility();
    return;
  }

  scaleHudMinimized = false;
  updateScaleHudVisibility();

  if (calibBtn) calibBtn.textContent = "縦横採寸";
  if (badge) {
    badge.textContent = "未設定";
    badge.className = "scale-badge tentative";
  }
}

function cancelScaleCalibration(resumeZone = true) {
  if (scaleCalibCleanup) {
    scaleCalibCleanup();
    scaleCalibCleanup = null;
  }
  scaleCalibPendingPoints = null;
  removeScalePreviews();
  setScaleCalibMode("idle");
  if (resumeZone) resumeZonePolygonDraw();
}

function pauseZonePolygonDraw() {
  if (polygonCleanup) {
    polygonCleanup();
    polygonCleanup = null;
  }
  purgeCanvasPreviews(canvas);
  hideDrawDimHud();
}

function attachZonePolygonDraw() {
  if (!canvas || scaleCalibCleanup || scaleCalibPendingPoints) return;
  if (polygonCleanup) return;
  canvas.discardActiveObject();
  ensureDrawingScale();
  canvas.selection = false;
  canvas.skipTargetFind = true;
  polygonCleanup = enableZoneDraw(
    canvas,
    () => pendingZonePreset,
    (zone) => {
      polygonCleanup = null;
      hideDrawDimHud();
      canvas.skipTargetFind = false;
      if (!zone) {
        setTool("select");
        return;
      }
      delete zone._skipHistory;
      applyInteractiveControls(zone);
      finalizeNewZone(zone);
      canvas.setActiveObject(zone);
      setTool("select");
      updateProps();
    },
    (points) => computeZoneMetricsFromCanvasPoints(points, drawingImage, currentMmPerImagePx),
    (a, b) => segmentMetrics(a, b, drawingImage, currentMmPerImagePx),
    (metrics) => showDrawDimHud(metrics)
  );
}

function resumeZonePolygonDraw() {
  if (activeTool === "zone") attachZonePolygonDraw();
}

function applyScaleFromPolygon(tsubo) {
  if (!scaleCalibPendingPoints?.length) {
    flashStatus("先に縦横採寸で囲んでください");
    return false;
  }
  if (!tsubo || tsubo <= 0) {
    flashStatus("坪を入力");
    document.getElementById("scale-known-tsubo")?.focus();
    return false;
  }
  if (!drawingImage) return false;

  const knownM2 = tsubo * M2_PER_TSUBO;
  const areaPx = polygonAreaImagePx(scaleCalibPendingPoints, drawingImage);
  const mmPerPx = mmPerImagePxFromAreaPx(knownM2, areaPx);
  if (!mmPerPx) {
    flashStatus("失敗 — やり直してください");
    return false;
  }

  const bbox = bboxMetricsFromCanvasPoints(
    scaleCalibPendingPoints,
    drawingImage,
    mmPerPx
  );
  const boundaryPts = [...scaleCalibPendingPoints];
  currentMmPerImagePx = mmPerPx;
  scaleCalibrated = true;
  scaleCalibSummary = {
    widthM: bbox?.widthM ?? 0,
    depthM: bbox?.depthM ?? 0,
    knownM2,
    knownTsubo: tsubo,
  };
  cancelScaleCalibration(false);
  applyWorkBoundary(boundaryPts);
  scaleHudMinimized = true;
  refreshAllZoneMetrics();
  updateScaleUI();
  refreshZoneHooksList();
  purgeCanvasPreviews(canvas);
  resumeZonePolygonDraw();
  pushHistory();
  scheduleAutoSave();
  flashStatus(`測定完了 ${tsubo}坪`);
  return true;
}

function setupScaleUI() {
  document.getElementById("btn-area-calibrate")?.addEventListener("click", () => {
    if (!drawingImage) {
      flashStatus("図面を読み込んでください");
      return;
    }
    startCalibPolygonDraw();
  });

  document.getElementById("btn-scale-apply")?.addEventListener("click", () => {
    const tsubo = parseFloat(document.getElementById("scale-known-tsubo")?.value);
    applyScaleFromPolygon(tsubo);
  });

  document.getElementById("btn-scale-cancel")?.addEventListener("click", () => {
    cancelScaleCalibration();
  });

  document.getElementById("btn-scale-hud-close")?.addEventListener("click", () => {
    minimizeScaleHud();
  });

  document.getElementById("scale-calib-fab")?.addEventListener("click", () => {
    expandScaleHud();
  });

  document.getElementById("scale-known-tsubo")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && scaleCalibPendingPoints?.length) {
      e.preventDefault();
      const tsubo = parseFloat(e.target.value);
      applyScaleFromPolygon(tsubo);
    }
  });
}

function startCalibPolygonDraw() {
  expandScaleHud();
  pauseZonePolygonDraw();
  if (scaleCalibrated) {
    scaleCalibrated = false;
    scaleCalibSummary = null;
    currentMmPerImagePx = null;
    refreshAllZoneMetrics();
    updateScaleUI();
  }
  applyWorkBoundary(null);
  cancelScaleCalibration(false);
  removeOrphanZonePreviews(canvas);
  purgeCanvasPreviews(canvas);

  setScaleCalibMode("drawing");

  scaleCalibCleanup = enableCalibPolygonDraw(
    canvas,
    (points) => {
      scaleCalibCleanup = null;
      if (!points?.length) {
        cancelScaleCalibration();
        return;
      }
      scaleCalibPendingPoints = points;
      purgeCanvasPreviews(canvas);
      setScaleCalibMode("ready");
      document.getElementById("scale-known-tsubo")?.focus();
    },
    {
      isClickAllowed: (ptr) => {
        if (isPointInsideDrawing(ptr, drawingImage)) return true;
        flashStatus("図面の上をクリックしてください");
        return false;
      },
    }
  );
}

const HOOK_STATE_KEY = "renewal-zone-hook-collapsed";
const ZONE_SIDEBAR_WIDTH_KEY = "renewal-zone-sidebar-width";
const ZONE_SIDEBAR_HIDDEN_KEY = "renewal-zone-sidebar-hidden";
const ZONE_SIDEBAR_MIN = 160;
const ZONE_SIDEBAR_MAX = 480;
const ZONE_SIDEBAR_DEFAULT = 220;

function applyZoneSidebarWidth(px) {
  const w = Math.min(ZONE_SIDEBAR_MAX, Math.max(ZONE_SIDEBAR_MIN, px));
  document.documentElement.style.setProperty("--zone-sidebar-width", `${w}px`);
}

function setZoneSidebarHidden(hidden) {
  document.getElementById("zone-sidebar")?.classList.toggle("is-hidden", hidden);
  document.getElementById("workspace")?.classList.toggle("zone-sidebar-hidden", hidden);
  const fab = document.getElementById("zone-sidebar-fab");
  if (fab) fab.hidden = !hidden;
}

function setupZoneSidebarResize() {
  const resizer = document.getElementById("zone-sidebar-resizer");
  const sidebar = document.getElementById("zone-sidebar");
  if (!resizer || !sidebar) return;

  const saved = parseInt(localStorage.getItem(ZONE_SIDEBAR_WIDTH_KEY), 10);
  if (saved >= ZONE_SIDEBAR_MIN && saved <= ZONE_SIDEBAR_MAX) {
    applyZoneSidebarWidth(saved);
  } else {
    applyZoneSidebarWidth(ZONE_SIDEBAR_DEFAULT);
  }

  let dragging = false;
  let startX = 0;
  let startW = 0;

  resizer.addEventListener("mousedown", (e) => {
    if (sidebar.classList.contains("is-hidden")) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    resizer.classList.add("is-dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  const onMove = (e) => {
    if (!dragging) return;
    applyZoneSidebarWidth(startW + (e.clientX - startX));
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("is-dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const w = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--zone-sidebar-width"),
      10
    );
    if (Number.isFinite(w)) localStorage.setItem(ZONE_SIDEBAR_WIDTH_KEY, String(w));
    resizeCanvas();
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function setupZoneSidebarToggle() {
  const closeBtn = document.getElementById("btn-zone-sidebar-close");
  const fab = document.getElementById("zone-sidebar-fab");
  const hidden = localStorage.getItem(ZONE_SIDEBAR_HIDDEN_KEY) === "true";
  setZoneSidebarHidden(hidden);

  closeBtn?.addEventListener("click", () => {
    setZoneSidebarHidden(true);
    localStorage.setItem(ZONE_SIDEBAR_HIDDEN_KEY, "true");
    resizeCanvas();
  });

  fab?.addEventListener("click", () => {
    setZoneSidebarHidden(false);
    localStorage.setItem(ZONE_SIDEBAR_HIDDEN_KEY, "false");
    resizeCanvas();
  });
}

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
    customContainer.innerHTML = "";
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
    first?.querySelector(".btn-zone-open")?.setAttribute("aria-expanded", "true");
    const firstOpen = first?.querySelector(".btn-zone-open");
    if (firstOpen) firstOpen.textContent = "閉じる";
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

  const openLabel = collapsed[preset.id] ? "開く" : "閉じる";

  const customActions = isCustom
    ? `<button type="button" class="zone-hook-edit" title="区分を編集">✎</button>
       <button type="button" class="zone-hook-del" title="区分を削除">×</button>`
    : "";

  hook.innerHTML = `
    <div class="zone-hook-title-row">
      <span class="zone-hook-bar" style="background:${preset.color}"></span>
      <span class="zone-hook-title">${esc(preset.name)}</span>
      <span class="zone-hook-count" data-count-for="${preset.id}">0</span>
      ${customActions}
    </div>
    <div class="zone-hook-actions">
      <button type="button" class="btn-zone-draw">描く</button>
      <button type="button" class="btn-zone-open" aria-expanded="${!collapsed[preset.id]}">${openLabel}</button>
    </div>
    <p class="zone-hook-empty-hint">まだ作ったことがないですよ</p>
    <ul class="zone-hook-list" data-list-for="${preset.id}"></ul>
  `;

  const openBtn = hook.querySelector(".btn-zone-open");

  hook.querySelector(".zone-hook-title-row")?.addEventListener("click", (e) => {
    if (e.target.closest(".zone-hook-edit, .zone-hook-del")) return;
    selectZonePreset(preset, false);
  });

  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const count =
      parseInt(hook.querySelector(`[data-count-for="${preset.id}"]`)?.textContent || "0", 10) || 0;
    if (count === 0) return;
    const isCollapsed = hook.classList.toggle("collapsed");
    openBtn.setAttribute("aria-expanded", String(!isCollapsed));
    openBtn.textContent = isCollapsed ? "開く" : "閉じる";
    const state = loadHookCollapsedState();
    state[preset.id] = isCollapsed;
    saveHookCollapsedState(state);
    selectZonePreset(preset, false);
  });

  hook.querySelector(".btn-zone-draw").addEventListener("click", (e) => {
    e.stopPropagation();
    hook.classList.remove("collapsed");
    openBtn.setAttribute("aria-expanded", "true");
    openBtn.disabled = false;
    openBtn.classList.remove("is-empty");
    openBtn.textContent = "閉じる";
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
  document.getElementById("custom-preset-desc").value =
    preset?.desc && preset.desc !== "自作の区画区分" ? preset.desc : "";
  document.getElementById("custom-preset-delete").hidden = !preset;
  document.getElementById("custom-preset-modal").showModal();
}

function updateHookOpenState(hook, count) {
  const openBtn = hook.querySelector(".btn-zone-open");
  if (!openBtn) return;
  const isCollapsed = hook.classList.contains("collapsed");

  hook.classList.toggle("has-zones", count > 0);

  if (count === 0) {
    if (isCollapsed) {
      openBtn.disabled = true;
      openBtn.classList.add("is-empty");
      openBtn.textContent = "";
      openBtn.setAttribute("aria-expanded", "false");
    } else {
      openBtn.disabled = false;
      openBtn.classList.remove("is-empty");
      openBtn.textContent = "閉じる";
      openBtn.setAttribute("aria-expanded", "true");
    }
    return;
  }

  openBtn.disabled = false;
  openBtn.classList.remove("is-empty");
  openBtn.textContent = isCollapsed ? "開く" : "閉じる";
  openBtn.setAttribute("aria-expanded", String(!isCollapsed));
}

function setAllHooksCollapsed(collapsed) {
  const state = {};
  document.querySelectorAll(".zone-hook").forEach((hook) => {
    const presetId = hook.dataset.presetId;
    const count =
      parseInt(document.querySelector(`[data-count-for="${presetId}"]`)?.textContent || "0", 10) || 0;

    if (!collapsed && count === 0) {
      hook.classList.add("collapsed");
      state[presetId] = true;
      updateHookOpenState(hook, count);
      return;
    }

    hook.classList.toggle("collapsed", collapsed);
    state[presetId] = collapsed;
    updateHookOpenState(hook, count);
  });
  saveHookCollapsedState(state);
}

function focusViewportOnZone(zone) {
  if (!zone || !canvas) return;
  zone.setCoords();
  const bounds = zone.getBoundingRect(true, true);
  const pad = 72;
  const cw = canvas.getWidth();
  const ch = canvas.getHeight();
  const zoom = Math.min(
    (cw - pad * 2) / Math.max(bounds.width, 1),
    (ch - pad * 2) / Math.max(bounds.height, 1),
    2.2
  );
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  canvas.setZoom(Math.max(0.25, zoom));
  const z = canvas.getZoom();
  const vpt = canvas.viewportTransform.slice();
  vpt[4] = cw / 2 - cx * z;
  vpt[5] = ch / 2 - cy * z;
  canvas.setViewportTransform(vpt);
  canvas.setActiveObject(zone);
  canvas.requestRenderAll();
  scheduleAutoSave();
  updateProps();
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
    const count = counts[preset.id] || 0;
    const countEl = document.querySelector(`[data-count-for="${preset.id}"]`);
    if (countEl) countEl.textContent = String(count);

    const hook = document.querySelector(`.zone-hook[data-preset-id="${preset.id}"]`);
    if (hook) updateHookOpenState(hook, count);

    const list = document.querySelector(`[data-list-for="${preset.id}"]`);
    if (!list) return;
    list.innerHTML = "";

    const matched = zones.filter((z) => resolveZonePresetId(z, allPresets) === preset.id);

    if (!matched.length) return;

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
        ? `${baseName}${numTag}${sizeSuffix}`
        : `${baseName}${numTag}${sizeSuffix}`;
      btn.title = "図面上のこの区画へ移動";
      btn.addEventListener("click", () => {
        focusViewportOnZone(zone);
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
  if (pendingPlacementZone) confirmZonePlacement();
  pendingZonePreset = preset;
  highlightZonePreset();
  updateZoneActiveLabel();
  if (startDraw) setTool("zone");
}

function highlightZonePreset() {
  document.querySelectorAll(".zone-hook").forEach((hook) => {
    hook.classList.toggle("active", hook.dataset.presetId === pendingZonePreset?.id);
  });
}

function updateZoneActiveLabel() {
  const el = document.getElementById("zone-active-label");
  if (!el || !pendingZonePreset) return;
  const name = pendingZonePreset.name || "";
  el.textContent = name.replace(/エリア$/, "") || name;
}

function clearCanvasSelection() {
  if (!canvas?.getActiveObject()) return;
  canvas.discardActiveObject();
  if (document.activeElement?.closest("#props-form, #props-content")) {
    document.activeElement.blur();
  }
  updateProps();
  canvas.requestRenderAll();
}

function deleteZone(zone) {
  if (!zone) return;
  const name = zone.zoneName || "区画";
  if (!confirm(`「${name}」を削除しますか？`)) return;

  canvas.remove(zone);
  canvas.discardActiveObject();
  purgeOrphanZoneDimensions(canvas);
  pushHistory();
  refreshZoneHooksList();
  scheduleAutoSave();
  updateProps();
  flashStatus(`「${name}」を削除しました`);
}

function populateCopyProjectSelect(sel) {
  if (!sel) return;
  sel.innerHTML = "";
  getCachedProjects().forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    const tag = p.type === "master" ? "" : p.author ? ` (${p.author})` : " (案)";
    opt.textContent = p.name + tag;
    sel.appendChild(opt);
  });
}

function populateCopySheetSelect(projectId, sel, excludeSheetId) {
  if (!sel) return;
  sel.innerHTML = "";
  getProjectSheets(projectId).forEach((s) => {
    if (excludeSheetId && s.id === excludeSheetId) return;
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
}

function getSheetLabel(projectId, sheetId) {
  const sheet = getProjectSheets(projectId).find((s) => s.id === sheetId);
  return sheet?.name || sheetId;
}

function ensureSheetDesignPersisted(projectId, sheetId) {
  if (projectId !== currentProjectId || sheetId !== currentDrawingId) return;
  persistCurrent();
  if (sheetHasSavedDesign(projectId, sheetId)) return;
  const pageData = {
    objects: getUserObjects().map((o) => o.toObject(getSerializeProps())),
    scaleCalibrated,
    mmPerImagePx: currentMmPerImagePx,
    workBoundaryCanvasPoints: getWorkBoundaryPoints(),
  };
  if (!designHasContent(pageData)) return;
  saveDesign(
    designPageKey(projectId, sheetId, currentPage),
    JSON.parse(
      JSON.stringify({
        objects: pageData.objects,
        viewport: canvas.viewportTransform?.slice() ?? [1, 0, 0, 1, 0, 0],
        mmPerImagePx: pageData.mmPerImagePx,
        scaleCalibrated: pageData.scaleCalibrated,
        scaleCalibSummary,
        scaleHudMinimized,
        workBoundaryCanvasPoints: pageData.workBoundaryCanvasPoints,
        drawingTransform: drawingImage
          ? {
              left: drawingImage.left,
              top: drawingImage.top,
              scaleX: drawingImage.scaleX,
              scaleY: drawingImage.scaleY,
            }
          : null,
      })
    )
  );
}

function setupSheetDuplicateDelete() {
  document.getElementById("btn-sheet-duplicate")?.addEventListener("click", async () => {
    if (!currentDrawingId) return;
    if (!discardPendingPlacementIfNeeded("図面を複製する")) return;

    const srcId = currentDrawingId;
    const srcLabel = getCurrentSheet(srcId)?.name || srcId;
    ensureSheetDesignPersisted(currentProjectId, srcId);

    const newSheet = duplicateProjectSheet(currentProjectId, srcId);
    if (!newSheet) {
      flashStatus("図面を複製できませんでした");
      return;
    }

    copySheetDesign(currentProjectId, srcId, currentProjectId, newSheet.id);
    rebuildSheetSelect();
    document.getElementById("drawing-select").value = newSheet.id;
    await switchDrawing(newSheet.id);
    flashStatus(`「${srcLabel}」を複製 →「${newSheet.name}」`);
  });

  document.getElementById("btn-sheet-delete")?.addEventListener("click", async () => {
    if (!currentDrawingId) return;
    const sheet = getCurrentSheet(currentDrawingId);
    if (!sheet || !isCustomSheet(sheet)) {
      flashStatus("組み込みの図面は削除できません");
      return;
    }
    if (!discardPendingPlacementIfNeeded("図面を削除する")) return;
    if (!confirm(`「${sheet.name}」を削除しますか？\n（区画・草図などの保存データも消えます）`)) return;

    cancelPendingAutoSave();
    const deletedName = sheet.name;
    const deletedId = currentDrawingId;
    deleteSheetDesign(currentProjectId, deletedId);
    deleteProjectSheet(currentProjectId, deletedId);

    rebuildSheetSelect();
    if (currentSheets.length) {
      const next = currentSheets.find((s) => s.id !== deletedId) || currentSheets[0];
      document.getElementById("drawing-select").value = next.id;
      await loadDrawing(next.id);
    } else {
      currentDrawingId = null;
      canvas?.clear();
    }
    updateSheetActionButtons();
    flashStatus(`「${deletedName}」を削除しました`);
  });
}

function openSheetCopyModal() {
  const modal = document.getElementById("sheet-copy-modal");
  if (!modal) return;

  const fromProject = document.getElementById("copy-from-project");
  const fromSheet = document.getElementById("copy-from-sheet");
  const toProject = document.getElementById("copy-to-project");
  const toSheet = document.getElementById("copy-to-sheet");

  populateCopyProjectSelect(fromProject);
  populateCopyProjectSelect(toProject);
  fromProject.value = currentProjectId;
  toProject.value = currentProjectId;

  populateCopySheetSelect(fromProject.value, fromSheet);
  const excludeDest = fromProject.value === toProject.value ? fromSheet.value : null;
  populateCopySheetSelect(toProject.value, toSheet, excludeDest);
  if (currentDrawingId) fromSheet.value = currentDrawingId;
  if (excludeDest && fromSheet.value === excludeDest) {
    populateCopySheetSelect(toProject.value, toSheet, fromSheet.value);
  }
  if (!toSheet.value && toSheet.options.length) {
    toSheet.value = toSheet.options[0].value;
  }

  modal.showModal();
}

function setupSheetCopyModal() {
  document.getElementById("btn-sheet-copy")?.addEventListener("click", () => {
    openSheetCopyModal();
  });

  const fromProject = document.getElementById("copy-from-project");
  const toProject = document.getElementById("copy-to-project");
  const fromSheet = document.getElementById("copy-from-sheet");
  const toSheet = document.getElementById("copy-to-sheet");

  fromProject?.addEventListener("change", () => {
    populateCopySheetSelect(fromProject.value, fromSheet);
    const exclude =
      fromProject.value === toProject.value ? fromSheet.value : null;
    populateCopySheetSelect(toProject.value, toSheet, exclude);
    if (!toSheet.value && toSheet.options.length) toSheet.value = toSheet.options[0].value;
  });
  toProject?.addEventListener("change", () => {
    const exclude =
      fromProject.value === toProject.value ? fromSheet.value : null;
    populateCopySheetSelect(toProject.value, toSheet, exclude);
  });
  fromSheet?.addEventListener("change", () => {
    if (fromProject.value === toProject.value) {
      populateCopySheetSelect(toProject.value, toSheet, fromSheet.value);
      if (!toSheet.value && toSheet.options.length) toSheet.value = toSheet.options[0].value;
    }
  });

  document.getElementById("sheet-copy-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const srcProjectId = fromProject.value;
    const srcSheetId = fromSheet.value;
    const destProjectId = toProject.value;
    const destSheetId = toSheet.value;

    if (!srcProjectId || !srcSheetId || !destProjectId || !destSheetId) return;
    if (srcProjectId === destProjectId && srcSheetId === destSheetId) {
      flashStatus("コピー元とコピー先が同じです");
      return;
    }

    if (
      srcProjectId === currentProjectId &&
      srcSheetId === currentDrawingId
    ) {
      persistCurrent();
    }

    const srcLabel = getSheetLabel(srcProjectId, srcSheetId);
    const destLabel = getSheetLabel(destProjectId, destSheetId);

    if (!sheetHasSavedDesign(srcProjectId, srcSheetId)) {
      const currentPageData =
        srcProjectId === currentProjectId && srcSheetId === currentDrawingId
          ? {
              objects: getUserObjects().map((o) => o.toObject(getSerializeProps())),
              scaleCalibrated,
              mmPerImagePx: currentMmPerImagePx,
              workBoundaryCanvasPoints: getWorkBoundaryPoints(),
            }
          : null;
      if (!designHasContent(currentPageData)) {
        flashStatus(`「${srcLabel}」にコピーできるデータがありません`);
        return;
      }
      saveDesign(
        designPageKey(srcProjectId, srcSheetId, currentPage),
        JSON.parse(
          JSON.stringify({
            objects: currentPageData.objects,
            viewport: canvas.viewportTransform?.slice() ?? [1, 0, 0, 1, 0, 0],
            mmPerImagePx: currentPageData.mmPerImagePx,
            scaleCalibrated: currentPageData.scaleCalibrated,
            scaleCalibSummary,
            scaleHudMinimized,
            workBoundaryCanvasPoints: currentPageData.workBoundaryCanvasPoints,
            drawingTransform: drawingImage
              ? {
                  left: drawingImage.left,
                  top: drawingImage.top,
                  scaleX: drawingImage.scaleX,
                  scaleY: drawingImage.scaleY,
                }
              : null,
          })
        )
      );
    }

    if (sheetHasSavedDesign(destProjectId, destSheetId)) {
      const ok = confirm(
        `「${destLabel}」には既にデータがあります。上書きしてコピーしますか？`
      );
      if (!ok) return;
    }

    const { copied, pages } = copySheetDesign(
      srcProjectId,
      srcSheetId,
      destProjectId,
      destSheetId
    );
    if (!copied) {
      flashStatus(`「${srcLabel}」にコピーできるデータがありません`);
      return;
    }

    document.getElementById("sheet-copy-modal").close();

    const pageNote = pages.length > 1 ? `（${pages.length}ページ）` : "";
    flashStatus(`「${srcLabel}」→「${destLabel}」へコピーしました${pageNote}`);

    if (destProjectId === currentProjectId && destSheetId === currentDrawingId) {
      await loadDrawing(destSheetId);
    } else if (
      destProjectId !== currentProjectId ||
      destSheetId !== currentDrawingId
    ) {
      const go = confirm(`コピー先の「${destLabel}」を開きますか？`);
      if (go) {
        if (destProjectId !== currentProjectId) {
          document.getElementById("project-select").value = destProjectId;
          await switchProject(destProjectId);
        }
        await switchDrawing(destSheetId);
      }
    }
  });
}

function isMarkPartDef(def) {
  return !!(def?.mark || def?.markRole);
}

function canPlaceParts() {
  return MACHINES_UI_ENABLED || MARKS_UI_ENABLED;
}

function allowsMarkPlacement() {
  return MARKS_UI_ENABLED && pendingPart && isMarkPartDef(pendingPart);
}

function getNextMarkIndex() {
  const used = new Set();
  canvas?.getObjects().forEach((o) => {
    if (o.objectType === "part" && o.partMarkRole === "move-from" && o.partMarkIndex) {
      used.add(o.partMarkIndex);
    }
  });
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!used.has(letter)) return letter;
  }
  return String(used.size + 1);
}

function getMoveFromIndices() {
  const indices = [];
  canvas?.getObjects().forEach((o) => {
    if (o.objectType === "part" && o.partMarkRole === "move-from" && o.partMarkIndex) {
      if (!indices.includes(o.partMarkIndex)) indices.push(o.partMarkIndex);
    }
  });
  return indices.sort();
}

function rebuildMarksPalette() {
  const panel = document.getElementById("marks-panel");
  if (panel) panel.hidden = !MARKS_UI_ENABLED;
  const container = document.getElementById("marks-palette");
  if (!container) return;
  container.innerHTML = "";
  getMarkPaletteParts().forEach((def) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "marks-item";
    btn.dataset.partId = def.id;
    btn.title = def.markRole === "move-from"
      ? "移動元 — 自動で A,B,C… を付与"
      : def.markRole === "move-to"
        ? "移動先 — どの移動元へ入るか右パネルで指定"
        : `${def.label} — 図面をクリックして配置`;
    btn.innerHTML = `
      <span class="marks-swatch" style="background:${def.fill};border-color:${def.stroke}">${esc(def.markRole === "move-from" ? "A" : def.markRole === "move-to" ? "→A" : def.mark || "●")}</span>
      <span class="marks-label">${esc(def.label)}</span>
    `;
    btn.addEventListener("click", () => selectMarkPart(def));
    container.appendChild(btn);
  });
  highlightSelectedMark();
}

function highlightSelectedMark() {
  document.querySelectorAll(".marks-item").forEach((btn) => {
    btn.classList.toggle("selected", pendingPart && btn.dataset.partId === pendingPart.id);
  });
}

function selectMarkPart(def) {
  if (!MARKS_UI_ENABLED) return;
  pendingPart = { ...def };
  setTool("place");
  const hint = def.markRole === "move-from"
    ? `「${def.label}」— クリックで配置（A,B,C…が自動付与）`
    : def.markRole === "move-to"
      ? `「${def.label}」— クリックで配置 → 右パネルで移動元を指定`
      : `「${def.label}」— 図面をクリックして配置`;
  flashStatus(hint);
  highlightSelectedMark();
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
  if (pendingPlacementZone) {
    cancelZonePlacement();
    return;
  }
  if (polygonCleanup) {
    polygonCleanup();
    polygonCleanup = null;
  }
  purgeCanvasPreviews(canvas);
  hideDrawDimHud();
  setTool("select");
}

// ── Canvas interaction ──────────────────────────────
function resolveDeletableTarget(target) {
  if (!target) return null;
  if (
    target.objectType === "measureLine" ||
    target.objectType === "sketch" ||
    target.type === "path"
  ) {
    return target;
  }
  const group = target.group || (target.type === "group" ? target : null);
  if (group?.objectType === "measureLine") return group;
  return null;
}

function deleteObjectOnRightClick(target) {
  const obj = resolveDeletableTarget(target);
  if (!obj || !canvas) return false;
  canvas.remove(obj);
  canvas.discardActiveObject();
  pushHistory();
  scheduleAutoSave();
  updateProps();
  flashStatus("削除");
  return true;
}

function handleCanvasRightClick(opt) {
  const e = opt.e;
  e.preventDefault();
  e.stopPropagation();

  if (scaleCalibCleanup || scaleCalibPendingPoints) {
    cancelScaleCalibration();
    return;
  }

  if (activeTool === "zone") {
    cancelZoneDrawing();
    return;
  }

  if (deleteObjectOnRightClick(opt.target)) return;

  const active = canvas.getActiveObject();
  if (active && deleteObjectOnRightClick(active)) return;
}

function onCanvasMouseDown(opt) {
  const e = opt.e;

  if (e.button === 2) {
    if (isMarqueeSelectAllowed()) {
      e.preventDefault();
      startMarqueeDrag(canvas.getPointer(e));
      return;
    }
    handleCanvasRightClick(opt);
    return;
  }

  if (scaleCalibCleanup) return;

  if (zoneVertexEditCleanup) return;

  if (activeTool === "zone") return;

  if (e.button === 0 && activeTool === "select" && opt.target?.objectType === "zone") {
    canvas.setActiveObject(opt.target);
    return;
  }

  if (shouldStartPan(opt)) {
    if (e.button === 1) e.preventDefault();
    startPan(e);
    return;
  }

  if (allowsMarkPlacement() && activeTool === "place" && (!opt.target || opt.target?.objectType === "drawing")) {
    const ptr = canvas.getPointer(e);
    void placeMarkAt(ptr.x, ptr.y);
    return;
  }

  if (MACHINES_UI_ENABLED && activeTool === "place" && pendingPart && !isMarkPartDef(pendingPart) && (!opt.target || opt.target?.objectType === "drawing")) {
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

  if (marqueeDrag) {
    if (!(e.buttons & 2)) {
      finishMarqueeDrag(canvas.getPointer(e));
      return;
    }
    updateMarqueeDrag(canvas.getPointer(e));
    return;
  }

  if (zoneVertexEditCleanup) return;

  if (scaleCalibCleanup) return;

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

function onCanvasDoubleClick(opt) {
  if (scaleCalibCleanup || scaleCalibPendingPoints || pendingPlacementZone) return;
  const target = opt.target;
  let zone = null;
  if (target?.objectType === "zone") zone = target;
  else if (target?.group?.objectType === "zone") zone = target.group;
  if (!zone || zone._zonePendingFix) return;
  opt.e?.preventDefault?.();
  opt.e?.stopPropagation?.();
  enterZoneVertexEditMode(zone, false);
}

async function onCanvasMouseUp(opt) {
  if (marqueeDrag) {
    const result = finishMarqueeDrag(canvas.getPointer(opt.e));
    if (result.clicked) {
      handleCanvasRightClick(opt);
    } else {
      applyMarqueeSelection(result);
    }
    return;
  }

  if (scaleCalibCleanup) return;

  if (isPanning) {
    isPanning = false;
    lastPan = null;
    canvas.selection = false;
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

async function placeMarkAt(x, y) {
  if (!pendingPart) return;
  if (!isInsideWorkBoundary({ x, y })) {
    flashStatus("枠の外");
    return;
  }
  await addPartToCanvas(pendingPart, x, y);
  pushHistory();
  scheduleAutoSave();
  canvas.requestRenderAll();
}

async function addPartToCanvas(def, x, y, w, h) {
  const partDef = { ...def };
  if (partDef.markRole === "move-from") {
    partDef.partMarkIndex = getNextMarkIndex();
  } else if (partDef.markRole === "move-to") {
    const sources = getMoveFromIndices();
    partDef.partLinkIndex = sources.length === 1 ? sources[0] : sources[0] || "A";
  }

  let obj;
  if (partDef.mark || partDef.markRole) {
    obj = createPartBox(partDef, x, y, w ?? partDef.w, h ?? partDef.h);
    if (partDef.markRole) {
      obj.set({
        partMarkRole: partDef.markRole,
        partMarkIndex: partDef.partMarkIndex || "",
        partLinkIndex: partDef.partLinkIndex || "",
      });
      refreshMarkPartDisplay(obj);
    }
  } else {
    obj = await placePart(partDef, x, y, w, h);
  }
  canvas.add(obj);
  applyInteractiveControls(obj);
  canvas.setActiveObject(obj);
  updateProps();
}

// ── Memo tooltip ────────────────────────────────────
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
    flashStatus("全体");
  });
}

function detachZonePolygonDraw() {
  if (polygonCleanup) {
    polygonCleanup();
    polygonCleanup = null;
  }
  hideDrawDimHud();
}

function setTool(tool) {
  if (pendingPlacementZone && tool !== "select") return;
  const wasDrawingAdjust = activeTool === "drawing";
  activeTool = tool;
  if (tool !== "zone") detachZonePolygonDraw();
  if (tool === "zone" || tool === "pan") {
    canvas.discardActiveObject();
  }
  if (wasDrawingAdjust && tool !== "drawing") {
    finishDrawingAdjustMode();
  }
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });

  canvas.isDrawingMode = false;
  canvas.selection = false;

  if (tool === "zone") {
    if (scaleCalibCleanup || scaleCalibPendingPoints) {
      canvas.skipTargetFind = true;
    } else {
      attachZonePolygonDraw();
    }
  } else if (tool === "drawing") {
    canvas.skipTargetFind = false;
    startDrawingAdjustMode();
  } else if (tool === "place" && canPlaceParts()) {
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
  if (canPlaceParts() && activeTool === "place") {
    canvas.setCursor("crosshair");
    return;
  }
  if (activeTool === "zone") {
    canvas.setCursor("crosshair");
    return;
  }
  if (activeTool === "drawing") {
    canvas.setCursor("nwse-resize");
    return;
  }
  if (pendingPlacementZone) {
    canvas.setCursor("default");
    return;
  }
  if (zoneVertexEditCleanup) {
    canvas.setCursor("grab");
    return;
  }
  canvas.setCursor("default");
}

function deleteSelected() {
  if (pendingPlacementZone) {
    cancelZoneVertexEdit();
    return;
  }
  const hadZone = canvas.getActiveObjects().some((o) => o.objectType === "zone");
  canvas.getActiveObjects().forEach((o) => canvas.remove(o));
  canvas.discardActiveObject();
  if (hadZone) {
    purgeOrphanZoneDimensions(canvas);
    refreshZoneHooksList();
  }
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
  bind("prop-zone-memo", () => applyPropToSelection("memo"));
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
      refreshZoneHooksList();
    }
    if (field === "memo") {
      obj.set("zoneMemo", document.getElementById("prop-zone-memo").value);
    }
    if (field === "fill") {
      updateZoneColors(obj, document.getElementById("prop-fill").value);
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

function propsTargetKey(obj) {
  if (!obj) return null;
  if (obj.objectType === "zone" || obj.objectType === "fillArea") {
    return `zone:${obj.zoneInstanceId || obj.zonePresetId || "x"}`;
  }
  if (obj.objectType === "drawing") return "drawing";
  if (obj.objectType === "memo") return `memo:${obj.memoData?.id || ""}:${obj.left}:${obj.top}`;
  if (obj.objectType === "part") {
    return `part:${obj.partId || ""}:${obj.partMarkRole || ""}:${obj.partMarkIndex || ""}`;
  }
  return `other:${obj.type}`;
}

function isPropsFormFieldFocused() {
  const ae = document.activeElement;
  return !!(ae && ae.closest("#props-form"));
}

function setInputValueIfIdle(el, value) {
  if (!el || document.activeElement === el) return;
  el.value = value;
}

function updateZoneSizeMetaEl(zone) {
  const text = zone._zoneMetrics
    ? formatZoneSizeText(zone._zoneMetrics, zoneLabelOpts(zone)).replace("\n", " · ")
    : "";
  let el = document.querySelector("#props-content .zone-size-meta");
  if (!text) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("p");
    el.className = "prop-meta zone-size-meta";
    document.getElementById("props-content")?.prepend(el);
  }
  el.textContent = text;
}

function updateDrawingPropsMeta(obj) {
  const pct = Math.round((obj.scaleX || 1) * 100);
  const w = Math.round(obj.getScaledWidth());
  const h = Math.round(obj.getScaledHeight());
  const el = document.querySelector("#props-content .prop-meta");
  if (el && lastPropsTargetKey === "drawing") {
    el.textContent = `${pct}% · ${w}×${h}px`;
    return true;
  }
  return false;
}

function syncZonePropsForm(obj) {
  if (isPropsFormFieldFocused()) return;
  setInputValueIfIdle(document.getElementById("prop-label"), obj.zoneName || "");
  setInputValueIfIdle(document.getElementById("prop-zone-memo"), obj.zoneMemo || "");
  const fillEl = document.getElementById("prop-fill");
  if (fillEl && document.activeElement !== fillEl) {
    fillEl.value = rgbToHex(obj.zoneColor) || "#f59e0b";
  }
}

function updatePropsLive() {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  if (obj.objectType === "drawing") {
    if (!updateDrawingPropsMeta(obj)) updateProps();
    return;
  }
  if (obj.objectType === "zone" || obj.objectType === "fillArea") {
    updateZoneSizeMetaEl(obj);
    return;
  }
  if (obj.objectType !== "part") return;
  setInputValueIfIdle(document.getElementById("prop-width"), Math.round(obj.getScaledWidth()));
  setInputValueIfIdle(document.getElementById("prop-height"), Math.round(obj.getScaledHeight()));
  setInputValueIfIdle(document.getElementById("prop-rotation"), Math.round(obj.angle || 0));
  const rotVal = document.getElementById("prop-rotation-val");
  if (rotVal) rotVal.textContent = `${Math.round(obj.angle || 0)}°`;
}

function zoneLabelOpts(zone) {
  return {
    showBBoxDims: zone.zoneShowBBoxDims !== false,
    showTsubo: zone.zoneShowTsubo !== false,
  };
}

function renderZoneDimToggles(zone) {
  const showEdges = zone.zoneShowEdgeLengths !== false;
  const showBBox = zone.zoneShowBBoxDims !== false;
  const showTsubo = zone.zoneShowTsubo !== false;
  return `
    <div class="zone-dim-toggles">
      <label class="zone-dim-toggle">
        <input type="checkbox" id="prop-zone-tsubo" ${showTsubo ? "checked" : ""} />
        坪
      </label>
      <label class="zone-dim-toggle">
        <input type="checkbox" id="prop-zone-edge-lengths" ${showEdges ? "checked" : ""} />
        辺
      </label>
      <label class="zone-dim-toggle">
        <input type="checkbox" id="prop-zone-bbox-dims" ${showBBox ? "checked" : ""} />
        横縦
      </label>
    </div>
  `;
}

function bindZoneDimToggles(zone) {
  const onDimToggle = () => {
    zone.set({
      zoneShowTsubo: document.getElementById("prop-zone-tsubo")?.checked ?? true,
      zoneShowEdgeLengths: document.getElementById("prop-zone-edge-lengths")?.checked ?? true,
      zoneShowBBoxDims: document.getElementById("prop-zone-bbox-dims")?.checked ?? true,
    });
    refreshZoneOnCanvas(zone, computeZoneMetricsFor(zone));
    canvas.requestRenderAll();
    pushHistory();
    scheduleAutoSave();
    updateZoneSizeMetaEl(zone);
  };
  document.getElementById("prop-zone-tsubo")?.addEventListener("change", onDimToggle);
  document.getElementById("prop-zone-edge-lengths")?.addEventListener("change", onDimToggle);
  document.getElementById("prop-zone-bbox-dims")?.addEventListener("change", onDimToggle);
}

function updateProps() {
  const obj = canvas.getActiveObject();
  const content = document.getElementById("props-content");
  const form = document.getElementById("props-form");
  const memoField = document.getElementById("prop-zone-memo-field");
  if (memoField) memoField.hidden = true;

  if (pendingPlacementZone) {
    const z = pendingPlacementZone;
    const key = `pending:${z.zoneInstanceId || "x"}`;
    const sameTarget = lastPropsTargetKey === key;
    lastPropsTargetKey = key;
    form.hidden = true;
    if (sameTarget) {
      updateZoneSizeMetaEl(z);
      return;
    }
    const metrics = z._zoneMetrics;
    const sizeBlock = metrics
      ? `<p class="prop-meta zone-size-meta">${esc(formatZoneSizeText(metrics, zoneLabelOpts(z)).replace("\n", " · "))}</p>`
      : "";
    content.innerHTML = `
      ${sizeBlock}
      ${renderZoneDimToggles(z)}
      <button type="button" class="btn btn-primary btn-block" id="props-confirm-zone">Enter</button>
      <button type="button" class="btn btn-ghost btn-block btn-sm" id="props-cancel-zone">Esc</button>
    `;
    bindZoneDimToggles(z);
    document.getElementById("props-confirm-zone")?.addEventListener("click", confirmZonePlacement);
    document.getElementById("props-cancel-zone")?.addEventListener("click", cancelZonePlacement);
    return;
  }

  if (!obj) {
    lastPropsTargetKey = null;
    content.innerHTML = `<p class="props-empty">—</p>`;
    form.hidden = true;
    if (MACHINES_UI_ENABLED && pendingPart) showMachinePreview(pendingPart);
    return;
  }

  if (obj.type === "activeSelection") {
    lastPropsTargetKey = "multi";
    form.hidden = true;
    const items = obj.getObjects();
    const zoneCount = items.filter((o) => o.objectType === "zone").length;
    const detail = zoneCount > 0 ? `（区画 ${zoneCount}件）` : "";
    content.innerHTML = `
      <p class="prop-meta"><strong>${items.length}件</strong>を選択中${esc(detail)}</p>
      <p class="prop-meta props-hint">まとめて移動 · Delete で削除 · Esc で解除</p>
    `;
    return;
  }

  if (obj.objectType === "drawing") {
    const key = "drawing";
    const sameTarget = lastPropsTargetKey === key;
    lastPropsTargetKey = key;
    form.hidden = true;
    if (sameTarget && updateDrawingPropsMeta(obj)) return;
    const pct = Math.round((obj.scaleX || 1) * 100);
    const w = Math.round(obj.getScaledWidth());
    const h = Math.round(obj.getScaledHeight());
    const adjustHint =
      activeTool === "drawing"
        ? `<p class="prop-meta props-hint">角をドラッグでサイズ変更 · Esc で終了</p>`
        : "";
    content.innerHTML = `
      <p class="prop-meta">${pct}% · ${w}×${h}px</p>
      ${adjustHint}
      <button class="btn btn-ghost btn-block btn-sm" id="btn-fit-drawing">全体にフィット</button>
    `;
    document.getElementById("btn-fit-drawing")?.addEventListener("click", () => {
      fitDrawing(true);
      pushHistory();
      scheduleAutoSave();
      updateProps();
      flashStatus("全体表示");
    });
    return;
  }

  if (obj.objectType === "memo") {
    lastPropsTargetKey = propsTargetKey(obj);
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
    const key = propsTargetKey(obj);
    const sameTarget = lastPropsTargetKey === key;
    lastPropsTargetKey = key;
    if (sameTarget) {
      updateZoneSizeMetaEl(obj);
      form.hidden = false;
      syncZonePropsForm(obj);
      return;
    }
    form.hidden = false;
    const metrics = obj._zoneMetrics;
    const sizeBlock = metrics
      ? `<p class="prop-meta zone-size-meta">${esc(formatZoneSizeText(metrics, zoneLabelOpts(obj)).replace("\n", " · "))}</p>`
      : "";
    content.innerHTML = `
      ${sizeBlock}
      ${renderZoneDimToggles(obj)}
      <div class="zone-prop-actions">
        <button type="button" class="btn btn-primary btn-sm" id="btn-shape-zone">⬡ 形を修正</button>
        <button type="button" class="btn btn-danger btn-sm zone-delete-btn" id="btn-delete-zone" title="削除">🗑</button>
      </div>
    `;
    bindZoneDimToggles(obj);
    document.getElementById("btn-shape-zone")?.addEventListener("click", () => {
      enterZoneVertexEditMode(obj, false);
    });
    document.getElementById("btn-delete-zone")?.addEventListener("click", () => deleteZone(obj));
    document.getElementById("prop-label").closest(".prop-field").hidden = false;
    if (memoField) memoField.hidden = false;
    document.querySelectorAll("#props-form .prop-row").forEach((row) => {
      row.hidden = true;
    });
    document.getElementById("prop-rotation").closest(".prop-field").hidden = true;
    document.getElementById("prop-stroke").closest(".prop-field").hidden = true;
    syncZonePropsForm(obj);
    return;
  }

  lastPropsTargetKey = propsTargetKey(obj);
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

  if (obj.objectType === "part" && (obj.partMarkRole || obj._objects?.some((o) => o.type === "text" && (o.text === "✕" || o.text === "○")))) {
    const role = obj.partMarkRole;
    const roleNames = {
      demolish: "取り壊し",
      build: "制作",
      "move-from": "移動元",
      "move-to": "移動先",
      keep: "残す",
    };
    const roleLabel = roleNames[role] || obj.partLabel || "記号";
    let indexBlock = "";
    if (role === "move-from") {
      indexBlock = `
        <label class="prop-field mini">文字
          <input type="text" id="prop-mark-index" maxlength="3" placeholder="A" />
        </label>
      `;
    } else if (role === "move-to") {
      const opts = getMoveFromIndices();
      const options = (opts.length ? opts : ["A"])
        .map((i) => `<option value="${esc(i)}">${esc(i)}</option>`)
        .join("");
      indexBlock = `
        <label class="prop-field mini">移動元
          <select id="prop-mark-link">${options}</select>
        </label>
      `;
    }
    form.hidden = false;
    content.innerHTML = `
      <p class="prop-meta"><strong>${esc(roleLabel)}</strong></p>
      ${indexBlock}
    `;
    document.getElementById("prop-label").closest(".prop-field").hidden = true;
    document.querySelectorAll("#props-form .prop-row").forEach((row) => {
      row.hidden = true;
    });
    document.getElementById("prop-rotation").closest(".prop-field").hidden = true;
    document.getElementById("prop-stroke").closest(".prop-field").hidden = false;
    const rect = getPartBodyRect(obj);
    document.getElementById("prop-fill").value = rgbToHex(rect?.fill) || "#fee2e2";
    document.getElementById("prop-stroke").value = rgbToHex(rect?.stroke) || "#dc2626";
    const idxInput = document.getElementById("prop-mark-index");
    if (idxInput) {
      idxInput.value = obj.partMarkIndex || "";
      idxInput.addEventListener("change", (e) => {
        obj.set({ partMarkIndex: e.target.value.trim().toUpperCase() });
        refreshMarkPartDisplay(obj);
        canvas.requestRenderAll();
        pushHistory();
        scheduleAutoSave();
      });
    }
    const linkSel = document.getElementById("prop-mark-link");
    if (linkSel) {
      linkSel.value = obj.partLinkIndex || linkSel.value;
      linkSel.addEventListener("change", (e) => {
        obj.set({ partLinkIndex: e.target.value });
        refreshMarkPartDisplay(obj);
        canvas.requestRenderAll();
        pushHistory();
        scheduleAutoSave();
      });
    }
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
  if (isRestoringHistory) return;
  cancelPendingAutoSave();
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
  if (!currentDrawingId || isRestoringHistory) return;
  saveDesign(pageKey(), {
    objects: getUserObjects().map((o) => o.toObject(getSerializeProps())),
    viewport: canvas.viewportTransform?.slice() ?? [1, 0, 0, 1, 0, 0],
    mmPerImagePx: currentMmPerImagePx,
    scaleCalibrated,
    scaleCalibSummary,
    scaleHudMinimized,
    workBoundaryCanvasPoints: getWorkBoundaryPoints(),
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

function restoreDesign(key, data = loadDesign(key), opts = {}) {
  return new Promise((resolve) => {
    currentMmPerImagePx = data?.mmPerImagePx ?? null;
    if (data?.scaleCalibrated != null) scaleCalibrated = !!data.scaleCalibrated;
    scaleCalibSummary = data?.scaleCalibSummary ?? null;

    if (!data) {
      resolve();
      return;
    }

    if (!opts.skipViewport && data.viewport?.length === 6) {
      applySavedViewport(data.viewport);
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
      purgeOrphanZoneDimensions(canvas);
      resolve();
    });
  });
}

function applyPartVisibility() {
  if (!canvas) return;
  canvas.getObjects().forEach((o) => {
    if (o.objectType !== "part") return;
    const isMark = !!o.partMarkRole || o._objects?.some((c) => c.type === "text" && (c.text === "✕" || c.text === "○"));
    const show = isMark ? MARKS_UI_ENABLED : MACHINES_UI_ENABLED;
    o.set({
      visible: show,
      evented: show,
      selectable: show,
    });
  });
  canvas.requestRenderAll();
}

function applyMachinesVisibility() {
  applyPartVisibility();
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

// ── Keyboard nudge (arrow keys) ───────────────────
const NUDGE_STEP_FINE = 1;
const NUDGE_STEP_FAST = 10;
const NUDGE_HOLD_DELAY_MS = 350;
const NUDGE_FAST_INTERVAL_MS = 45;

let nudgeHoldTimer = null;
let nudgeFastInterval = null;
let nudgeDirty = false;
let nudgeActiveKey = null;

function nudgeDeltaForKey(key) {
  switch (key) {
    case "ArrowLeft": return { dx: -1, dy: 0 };
    case "ArrowRight": return { dx: 1, dy: 0 };
    case "ArrowUp": return { dx: 0, dy: -1 };
    case "ArrowDown": return { dx: 0, dy: 1 };
    default: return null;
  }
}

function clearNudgeRepeat() {
  if (nudgeHoldTimer) {
    clearTimeout(nudgeHoldTimer);
    nudgeHoldTimer = null;
  }
  if (nudgeFastInterval) {
    clearInterval(nudgeFastInterval);
    nudgeFastInterval = null;
  }
  nudgeActiveKey = null;
}

function canNudgeSelection() {
  if (!canvas || activeTool !== "select") return false;
  if (pendingPlacementZone || zoneVertexEditCleanup) return false;
  if (scaleCalibCleanup || scaleCalibPendingPoints) return false;
  const obj = canvas.getActiveObject();
  if (!obj || obj.type === "activeSelection") return false;
  if (!obj.objectType || obj.objectType === "workBoundary") return false;
  if (obj.lockMovementX && obj.lockMovementY) return false;
  return true;
}

function nudgeSelectedObject(dx, dy, fast = false) {
  const step = fast ? NUDGE_STEP_FAST : NUDGE_STEP_FINE;
  const obj = canvas.getActiveObject();
  if (!obj) return;

  if (obj.objectType === "drawing" && drawingImage && !drawingTransformBefore) {
    drawingTransformBefore = captureDrawingState(drawingImage);
  }

  obj.set({
    left: obj.left + dx * step,
    top: obj.top + dy * step,
  });
  obj.setCoords();

  if (obj.objectType === "zone") {
    refreshZoneOnCanvas(obj, computeZoneMetricsFor(obj));
  }
  updatePropsLive();
  nudgeDirty = true;
  canvas.requestRenderAll();
}

function finishNudgeSession() {
  if (!nudgeDirty) return;
  nudgeDirty = false;
  const obj = canvas?.getActiveObject();
  if (!obj) return;

  if (obj.objectType === "zone") {
    refreshZoneOnCanvas(obj, computeZoneMetricsFor(obj));
    refreshZoneHooksList();
  }
  if (obj.objectType === "drawing") {
    onDrawingTransformEnd();
    return;
  }
  pushHistory();
  updateProps();
  scheduleAutoSave();
}

function handleArrowKeyDown(e) {
  const delta = nudgeDeltaForKey(e.key);
  if (!delta || !canNudgeSelection()) return;

  e.preventDefault();

  if (e.repeat && nudgeFastInterval) return;

  if (nudgeActiveKey && e.key !== nudgeActiveKey) {
    finishNudgeSession();
    clearNudgeRepeat();
  }

  nudgeActiveKey = e.key;
  nudgeSelectedObject(delta.dx, delta.dy, false);

  if (!nudgeHoldTimer && !nudgeFastInterval) {
    nudgeHoldTimer = setTimeout(() => {
      nudgeHoldTimer = null;
      const key = nudgeActiveKey;
      const held = nudgeDeltaForKey(key);
      if (!held) return;
      nudgeFastInterval = setInterval(() => {
        if (nudgeActiveKey !== key || !canNudgeSelection()) {
          clearNudgeRepeat();
          finishNudgeSession();
          return;
        }
        nudgeSelectedObject(held.dx, held.dy, true);
      }, NUDGE_FAST_INTERVAL_MS);
    }, NUDGE_HOLD_DELAY_MS);
  }
}

function handleArrowKeyUp(e) {
  if (!nudgeDeltaForKey(e.key)) return;
  if (e.key !== nudgeActiveKey) return;
  clearNudgeRepeat();
  finishNudgeSession();
}

function canCopyPasteSelection() {
  if (!canvas || activeTool !== "select") return false;
  if (pendingPlacementZone || zoneVertexEditCleanup) return false;
  if (scaleCalibCleanup || scaleCalibPendingPoints) return false;
  return true;
}

function isCopyableObject(obj) {
  if (!obj || obj.type === "activeSelection") return false;
  if (!obj.objectType || obj.objectType === "drawing" || obj.objectType === "workBoundary") return false;
  return true;
}

function copySelectedObject() {
  const obj = canvas?.getActiveObject();
  if (!isCopyableObject(obj)) return false;
  clipboardObjectData = obj.toObject(getSerializeProps());
  return true;
}

function preparePastedObjectData(data) {
  const copy = JSON.parse(JSON.stringify(data));
  copy.left = (copy.left || 0) + PASTE_OFFSET;
  copy.top = (copy.top || 0) + PASTE_OFFSET;
  if (copy.objectType === "zone" || copy.objectType === "fillArea") {
    copy.zoneInstanceId = crypto.randomUUID();
  }
  if (copy.objectType === "part" && copy.partMarkRole === "move-from") {
    copy.partMarkIndex = getNextMarkIndex();
  }
  if (copy.objectType === "memo" && copy.memoData) {
    copy.memoData = { ...copy.memoData, id: crypto.randomUUID() };
  }
  return copy;
}

function finalizePastedObject(obj) {
  if (obj.objectType === "fillArea" || obj.objectType === "zone") {
    upgradeZoneObject(obj);
    ensureZoneDimensionMarkers(obj);
    refreshZoneOnCanvas(obj, computeZoneMetricsFor(obj));
  } else if (obj.objectType === "part") {
    upgradePartGroup(obj);
  }
  obj._skipHistory = true;
  canvas.add(obj);
  delete obj._skipHistory;
  applyInteractiveControls(obj);
  obj.setCoords();
}

function pasteClipboardObject() {
  if (!clipboardObjectData || !canvas) return false;
  const data = preparePastedObjectData(clipboardObjectData);
  fabric.util.enlivenObjects([data], (objs) => {
    const obj = objs?.[0];
    if (!obj) return;
    finalizePastedObject(obj);
    clipboardObjectData = obj.toObject(getSerializeProps());
    if (drawingImage) drawingImage.sendToBack();
    canvas.setActiveObject(obj);
    canvas.requestRenderAll();
    if (obj.objectType === "zone") refreshZoneHooksList();
    purgeOrphanZoneDimensions(canvas);
    pushHistory();
    scheduleAutoSave();
    updateProps();
    const label = obj.zoneName || obj.partLabel || obj.memoData?.title || "オブジェクト";
    flashStatus(`「${label}」を複製しました`);
  });
  return true;
}

// ── Keyboard ──────────────────────────────────────
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;

    if (scaleCalibCleanup || scaleCalibPendingPoints) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelScaleCalibration();
        return;
      }
    }

    if (pendingPlacementZone) {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmZoneVertexEdit();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelZoneVertexEdit();
        return;
      }
    }

    if (e.key === "Escape" && activeTool === "drawing") {
      e.preventDefault();
      setTool("select");
      return;
    }

    if (e.key === "Escape" && activeTool === "select" && canvas.getActiveObject()) {
      e.preventDefault();
      clearCanvasSelection();
      return;
    }

    if (e.code === "Space") {
      spaceDown = true;
      e.preventDefault();
      updateCanvasCursor();
    }
    if (e.key === "Delete" || (e.key === "Backspace" && activeTool === "select")) {
      e.preventDefault();
      deleteSelected();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      if (canCopyPasteSelection() && copySelectedObject()) {
        e.preventDefault();
        flashStatus("コピーしました");
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      if (canCopyPasteSelection() && clipboardObjectData) {
        e.preventDefault();
        pasteClipboardObject();
      }
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
    else if (e.key === "z" || e.key === "Z") setTool("zone");
    if (e.key === "v" || e.key === "V") setTool("select");
    if (e.key === "d" || e.key === "D") setTool("drawing");
    if (e.key === "h" || e.key === "H") setTool("pan");
    handleArrowKeyDown(e);
  });
  document.addEventListener("keyup", (e) => {
    handleArrowKeyUp(e);
    if (e.code === "Space") {
      spaceDown = false;
      isPanning = false;
      updateCanvasCursor();
    }
  });
  window.addEventListener("blur", () => {
    clearNudgeRepeat();
    finishNudgeSession();
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

function setStatusError(msg) {
  statusEl.textContent = msg;
  statusEl.dataset.base = msg;
  statusEl.classList.add("status-error");
}

function clearStatusError() {
  statusEl.classList.remove("status-error");
}

function flashStatus(msg) {
  setStatus(msg);
  clearStatusError();
  setTimeout(() => {
    const sheet = getCurrentSheet(currentDrawingId);
    if (sheet) {
      const proj = document.getElementById("project-select").selectedOptions[0]?.textContent || "";
      const pageNote =
        drawingPdfPageCount > 1 ? `（${drawingPdfPageCount}ページ）` : ` — ページ ${currentPage}`;
      setStatus(`${proj} / ${sheet.name}${pageNote}`);
    }
  }, 4000);
}

function rgbaToHex(color) {
  if (!color) return null;
  if (color.startsWith("#")) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}
