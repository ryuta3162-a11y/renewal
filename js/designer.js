import { DRAWINGS, DEFAULT_PARTS, MASTER_PROJECT_ID, MACHINES_UI_ENABLED, MARKS_UI_ENABLED, getMarkPaletteParts, DEFAULT_PLAN_WIDTH_MM } from "./constants.js";
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
  refreshMarkPartDisplay,
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
let pendingPlacementZone = null;
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
let scaleCalibrated = false;
let scaleCalibSummary = null;
let scaleCalibCleanup = null;
let scaleCalibPendingPoints = null;
let scaleHudMinimized = false;
let workBoundaryObject = null;
let shapeDrawInProgress = null;
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
  canvas.on("selection:created", (e) => {
    if (pendingPlacementZone && e.selected?.[0] !== pendingPlacementZone) {
      canvas.setActiveObject(pendingPlacementZone);
    }
    e.selected?.forEach(applyInteractiveControls);
    updateProps();
  });
  canvas.on("selection:updated", (e) => {
    if (pendingPlacementZone && e.selected?.[0] !== pendingPlacementZone) {
      canvas.setActiveObject(pendingPlacementZone);
    }
    e.selected?.forEach(applyInteractiveControls);
    updateProps();
  });
  canvas.on("selection:cleared", () => {
    if (pendingPlacementZone) {
      canvas.setActiveObject(pendingPlacementZone);
      return;
    }
    updateProps();
  });
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
  cancelPendingAutoSave();
  if (!discardPendingPlacementIfNeeded("図面を切り替える")) return;
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
  cancelPendingAutoSave();
  setStatus("図面を読み込み中…");
  currentDrawingId = id;
  document.getElementById("drawing-select").value = id;
  try {
    isRestoringHistory = true;
    pendingPlacementZone = null;
    showPlacementHud(false);
    canvas.clear();
    drawingImage = null;
    polygonCleanup = null;
    resizeCanvas();
    const saved = loadDesign(pageKey());
    scaleCalibrated = !!saved?.scaleCalibrated;
    scaleCalibSummary = saved?.scaleCalibSummary ?? null;
    scaleHudMinimized = saved?.scaleHudMinimized ?? !!saved?.scaleCalibrated;
    await loadSheetBackground(sheet);
    resizeCanvas();
    placeDrawingOnCanvas(saved?.drawingTransform);
    await restoreDesign(pageKey(), saved, { skipViewport: true });
    applySavedViewport(saved?.viewport);
    if (!currentMmPerImagePx) tryDefaultScale();
    fillScaleTsuboFromSheet();
    refreshAllZoneMetrics();
    updateScaleUI();
    if (saved?.workBoundaryCanvasPoints?.length) {
      applyWorkBoundary(saved.workBoundaryCanvasPoints);
    }
    isRestoringHistory = false;
    applyMachinesVisibility();
    refreshZoneHooksList();
    persistCurrent();
    pushHistory(true);
    if (!drawingImage) {
      throw new Error("図面画像の生成に失敗しました");
    }
    const proj = document.getElementById("project-select").selectedOptions[0]?.textContent || "";
    setStatus(`${proj} / ${sheet.name} — ページ ${currentPage}`);
  } catch (err) {
    isRestoringHistory = false;
    cancelPendingAutoSave();
    setStatus(`図面の読み込みに失敗: ${err?.message || err} — 図面を切り替えるか再読み込みしてください`);
    console.error(err);
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
        configureDrawingResize(img, activeTool === "select");
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
  const scale = Math.min(
    (canvas.getWidth() - pad * 2) / iw,
    (canvas.getHeight() - pad * 2) / ih
  );
  if (!Number.isFinite(scale) || scale <= 0) return;
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
  } else {
    const pdf = await pdfToDataUrl(getSheetPdfFile(sheet), 1, 2);
    await loadDrawingImage(pdf.dataUrl);
  }
  const saved = loadDesign(pageKey());
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
  updateScaleUI();
  if (saved?.workBoundaryCanvasPoints?.length) {
    applyWorkBoundary(saved.workBoundaryCanvasPoints);
  }
  isRestoringHistory = false;
  persistCurrent();
  pushHistory(true);
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
}

function refreshZoneOnCanvas(zone, metrics) {
  refreshZoneDisplay(zone, metrics, drawingImage, currentMmPerImagePx);
}

