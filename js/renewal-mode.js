import {
  RENEWAL_SHEET_ID,
  RENEWAL_MACHINE_DETAILS,
  getRenewalDetailByPart,
  formatPrice,
  buildSearchText,
} from "./renewal-candidate-data.js";

const MODE_CLASS = "renewal-machine-mode";
const PANEL_ID = "renewal-machine-panel";

let capturedCanvas = null;
let paletteObserver = null;
let lastSearch = "";
let lastClickedDetail = null;
let decorateQueued = false;

try {
  installStyles();
  installFabricCanvasHook();
  ensureMachinePanel();
  queueModeRefresh();
} catch (err) {
  console.error("renewal-mode init failed", err);
}

function installStyles() {
  if (document.getElementById("renewal-mode-style")) return;
  const style = document.createElement("style");
  style.id = "renewal-mode-style";
  style.textContent = `
    body.${MODE_CLASS} { --zone-sidebar-width: 390px; }

    body.${MODE_CLASS} .zone-sidebar-head,
    body.${MODE_CLASS} .zone-custom-section,
    body.${MODE_CLASS} .zone-hooks-divider,
    body.${MODE_CLASS} #zone-hooks,
    body.${MODE_CLASS} .zone-sidebar-foot,
    body.${MODE_CLASS} .hook-toolbar,
    body.${MODE_CLASS} .zone-active-label,
    body.${MODE_CLASS} .snap-label,
    body.${MODE_CLASS} [data-tool="zone"],
    body.${MODE_CLASS} [data-tool="drawing"] {
      display: none !important;
    }

    body:not(.${MODE_CLASS}) #${PANEL_ID} { display: none !important; }
    body.${MODE_CLASS} #${PANEL_ID} { display: flex !important; }
    body.${MODE_CLASS} .zone-sidebar-inner { padding: 0.65rem 0.75rem; gap: 0; }
    body.${MODE_CLASS} #machine-preview-panel { display: none !important; }

    .renewal-machine-panel {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      flex-direction: column;
      gap: 0.45rem;
    }
    .renewal-machine-title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.15rem;
    }
    .renewal-machine-title {
      font-size: 0.86rem;
      font-weight: 800;
      line-height: 1.25;
    }
    .renewal-machine-search input {
      width: 100%;
      padding: 0.45rem 0.55rem;
      border: 1px solid var(--border);
      background: var(--surface2);
      color: var(--text);
      border-radius: 6px;
      font-size: 0.78rem;
      font-family: inherit;
      outline: none;
    }
    .renewal-machine-search input:focus { border-color: var(--primary); }

    .renewal-machine-panel #palette {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 0.2rem;
      margin-top: 0.15rem;
    }
    .renewal-machine-panel #palette::-webkit-scrollbar { width: 6px; }
    .renewal-machine-panel #palette::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    body.${MODE_CLASS} .palette-section h4 {
      color: #93c5fd;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      margin: 0.7rem 0 0.3rem;
      padding-bottom: 0.25rem;
      border-bottom: 1px solid var(--border);
    }
    body.${MODE_CLASS} .palette-section:first-child h4 { margin-top: 0; }
    body.${MODE_CLASS} .palette-grid { grid-template-columns: 1fr; gap: 0.34rem; }

    body.${MODE_CLASS} .palette-item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.18rem 0.45rem;
      align-items: start;
      min-height: 0;
      padding: 0.48rem 0.55rem;
      text-align: left;
      border-width: 1px;
      border-radius: 7px;
      background: rgba(36,48,68,0.92);
    }
    body.${MODE_CLASS} .palette-item:hover {
      border-color: var(--primary);
      background: rgba(59,130,246,0.11);
    }
    body.${MODE_CLASS} .palette-item.selected {
      border-color: var(--primary);
      background: rgba(59,130,246,0.18);
      box-shadow: inset 3px 0 0 var(--primary);
    }
    body.${MODE_CLASS} .palette-thumb,
    body.${MODE_CLASS} .palette-swatch {
      display: none !important;
    }
    body.${MODE_CLASS} .palette-label {
      grid-column: 2;
      text-align: left;
      word-break: normal;
      overflow-wrap: anywhere;
      font-size: 0.72rem;
      font-weight: 800;
      line-height: 1.25;
    }
    body.${MODE_CLASS} .palette-count:not(.renewal-machine-code) {
      display: none !important;
    }
    body.${MODE_CLASS} .renewal-machine-code {
      grid-column: 1;
      grid-row: 1 / span 2;
      align-self: start;
      min-width: 2.6rem;
      margin: 0;
      padding: 0.16rem 0.28rem;
      text-align: center;
      color: #bfdbfe;
      border: 1px solid rgba(147,197,253,0.28);
      background: rgba(59,130,246,0.14);
      border-radius: 999px;
      font-size: 0.58rem;
      font-weight: 800;
    }
    body.${MODE_CLASS} .renewal-machine-meta {
      grid-column: 2;
      color: var(--muted);
      font-size: 0.62rem;
      line-height: 1.3;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .renewal-detail-card {
      border: 1px solid var(--border);
      background: var(--surface2);
      border-radius: 8px;
      padding: 0.7rem;
      margin-bottom: 0.65rem;
    }
    .renewal-detail-title {
      font-size: 0.9rem;
      font-weight: 900;
      line-height: 1.35;
      margin-bottom: 0.45rem;
      color: var(--text);
    }
    .renewal-detail-code {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.64rem;
      color: #bfdbfe;
      background: rgba(59,130,246,0.16);
      border: 1px solid rgba(147,197,253,0.32);
      border-radius: 999px;
      padding: 0.12rem 0.42rem;
      margin-bottom: 0.48rem;
    }
    .renewal-detail-grid {
      display: grid;
      grid-template-columns: 4.8rem 1fr;
      gap: 0.25rem 0.45rem;
      font-size: 0.7rem;
      line-height: 1.45;
    }
    .renewal-detail-grid dt { color: var(--muted); font-weight: 800; }
    .renewal-detail-grid dd { color: var(--text); word-break: break-word; }
    .renewal-detail-note {
      margin-top: 0.55rem;
      padding-top: 0.5rem;
      border-top: 1px dashed var(--border);
      color: var(--muted);
      font-size: 0.69rem;
      line-height: 1.5;
    }
    .renewal-mode-empty {
      color: var(--muted);
      font-size: 0.72rem;
      line-height: 1.55;
    }
  `;
  document.head.appendChild(style);
}

