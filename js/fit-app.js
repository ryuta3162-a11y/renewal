import {
  FIT_MACHINES,
  FIT_CATEGORIES,
  formatMm,
  formatPrice,
  occupiedSize,
} from "./fit-catalog.js";
import {
  buildPlanFromPage,
  loadStudioDesigns,
} from "./fit-plan.js";
import { pdfToDataUrl, pdfBufferToDataUrl } from "./pdf-loader.js";
import { resolveDrawingUrl, resolveDrawingFile, DEFAULT_PLAN_WIDTH_MM, DRAWINGS } from "./constants.js";

const STORAGE_PLACES = "renewal-fit-placements-v2";
const STORAGE_SIZES = "renewal-fit-size-overrides";
const FIT_FLOORS = DRAWINGS.filter((d) => d.id === "kyodo-8" || d.id === "kyodo-9");

const state = {
  sheets: [],
  sheetId: null,
  floorId: "kyodo-8",
  machineId: null,
  rotated: false,
  category: "all",
  query: "",
  placements: loadJson(STORAGE_PLACES, {}),
  sizeOverrides: loadJson(STORAGE_SIZES, {}),
  hoverMm: null,
  drawing: null,
};

let planCanvas;
let planCtx;
let planView = { scale: 1, ox: 0, oy: 0 };
let draggingPlaceId = null;

init();

async function init() {
  bindUi();
  setupPlanCanvas();
  await loadSheets();
  selectFloor("kyodo-8");
  renderAll();
  tryAutoLoadDrawing().catch(() => {});
  window.addEventListener("resize", () => {
    resizePlan();
    drawPlan();
  });
}

function bindUi() {
  document.getElementById("floor-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-floor]");
    if (!btn) return;
    selectFloor(btn.dataset.floor);
    renderAll();
    tryAutoLoadDrawing().catch(() => {});
  });

  document.getElementById("btn-drawing").addEventListener("click", () => {
    document.getElementById("import-drawing").click();
  });
  document.getElementById("import-drawing").addEventListener("change", onImportDrawing);

  document.getElementById("btn-rotate").addEventListener("click", () => {
    state.rotated = !state.rotated;
    renderAll();
  });

  document.getElementById("machine-search").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderMachines();
  });
  document.getElementById("filters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (!btn) return;
    state.category = btn.dataset.cat;
    renderMachines();
  });
  document.getElementById("machine-size-form")?.addEventListener("input", onSizeOverride);

  const stage = document.getElementById("plan-stage");
  stage.addEventListener("dragover", (e) => e.preventDefault());
  stage.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) await loadDrawingFile(file);
  });
}

function selectFloor(floorId) {
  state.floorId = floorId;
  const sheet = state.sheets.find((s) => s.floorId === floorId);
  state.sheetId = sheet?.id || null;
  state.drawing = null;
}

async function loadSheets() {
  const sheets = FIT_FLOORS.map((d) => ({
    id: `floor:${d.id}`,
    name: d.name,
    floorId: d.id,
    plan: emptyFloorPlan(d),
    drawingFile: d.file,
  }));

  const designs = await loadStudioDesigns();
  designs.forEach((d) => {
    const floorId = normalizeFloorId(d.sheetId);
    if (!floorId) return;
    const plan = buildPlanFromPage(d.page, {
      sheetId: d.sheetId,
      sheetName: floorName(floorId),
      projectId: d.projectId,
      drawingFile: floorFile(floorId),
    });
    if (!plan) return;
    const idx = sheets.findIndex((s) => s.floorId === floorId);
    if (idx >= 0) {
      sheets[idx] = { ...sheets[idx], id: `idb:${d.key}`, plan };
    }
  });

  state.sheets = sheets;
}