function showPlacementHud(show) {
  const hud = document.getElementById("zone-place-hud");
  if (hud) hud.hidden = !show;
  canvasWrap?.classList.toggle("placing-zone", !!show);
}

function enterZonePlacementMode(zone) {
  if (!zone) return;
  if (pendingPlacementZone && pendingPlacementZone !== zone) {
    confirmZonePlacement();
  }
  pendingPlacementZone = zone;
  zone._zonePendingFix = true;
  zone._skipHistory = true;
  zone.set({
    hasControls: true,
    hasBorders: true,
    lockScaling: true,
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
    lockSkewingX: true,
    lockSkewingY: true,
    borderColor: "#f59e0b",
    borderDashArray: [8, 4],
    cornerColor: "#f59e0b",
    cornerStrokeColor: "#fff",
    hoverCursor: "move",
  });
  applyInteractiveControls(zone);
  ensureDrawingScale();
  ensureZoneDimensionMarkers(zone);
  refreshZoneOnCanvas(zone, computeZoneMetricsFor(zone));
  activeTool = "select";
  document.querySelectorAll("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === "select");
  });
  canvas.isDrawingMode = false;
  canvas.selection = true;
  canvas.skipTargetFind = false;
  canvas.setActiveObject(zone);
  showPlacementHud(true);
  hideDrawDimHud();
  updateCanvasCursor();
  updateDrawingInteractivity();
  updateProps();
  canvas.requestRenderAll();
  flashStatus("Enter で固定");
}

function confirmZonePlacement() {
  const zone = pendingPlacementZone;
  if (!zone) return;
  pendingPlacementZone = null;
  delete zone._zonePendingFix;
  delete zone._skipHistory;
  zone.set({
    borderColor: "#60a5fa",
    borderDashArray: null,
    cornerColor: "#ffffff",
    cornerStrokeColor: "#3b82f6",
    lockScaling: false,
    lockRotation: false,
    lockScalingX: false,
    lockScalingY: false,
    lockSkewingX: false,
    lockSkewingY: false,
  });
  applyInteractiveControls(zone);
  showPlacementHud(false);
  finalizeNewZone(zone);
  updateProps();
}

function cancelZonePlacement() {
  const zone = pendingPlacementZone;
  if (!zone) return;
  pendingPlacementZone = null;
  showPlacementHud(false);
  hideDrawDimHud();
  canvas.remove(zone);
  canvas.discardActiveObject();
  refreshZoneHooksList();
  updateProps();
  canvas.requestRenderAll();
  flashStatus("取消");
}