function installFabricCanvasHook() {
  if (!window.fabric?.Canvas || window.__renewalCanvasHookInstalled) return;
  window.__renewalCanvasHookInstalled = true;
  const OriginalCanvas = window.fabric.Canvas;

  function PatchedCanvas(...args) {
    const canvas = new OriginalCanvas(...args);
    capturedCanvas = canvas;
    window.__renewalCanvas = canvas;
    canvas.on("selection:created", () => setTimeout(renderSelectedMachineDetail, 0));
    canvas.on("selection:updated", () => setTimeout(renderSelectedMachineDetail, 0));
    canvas.on("selection:cleared", () => setTimeout(renderSelectedMachineDetail, 0));
    canvas.on("object:modified", () => setTimeout(renderSelectedMachineDetail, 0));
    return canvas;
  }

  PatchedCanvas.prototype = OriginalCanvas.prototype;
  Object.setPrototypeOf(PatchedCanvas, OriginalCanvas);
  window.fabric.Canvas = PatchedCanvas;
}

function ensureMachinePanel() {
  const inner = document.querySelector("#zone-sidebar .zone-sidebar-inner");
  if (!inner) return;

  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.className = "renewal-machine-panel";
    panel.innerHTML = `
      <div class="renewal-machine-title-row">
        <div class="renewal-machine-title">候補マシン</div>
      </div>
      <label class="renewal-machine-search">
        <input id="renewal-machine-search" type="search" placeholder="検索" />
      </label>
      <div id="palette"></div>
      <div id="machine-preview-panel" class="machine-preview-panel" hidden>
        <div class="machine-preview-frame">
          <img id="machine-preview-img" class="machine-preview-img" alt="" hidden />
          <div id="machine-preview-placeholder" class="machine-preview-placeholder"></div>
        </div>
        <label class="prop-field preview-toggle">
          <input type="checkbox" id="prop-use-image" checked />
        </label>
        <p id="machine-preview-hint" class="machine-preview-hint"></p>
      </div>
    `;
    const scroll = inner.querySelector(".zone-hooks-scroll");
    inner.insertBefore(panel, scroll || inner.firstChild);
  }

  const search = panel.querySelector("#renewal-machine-search");
  if (search && !search.dataset.renewalBound) {
    search.dataset.renewalBound = "1";
    search.addEventListener("input", () => {
      lastSearch = search.value.trim().toLowerCase();
      filterPaletteForRenewalMode();
    });
  }

  const palette = panel.querySelector("#palette");
  if (palette && !paletteObserver) {
    paletteObserver = new MutationObserver(scheduleDecorateAndFilter);
    paletteObserver.observe(palette, { childList: true, subtree: true });
  }
}