function emptyFloorPlan(drawing) {
  const widthMm = drawing.planWidthMm || DEFAULT_PLAN_WIDTH_MM;
  const depthMm = drawing.planAreaM2
    ? Math.round((drawing.planAreaM2 * 1_000_000) / widthMm)
    : Math.round(widthMm * 0.55);
  return {
    sheetId: drawing.id,
    sheetName: drawing.name,
    projectId: "master",
    drawingFile: drawing.file,
    mmPerImagePx: 0,
    zones: [
      {
        id: "floor",
        name: "図面全体",
        color: "#64748b",
        pointsMm: [
          { x: 0, y: 0 },
          { x: widthMm, y: 0 },
          { x: widthMm, y: depthMm },
          { x: 0, y: depthMm },
        ],
        widthMm,
        depthMm,
        heightMm: 2500,
        areaM2: drawing.planAreaM2 || (widthMm * depthMm) / 1_000_000,
      },
    ],
    boundary: [],
  };
}

function normalizeFloorId(sheetId) {
  if (sheetId === "kyodo-8" || sheetId === "経堂原本　2F" || sheetId === "原本-8") return "kyodo-8";
  if (sheetId === "kyodo-9" || sheetId === "経堂原本　3F" || sheetId === "原本-9") return "kyodo-9";
  return FIT_FLOORS.some((d) => d.id === sheetId) ? sheetId : null;
}

function floorName(floorId) {
  return FIT_FLOORS.find((d) => d.id === floorId)?.name || floorId;
}

function floorFile(floorId) {
  return FIT_FLOORS.find((d) => d.id === floorId)?.file || null;
}

async function tryAutoLoadDrawing() {
  const sheet = currentSheet();
  const file = sheet?.drawingFile || sheet?.plan?.drawingFile;
  if (!file) {
    updateHowto();
    return;
  }
  try {
    const path = resolveDrawingFile(file);
    const url = resolveDrawingUrl(path);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadDrawingFromUrl(url, path.split("/").pop());
  } catch {
    updateHowto();
  }
}

async function onImportDrawing(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) await loadDrawingFile(file);
}

async function loadDrawingFile(file) {
  try {
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      const buf = await file.arrayBuffer();
      const rendered = await pdfBufferToDataUrl(buf, 1, 2);
      await setDrawingFromDataUrl(rendered.dataUrl, rendered.width, rendered.height, file.name);
    } else {
      const dataUrl = await readFileAsDataUrl(file);
      const img = await loadHtmlImage(dataUrl);
      await setDrawingFromDataUrl(dataUrl, img.naturalWidth, img.naturalHeight, file.name);
    }
  } catch (err) {
    alert("図面を開けませんでした: " + (err.message || err));
  }
}

async function loadDrawingFromUrl(url, name) {
  if (/\.pdf($|\?)/i.test(url)) {
    const rendered = await pdfToDataUrl(url, 1, 2);
    await setDrawingFromDataUrl(rendered.dataUrl, rendered.width, rendered.height, name || "drawing.pdf");
  } else {
    const img = await loadHtmlImage(url);
    await setDrawingFromDataUrl(url, img.naturalWidth, img.naturalHeight, name || "drawing");
  }
}

async function setDrawingFromDataUrl(dataUrl, widthPx, heightPx, name) {
  const image = await loadHtmlImage(dataUrl);
  const plan = currentPlan();
  let mmPerImagePx = Number(plan?.mmPerImagePx) || 0;
  if (!mmPerImagePx) mmPerImagePx = DEFAULT_PLAN_WIDTH_MM / Math.max(widthPx, 1);

  state.drawing = { image, widthPx, heightPx, mmPerImagePx, name: name || "drawing" };

  if (plan) {
    plan.mmPerImagePx = mmPerImagePx;
    const widthMm = widthPx * mmPerImagePx;
    const depthMm = heightPx * mmPerImagePx;
    const floor = plan.zones?.find((z) => z.id === "floor");
    if (floor) {
      floor.widthMm = widthMm;
      floor.depthMm = depthMm;
      floor.pointsMm = [
        { x: 0, y: 0 },
        { x: widthMm, y: 0 },
        { x: widthMm, y: depthMm },
        { x: 0, y: depthMm },
      ];
      floor.areaM2 = (widthMm * depthMm) / 1_000_000;
    }
  }

  renderAll();
}

function currentSheet() {
  return state.sheets.find((s) => s.id === state.sheetId) || state.sheets.find((s) => s.floorId === state.floorId) || null;
}

function currentPlan() {
  return currentSheet()?.plan || null;
}