function discardPendingPlacementIfNeeded(actionLabel) {
  if (!pendingPlacementZone) return true;
  if (!confirm(`配置中の区画があります。${actionLabel}すると破棄されます。よろしいですか？`)) {
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
  canvas
    ?.getObjects()
    .filter((o) => o._scalePreview)
    .forEach((o) => canvas.remove(o));
  canvas?.requestRenderAll();
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

function cancelScaleCalibration() {
  if (scaleCalibCleanup) {
    scaleCalibCleanup();
    scaleCalibCleanup = null;
  }
  scaleCalibPendingPoints = null;
  removeScalePreviews();
  setScaleCalibMode("idle");
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
  cancelScaleCalibration();
  applyWorkBoundary(boundaryPts);
  scaleHudMinimized = true;
  refreshAllZoneMetrics();
  updateScaleUI();
  refreshZoneHooksList();
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
  applyWorkBoundary(null);
  cancelScaleCalibration();
  if (polygonCleanup) {
    polygonCleanup();
    polygonCleanup = null;
  }
  removeOrphanZonePreviews(canvas);

  setScaleCalibMode("drawing");

  scaleCalibCleanup = enableCalibPolygonDraw(canvas, (points) => {
    scaleCalibCleanup = null;
    if (!points?.length) {
      cancelScaleCalibration();
      return;
    }
    scaleCalibPendingPoints = points;
    setScaleCalibMode("ready");
    document.getElementById("scale-known-tsubo")?.focus();
  });
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
    <ul class="zone-hook-list" data-list-for="${preset.id}"></ul>
  `;

  const openBtn = hook.querySelector(".btn-zone-open");

  hook.querySelector(".zone-hook-title-row")?.addEventListener("click", (e) => {
    if (e.target.closest(".zone-hook-edit, .zone-hook-del")) return;
    selectZonePreset(preset, false);
  });

  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
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
    const openBtn = hook.querySelector(".btn-zone-open");
    openBtn?.setAttribute("aria-expanded", String(!collapsed));
    if (openBtn) openBtn.textContent = collapsed ? "開く" : "閉じる";
    state[hook.dataset.presetId] = collapsed;
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
    const countEl = document.querySelector(`[data-count-for="${preset.id}"]`);
    if (countEl) countEl.textContent = String(counts[preset.id] || 0);

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

function setupZoneModal() {
  document.getElementById("zone-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("zone-name").value.trim();
    const memo = document.getElementById("zone-memo").value.trim();
    if (!name) {
      flashStatus("エリア名を入力してください");
      return;
    }

    if (editingZone) {
      editingZone.set({ zoneName: name, zoneMemo: memo });
      refreshZoneOnCanvas(editingZone, computeZoneMetricsFor(editingZone));
      canvas.requestRenderAll();
    }
    document.getElementById("zone-modal").close();
    editingZone = null;
    pushHistory();
    persistCurrent();
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
  removeOrphanZonePreviews(canvas);
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

  if (activeTool === "line") {
    cancelShapeDrawInProgress();
    disableShapeDraw();
    setTool("select");
    return;
  }

  if (activeTool === "pen") {
    canvas.isDrawingMode = false;
    setTool("select");
    return;
  }

  if (deleteObjectOnRightClick(opt.target)) return;

  const active = canvas.getActiveObject();
  if (active && deleteObjectOnRightClick(active)) return;
}

function onCanvasMouseDown(opt) {
  const e = opt.e;

  if (e.button === 2) {
    handleCanvasRightClick(opt);
    return;
  }

  if (scaleCalibCleanup) return;

  if (activeTool === "line" || activeTool === "pen" || activeTool === "zone") return;

  if (e.button === 0 && activeTool === "select" && opt.target?.objectType === "zone") {
    zoneTapStart = { x: e.clientX, y: e.clientY, target: opt.target };
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

async function onCanvasMouseUp(opt) {
  if (scaleCalibCleanup) return;

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
    : "";
  zoneTooltip.innerHTML = memo
    ? `<strong>${esc(zone.zoneName || "区画")}</strong>${sizeHtml}${esc(memo)}`
    : `<strong>${esc(zone.zoneName || "区画")}</strong>${sizeHtml}`;
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
    flashStatus("全体");
  });
}

function setTool(tool) {
  if (pendingPlacementZone && tool !== "select") return;
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
        enterZonePlacementMode(zone);
      },
      (points) => computeZoneMetricsFromCanvasPoints(points, drawingImage, currentMmPerImagePx),
      (a, b) => segmentMetrics(a, b, drawingImage, currentMmPerImagePx),
      (metrics) => showDrawDimHud(metrics)
    );
  } else if (tool === "place" && canPlaceParts()) {
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
  if (canPlaceParts() && activeTool === "place") {
    canvas.setCursor("crosshair");
    return;
  }
  if (activeTool === "line" || activeTool === "zone") {
    canvas.setCursor("crosshair");
    return;
  }
  if (pendingPlacementZone) {
    canvas.setCursor("move");
    return;
  }
  canvas.setCursor("default");
}

let shapeHandler = null;

function enableShapeDraw(kind) {
  disableShapeDraw();
  shapeDrawInProgress = { start: null, shape: null, liveDimLabel: null };

  shapeHandler = (opt) => {
    const raw = canvas.getPointer(opt.e);
    if (!isInsideWorkBoundary(raw) && opt.e.type === "mousedown") {
      flashStatus("枠の外");
      return;
    }
    const ptr = snapPoint(raw, canvas, opt.e);
    const t = opt.e.type;
    if (t === "mousedown") {
      shapeDrawInProgress.start = ptr;
      shapeDrawInProgress.shape = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
        stroke: "#ef4444",
        strokeWidth: 2,
        selectable: false,
        evented: false,
        _skipHistory: true,
      });
      canvas.add(shapeDrawInProgress.shape);
    } else if (t === "mousemove" && shapeDrawInProgress.start && shapeDrawInProgress.shape) {
      shapeDrawInProgress.shape.set({ x2: ptr.x, y2: ptr.y });
      const metrics = segmentMetrics(shapeDrawInProgress.start, ptr, drawingImage, currentMmPerImagePx);
      showDrawDimHud(metrics);
      const text = formatEdgeLength(metrics);
      const mx = (shapeDrawInProgress.start.x + ptr.x) / 2;
      const my = (shapeDrawInProgress.start.y + ptr.y) / 2;
      if (!shapeDrawInProgress.liveDimLabel) {
        shapeDrawInProgress.liveDimLabel = new fabric.Text(text, {
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
        canvas.add(shapeDrawInProgress.liveDimLabel);
      } else {
        shapeDrawInProgress.liveDimLabel.set({ text, left: mx, top: my - 8 });
      }
      canvas.requestRenderAll();
    } else if (t === "mouseup" && shapeDrawInProgress.start && shapeDrawInProgress.shape) {
      const x1 = shapeDrawInProgress.start.x;
      const y1 = shapeDrawInProgress.start.y;
      const x2 = ptr.x;
      const y2 = ptr.y;
      if (!isInsideWorkBoundary({ x: x2, y: y2 })) {
        cancelShapeDrawInProgress();
        setTool("select");
        flashStatus("枠の外");
        return;
      }
      const metrics = segmentMetrics(shapeDrawInProgress.start, ptr, drawingImage, currentMmPerImagePx);
      canvas.remove(shapeDrawInProgress.shape);
      if (shapeDrawInProgress.liveDimLabel) canvas.remove(shapeDrawInProgress.liveDimLabel);
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
        evented: true,
        hoverCursor: "pointer",
        subTargetCheck: false,
        perPixelTargetFind: true,
      });
      canvas.add(group);
      canvas.setActiveObject(group);

      shapeDrawInProgress = null;
      pushHistory();
      setTool("select");
    }
  };
  canvas.on("mouse:down", shapeHandler);
  canvas.on("mouse:move", shapeHandler);
  canvas.on("mouse:up", shapeHandler);
}

function cancelShapeDrawInProgress() {
  if (!shapeDrawInProgress) return;
  if (shapeDrawInProgress.shape) canvas.remove(shapeDrawInProgress.shape);
  if (shapeDrawInProgress.liveDimLabel) canvas.remove(shapeDrawInProgress.liveDimLabel);
  shapeDrawInProgress = null;
  hideDrawDimHud();
  canvas.requestRenderAll();
}

function disableShapeDraw() {
  cancelShapeDrawInProgress();
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
  if (pendingPlacementZone) {
    cancelZonePlacement();
    return;
  }
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
    updateProps();
  };
  document.getElementById("prop-zone-tsubo")?.addEventListener("change", onDimToggle);
  document.getElementById("prop-zone-edge-lengths")?.addEventListener("change", onDimToggle);
  document.getElementById("prop-zone-bbox-dims")?.addEventListener("change", onDimToggle);
}

function updateProps() {
  const obj = canvas.getActiveObject();
  const content = document.getElementById("props-content");
  const form = document.getElementById("props-form");

  if (pendingPlacementZone) {
    const z = pendingPlacementZone;
    form.hidden = true;
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
    content.innerHTML = `<p class="props-empty">—</p>`;
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
      <p class="prop-meta">${pct}% · ${w}×${h}px</p>
      <button class="btn btn-ghost btn-block btn-sm" id="btn-fit-drawing">全体</button>
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
      ? `<p class="prop-meta zone-size-meta">${esc(formatZoneSizeText(metrics, zoneLabelOpts(obj)).replace("\n", " · "))}</p>`
      : "";
    content.innerHTML = `
      <p class="prop-meta">${esc(obj.zoneName || "区画")}</p>
      ${sizeBlock}
      ${renderZoneDimToggles(obj)}
      ${memo ? `<p class="prop-meta">${esc(memo)}</p>` : ""}
      <div class="zone-prop-actions">
        <button class="btn btn-primary btn-sm" id="btn-edit-zone">✎</button>
        <button class="btn btn-danger btn-sm zone-delete-btn" id="btn-delete-zone" title="削除">🗑</button>
      </div>
    `;
    bindZoneDimToggles(obj);
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
        confirmZonePlacement();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelZonePlacement();
        return;
      }
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