function queueModeRefresh() {
  const refresh = () => setTimeout(applyRenewalMode, 0);
  window.addEventListener("DOMContentLoaded", refresh);
  document.addEventListener("change", (event) => {
    if (event.target?.id === "drawing-select") refresh();
  });

  const selectObserver = new MutationObserver(refresh);
  const tryObserve = () => {
    const sel = document.getElementById("drawing-select");
    if (sel) selectObserver.observe(sel, { childList: true, subtree: true, attributes: true });
  };
  tryObserve();

  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    applyRenewalMode();
    if (ticks > 40) clearInterval(timer);
  }, 250);
}

function isRenewalSheetSelected() {
  return document.getElementById("drawing-select")?.value === RENEWAL_SHEET_ID;
}

function applyRenewalMode() {
  ensureMachinePanel();
  renameRenewalOption();
  const isRenewal = isRenewalSheetSelected();
  document.body.classList.toggle(MODE_CLASS, isRenewal);
  document.getElementById(PANEL_ID)?.toggleAttribute("hidden", !isRenewal);

  if (isRenewal) {
    const zoneBtn = document.querySelector('[data-tool="zone"]');
    if (zoneBtn?.classList.contains("active")) document.querySelector('[data-tool="select"]')?.click();
    forceHidePreviewPanel();
  }

  scheduleDecorateAndFilter();
  setTimeout(renderSelectedMachineDetail, 0);
}

function renameRenewalOption() {
  const sel = document.getElementById("drawing-select");
  const opt = sel?.querySelector(`option[value="${RENEWAL_SHEET_ID}"]`);
  if (opt && opt.textContent !== "リニューアル候補のみ") opt.textContent = "リニューアル候補のみ";
}

function forceHidePreviewPanel() {
  const panel = document.getElementById("machine-preview-panel");
  if (panel) panel.hidden = true;
}

function scheduleDecorateAndFilter() {
  if (decorateQueued) return;
  decorateQueued = true;
  requestAnimationFrame(() => {
    decorateQueued = false;
    try {
      decoratePaletteItems();
      filterPaletteForRenewalMode();
    } catch (err) {
      console.warn("renewal palette refresh failed", err);
    }
  });
}

function getDetailForPaletteButton(btn) {
  const label = btn.querySelector(".palette-label")?.textContent?.trim() || "";
  const id = btn.dataset.partId || "";
  return RENEWAL_MACHINE_DETAILS.find((d) => d.id === id) ||
    RENEWAL_MACHINE_DETAILS.find((d) => d.label === label || d.name === label) ||
    null;
}