function currentMachine() {
  const base = FIT_MACHINES.find((m) => m.id === state.machineId);
  if (!base) return null;
  const over = state.sizeOverrides[base.id];
  return over ? { ...base, ...over } : base;
}

function placeKey() {
  return state.floorId || "kyodo-8";
}

function placementsForSheet() {
  if (!state.placements[placeKey()]) state.placements[placeKey()] = [];
  return state.placements[placeKey()];
}

function savePlacements() {
  localStorage.setItem(STORAGE_PLACES, JSON.stringify(state.placements));
}

function renderAll() {
  renderFloorTabs();
  renderMachines();
  renderDetail();
  renderPlaced();
  updateHowto();
  resizePlan();
  drawPlan();
}

function renderFloorTabs() {
  document.querySelectorAll("#floor-tabs [data-floor]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.floor === state.floorId);
  });
}

function updateHowto() {
  const howto = document.getElementById("fit-howto");
  const empty = document.getElementById("plan-empty");
  const guide = document.getElementById("plan-guide");
  const floorLabel = state.floorId === "kyodo-9" ? "3F" : "2F";

  if (!state.drawing) {
    howto.textContent = `いまは ${floorLabel}。「図面を開く」で 経堂原本　${floorLabel}.pdf を選んでください`;
    empty.hidden = false;
    empty.innerHTML = `「図面を開く」で <strong>経堂原本　${floorLabel}.pdf</strong> を選んでください`;
    guide.hidden = true;
    return;
  }

  empty.hidden = true;
  if (!state.machineId) {
    howto.textContent = `① 左でマシンを選ぶ　→　② 図面をクリックして置く（いま ${floorLabel}）`;
    guide.hidden = true;
  } else {
    howto.textContent = `「${currentMachine()?.label || ""}」を選択中。図面の置きたい場所をクリック`;
    guide.hidden = false;
  }
}

function renderMachines() {
  const host = document.getElementById("filters");
  const cats = ["all", ...FIT_CATEGORIES];
  host.innerHTML = cats
    .map((cat) => {
      const label = cat === "all" ? "すべて" : cat;
      const active = state.category === cat ? "btn-primary" : "btn-ghost";
      return `<button type="button" class="btn btn-xs ${active}" data-cat="${cat}">${label}</button>`;
    })
    .join("");

  const list = document.getElementById("machine-list");
  const machines = FIT_MACHINES.filter((m) => {
    if (state.category !== "all" && m.category !== state.category) return false;
    if (!state.query) return true;
    const hay = `${m.id} ${m.label} ${m.name} ${m.brand}`.toLowerCase();
    return hay.includes(state.query);
  });

  list.innerHTML = machines
    .map((m) => {
      const machine = state.sizeOverrides[m.id] ? { ...m, ...state.sizeOverrides[m.id] } : m;
      const active = m.id === state.machineId ? " active" : "";
      return `<button type="button" class="fit-machine${active}" data-mid="${m.id}">
        <span class="fit-code">${esc(m.id)}</span>
        <span class="fit-machine-name">${esc(m.label)}</span>
        <span class="fit-machine-meta">${formatMm(machine.widthMm)} × ${formatMm(machine.depthMm)}</span>
      </button>`;
    })
    .join("");

  list.querySelectorAll("[data-mid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.machineId = btn.dataset.mid;
      renderAll();
    });
  });
}

function renderDetail() {
  const machine = currentMachine();
  const box = document.getElementById("machine-detail");
  const form = document.getElementById("machine-size-form");
  if (!machine) {
    box.innerHTML = `<p class="fit-hint">左のリストからマシンを選んでください</p>`;
    form.hidden = true;
    return;
  }
  box.innerHTML = `
    <div class="fit-detail-title">${esc(machine.label)}</div>
    <dl class="fit-detail-grid">
      <dt>コード</dt><dd>${esc(machine.id)}</dd>
      <dt>大きさ</dt><dd>${formatMm(machine.widthMm)} × ${formatMm(machine.depthMm)}${state.rotated ? "（90°）" : ""}</dd>
      <dt>税抜</dt><dd>${esc(formatPrice(machine.unitPrice))}</dd>
    </dl>
  `;
  form.hidden = false;
  document.getElementById("size-w").value = (machine.widthMm / 1000).toFixed(2);
  document.getElementById("size-d").value = (machine.depthMm / 1000).toFixed(2);
  document.getElementById("size-h").value = (machine.heightMm / 1000).toFixed(2);
}