function decoratePaletteItems() {
  document.querySelectorAll("#palette .palette-item").forEach((btn) => {
    const detail = getDetailForPaletteButton(btn);
    btn.classList.toggle("is-renewal-candidate", !!detail);
    if (!detail) return;

    btn.dataset.renewalSearch = buildSearchText(detail);
    btn.title = `${detail.searchCode} ${detail.brand} / ${detail.name}\n${detail.purpose}\n${detail.note || ""}`;

    const label = btn.querySelector(".palette-label");
    const title = detail.name || detail.label;
    if (label && label.textContent !== title) label.textContent = title;

    let code = btn.querySelector(".renewal-machine-code");
    if (!code) {
      code = document.createElement("span");
      code.className = "palette-count renewal-machine-code";
      btn.insertBefore(code, btn.firstChild);
    }
    const codeText = detail.searchCode || "候補";
    if (code.textContent !== codeText) code.textContent = codeText;

    let meta = btn.querySelector(".renewal-machine-meta");
    if (!meta) {
      meta = document.createElement("span");
      meta.className = "renewal-machine-meta";
      btn.appendChild(meta);
    }
    const metaText = [detail.brand, detail.purpose].filter(Boolean).join(" / ");
    if (meta.textContent !== metaText) meta.textContent = metaText;

    if (!btn.dataset.renewalClickBound) {
      btn.dataset.renewalClickBound = "1";
      btn.addEventListener("click", () => {
        lastClickedDetail = detail;
        setTimeout(renderSelectedMachineDetail, 40);
      });
    }
  });
}

function filterPaletteForRenewalMode() {
  const isRenewal = isRenewalSheetSelected();
  const q = lastSearch;
  document.querySelectorAll("#palette .palette-section").forEach((section) => {
    const title = section.querySelector("h4")?.textContent?.trim() || "";
    const isCandidateSection = title.startsWith("候補");
    let visibleCount = 0;

    section.querySelectorAll(".palette-item").forEach((btn) => {
      const detail = getDetailForPaletteButton(btn);
      const haystack = `${btn.textContent || ""} ${btn.dataset.renewalSearch || ""}`.toLowerCase();
      const visible = !isRenewal || (isCandidateSection && !!detail && (!q || haystack.includes(q)));
      btn.style.display = visible ? "" : "none";
      if (visible) visibleCount += 1;
    });

    section.style.display = !isRenewal || (isCandidateSection && visibleCount > 0) ? "" : "none";
  });
}

function renderSelectedMachineDetail() {
  if (!isRenewalSheetSelected()) return;

  const content = document.getElementById("props-content");
  const form = document.getElementById("props-form");
  if (!content) return;

  const canvas = capturedCanvas || window.__renewalCanvas;
  const active = canvas?.getActiveObject?.();
  const obj = active?.objectType === "part" ? active : active?.group?.objectType === "part" ? active.group : null;
  const detail = getRenewalDetailByPart(obj) || (!active ? lastClickedDetail : null);

  if (!detail) {
    if (form) form.hidden = true;
    content.innerHTML = `<p class="renewal-mode-empty">左の候補を選ぶと詳細が表示されます。図面上へドラッグして配置できます。</p>`;
    return;
  }

  if (form) form.hidden = !!(!obj || !getRenewalDetailByPart(obj));
  const subtotal = Number(detail.unitPrice || 0) * Number(detail.count || 0);
  content.innerHTML = `
    <div class="renewal-detail-card">
      <div class="renewal-detail-title">${esc(detail.name || detail.label)}</div>
      <div class="renewal-detail-code">${esc(detail.searchCode || "候補")}<span>${esc(detail.brand || "")}</span></div>
      <dl class="renewal-detail-grid">
        <dt>カテゴリ</dt><dd>${esc(detail.category || "—")}</dd>
        <dt>サブ</dt><dd>${esc(detail.subCategory || "—")}</dd>
        <dt>目的</dt><dd>${esc(detail.purpose || "—")}</dd>
        <dt>ブランド</dt><dd>${esc(detail.brand || "—")}</dd>
        <dt>名称</dt><dd>${esc(detail.name || detail.label || "—")}</dd>
        <dt>税抜単価</dt><dd>${esc(formatPrice(detail.unitPrice))}</dd>
        <dt>台数</dt><dd>${esc(String(detail.count ?? "—"))}</dd>
        <dt>税抜小計</dt><dd>${esc(formatPrice(subtotal))}</dd>
      </dl>
      <div class="renewal-detail-note">${esc(detail.note || "")}</div>
    </div>
  `;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c]));
}