function renderPlaced() {
  const host = document.getElementById("placed-list");
  const list = placementsForSheet();
  if (!list.length) {
    host.innerHTML = `<p class="fit-hint">まだ置いていません</p>`;
    return;
  }
  host.innerHTML = list
    .map((p) => {
      const m = resolveMachineById(p.machineId);
      return `<div class="fit-placed" data-pid="${p.id}">
        <span class="fit-placed-name">${esc(m?.label || p.machineId)}</span>
        <span class="fit-placed-meta">${formatMm(p.widthMm)} × ${formatMm(p.depthMm)}</span>
        <div class="fit-placed-actions">
          <button type="button" class="btn btn-danger btn-xs" data-del="${p.id}">削除</button>
        </div>
      </div>`;
    })
    .join("");
  host.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.placements[placeKey()] = placementsForSheet().filter((p) => p.id !== btn.dataset.del);
      savePlacements();
      renderAll();
    });
  });
}

function onSizeOverride() {
  const machine = currentMachine();
  if (!machine) return;
  const base = FIT_MACHINES.find((m) => m.id === machine.id);
  state.sizeOverrides[machine.id] = {
    widthMm: metersToMm("size-w") || base.widthMm,
    depthMm: metersToMm("size-d") || base.depthMm,
    heightMm: metersToMm("size-h") || base.heightMm,
  };
  localStorage.setItem(STORAGE_SIZES, JSON.stringify(state.sizeOverrides));
  renderAll();
}

function setupPlanCanvas() {
  planCanvas = document.getElementById("plan-canvas");
  planCtx = planCanvas.getContext("2d");
  planCanvas.addEventListener("pointerdown", onPlanPointerDown);
  planCanvas.addEventListener("pointermove", onPlanPointerMove);
  planCanvas.addEventListener("pointerup", () => {
    draggingPlaceId = null;
  });
  planCanvas.addEventListener("pointerleave", () => {
    state.hoverMm = null;
    draggingPlaceId = null;
    drawPlan();
  });
}

function resizePlan() {
  const host = document.getElementById("plan-stage");
  const w = host.clientWidth || 1;
  const h = host.clientHeight || 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  planCanvas.width = Math.floor(w * dpr);
  planCanvas.height = Math.floor(h * dpr);
  planCanvas.style.width = `${w}px`;
  planCanvas.style.height = `${h}px`;
  planCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitPlanView(w, h);
}

function fitPlanView(w, h) {
  if (!state.drawing) return;
  const mm = state.drawing.mmPerImagePx;
  const bw = state.drawing.widthPx * mm;
  const bh = state.drawing.heightPx * mm;
  const pad = 24;
  const scale = Math.min((w - pad * 2) / Math.max(bw, 1), (h - pad * 2) / Math.max(bh, 1));
  planView = {
    scale,
    ox: (w - bw * scale) / 2,
    oy: (h - bh * scale) / 2,
  };
}

function mmToScreen(p) {
  return {
    x: p.x * planView.scale + planView.ox,
    y: p.y * planView.scale + planView.oy,
  };
}

function screenToMm(x, y) {
  return {
    x: (x - planView.ox) / planView.scale,
    y: (y - planView.oy) / planView.scale,
  };
}

function drawPlan() {
  const w = planCanvas.clientWidth;
  const h = planCanvas.clientHeight;
  planCtx.clearRect(0, 0, w, h);
  if (!state.drawing) return;

  const mm = state.drawing.mmPerImagePx;
  const origin = mmToScreen({ x: 0, y: 0 });
  const dw = state.drawing.widthPx * mm * planView.scale;
  const dh = state.drawing.heightPx * mm * planView.scale;
  planCtx.drawImage(state.drawing.image, origin.x, origin.y, dw, dh);

  (currentPlan()?.zones || [])
    .filter((z) => z.id !== "floor")
    .forEach((zone) => {
      planCtx.beginPath();
      zone.pointsMm.forEach((p, i) => {
        const s = mmToScreen(p);
        if (i === 0) planCtx.moveTo(s.x, s.y);
        else planCtx.lineTo(s.x, s.y);
      });
      planCtx.closePath();
      planCtx.fillStyle = hexAlpha(zone.color, 0.12);
      planCtx.fill();
      planCtx.strokeStyle = zone.color;
      planCtx.lineWidth = 1.5;
      planCtx.stroke();
    });

  placementsForSheet().forEach((place) => {
    drawMachineFootprint(place.xMm, place.yMm, place.widthMm, place.depthMm, false);
    const m = resolveMachineById(place.machineId);
    const s = mmToScreen({ x: place.xMm, y: place.yMm });
    planCtx.fillStyle = "#fff";
    planCtx.font = "700 11px Segoe UI, sans-serif";
    planCtx.textAlign = "center";
    planCtx.fillText(m?.id || "", s.x, s.y + 4);
  });

  const machine = currentMachine();
  if (machine && state.hoverMm) {
    const size = occupiedSize(machine, state.rotated);
    drawMachineFootprint(state.hoverMm.x, state.hoverMm.y, size.widthMm, size.depthMm, true);
  }
}

function drawMachineFootprint(cx, cy, wMm, dMm, ghost) {
  const hw = wMm / 2;
  const hd = dMm / 2;
  const corners = [
    { x: cx - hw, y: cy - hd },
    { x: cx + hw, y: cy - hd },
    { x: cx + hw, y: cy + hd },
    { x: cx - hw, y: cy + hd },
  ].map(mmToScreen);
  planCtx.beginPath();
  corners.forEach((p, i) => (i === 0 ? planCtx.moveTo(p.x, p.y) : planCtx.lineTo(p.x, p.y)));
  planCtx.closePath();
  planCtx.fillStyle = ghost ? "rgba(59,130,246,0.45)" : "rgba(37,99,235,0.55)";
  planCtx.fill();
  planCtx.strokeStyle = ghost ? "#93c5fd" : "#eff6ff";
  planCtx.lineWidth = 2;
  planCtx.stroke();
}

function onPlanPointerDown(e) {
  if (!state.drawing) return;
  const rect = planCanvas.getBoundingClientRect();
  const mm = screenToMm(e.clientX - rect.left, e.clientY - rect.top);
  const machine = currentMachine();
  if (!machine) {
    alert("先に左のリストからマシンを選んでください");
    return;
  }

  const size = occupiedSize(machine, state.rotated);
  const place = {
    id: crypto.randomUUID(),
    zoneId: "floor",
    machineId: machine.id,
    xMm: mm.x,
    yMm: mm.y,
    rotated: state.rotated,
    widthMm: size.widthMm,
    depthMm: size.depthMm,
  };
  const list = placementsForSheet();
  const idx = list.findIndex((p) => p.machineId === machine.id);
  if (idx >= 0) list[idx] = place;
  else list.push(place);
  savePlacements();
  draggingPlaceId = place.id;
  renderAll();
}

function onPlanPointerMove(e) {
  if (!state.drawing) return;
  const rect = planCanvas.getBoundingClientRect();
  state.hoverMm = screenToMm(e.clientX - rect.left, e.clientY - rect.top);
  if (draggingPlaceId) {
    const place = placementsForSheet().find((p) => p.id === draggingPlaceId);
    if (place) {
      place.xMm = state.hoverMm.x;
      place.yMm = state.hoverMm.y;
      savePlacements();
    }
  }
  drawPlan();
}

function resolveMachineById(id) {
  const base = FIT_MACHINES.find((m) => m.id === id);
  if (!base) return null;
  const over = state.sizeOverrides[id];
  return over ? { ...base, ...over } : base;
}

function metersToMm(id) {
  const n = Number(document.getElementById(id)?.value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 1000);
}

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗"));
    img.src = src;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function hexAlpha(hex, a) {
  const h = String(hex || "#3b82f6").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c]));
}
