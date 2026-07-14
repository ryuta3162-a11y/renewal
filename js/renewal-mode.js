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

installStyles();
installFabricCanvasHook();
ensureMachinePanel();
queueModeRefresh();

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
    body.${MODE_CLASS} [data-tool="drawing"] { display: none !important; }

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
      scrollbar-gutter: stable;
    }
    .renewal-machine-panel #palette::-webkit-scrollbar { width: 7px; }
    .renewal-machine-panel #palette::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

    body.${MODE_CLASS} .palette-section h4 {
      color: #bfdbfe;
      font-size: 0.68rem;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.25rem;
      margin: 0.75rem 0 0.35rem;
    }
    body.${MODE_CLASS} .palette-section:first-child h4 { margin-top: 0; }
    body.${MODE_CLASS} .palette-grid { grid-template-columns: 1fr; gap: 0.32rem; }
    body.${MODE_CLASS} .palette-item {
      align-items: stretch;
      text-align: left;
      padding: 0.44rem 0.5rem;
      min-height: 0;
      border-width: 1px;
      border-radius: 6px;
      gap: 0.18rem;
    }
    body.${MODE_CLASS} .palette-item:hover { border-color: var(--primary); }
    body.${MODE_CLASS} .palette-item.selected,
    body.${MODE_CLASS} .palette-item.renewal-selected {
      border-color: var(--primary);
      background: rgba(59,130,246,0.14);
      box-shadow: inset 3px 0 0 var(--primary);
    }
    body.${MODE_CLASS} .palette-item .palette-thumb,
    body.${MODE_CLASS} .palette-item .palette-swatch,
    body.${MODE_CLASS} .palette-item .palette-count:not(.renewal-machine-code) {
      display: none !important;
    }
    body.${MODE_CLASS} .palette-label {
      text-align: left;
      word-break: normal;
      font-size: 0.76rem;
      font-weight: 800;
      line-height: 1.25;
      color: var(--text);
    }
    .renewal-machine-code {
      align-self: flex-start;
      display: inline-flex;
      width: fit-content;
      margin: 0 0 0.05rem 0;
      color: #bfdbfe !important;
      background: rgba(59,130,246,0.16) !important;
      border: 1px solid rgba(147,197,253,0.28);
      border-radius: 999px;
      font-size: 0.58rem !important;
      font-weight: 700;
      padding: 0.08rem 0.35rem !important;
    }
    .renewal-card-meta {
      font-size: 0.64rem;
      color: var(--muted);
      line-height: 1.35;
    }
    .renewal-card-purpose {
      font-size: 0.62rem;
      color: #93c5fd;
      line-height: 1.35;
    }
    .renewal-search-empty {
      color: var(--muted);
      font-size: 0.72rem;
      line-height: 1.5;
      padding: 0.6rem 0.2rem;
    }

    .renewal-detail-card {
      border: 1px solid var(--border);
      background: var(--surface2);
      border-radius: 8px;
      padding: 0.65rem;
      margin-bottom: 0.65rem;
    }
    .renewal-detail-title {
      font-size: 0.88rem;
      font-weight: 800;
      line-height: 1.35;
      margin-bottom: 0.45rem;
      color: var(--text);
    }
    .renewal-detail-code {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.64rem;
      color: #bfdbfe;
      background: rgba(59,130,246,0.16);
      border: 1px solid rgba(147,197,253,0.32);
      border-radius: 999px;
      padding: 0.12rem 0.4rem;
      margin-bottom: 0.45rem;
    }
    .renewal-detail-grid {
      display: grid;
      grid-template-columns: 4.9rem 1fr;
      gap: 0.25rem 0.45rem;
      font-size: 0.7rem;
      line-height: 1.45;
    }
    .renewal-detail-grid dt { color: var(--muted); font-weight: 700; }
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
      line-height: 1.6;
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
    paletteObserver = new MutationObserver(() => {
      decoratePaletteItems();
      filterPaletteForRenewalMode();
    });
    paletteObserver.observe(palette, { childList: true, subtree: true });
  }
}

function queueModeRefresh() {
  const refresh = () => setTimeout(applyRenewalMode, 0);
  window.addEventListener("DOMContentLoaded", refresh);
  document.addEventListener("change", (event) => {
    if (event.target?.id === "drawing-select") refresh();
  });
  document.addEventListener("click", (event) => {
    const paletteBtn = event.target?.closest?.("#palette .palette-item");
    if (paletteBtn && isRenewalSheetSelected()) {
      const detail = getDetailForPaletteButton(paletteBtn);
      if (detail) {
        lastClickedDetail = detail;
        document.querySelectorAll("#palette .palette-item").forEach((btn) => btn.classList.remove("renewal-selected"));
        paletteBtn.classList.add("renewal-selected");
        setTimeout(() => renderMachineDetail(detail), 0);
      }
      setTimeout(forceHidePreviewPanel, 0);
      return;
    }
    if (event.target?.closest?.("#drawing-select")) refresh();
  });

  const selectObserver = new MutationObserver(refresh);
  const tryObserve = () => {
    const sel = document.getElementById("drawing-select");
    if (sel) selectObserver.observe(sel, { childList: true, subtree: true, attributes: true });
  };
  tryObserve();
  setInterval(applyRenewalMode, 1200);
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

  decoratePaletteItems();
  filterPaletteForRenewalMode();
  setTimeout(renderSelectedMachineDetail, 0);
}

function renameRenewalOption() {
  const sel = document.getElementById("drawing-select");
  const opt = sel?.querySelector(`option[value="${RENEWAL_SHEET_ID}"]`);
  if (opt) opt.textContent = "リニューアル候補のみ";
}

function forceHidePreviewPanel() {
  const panel = document.getElementById("machine-preview-panel");
  if (panel) panel.hidden = true;
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
    btn.title = `${detail.searchCode} ${detail.brand} / ${detail.name}\n${detail.purpose}\n${detail.note || ""}`;

    const label = btn.querySelector(".palette-label");
    if (label) label.textContent = detail.name || detail.label;

    if (!btn.querySelector(".renewal-machine-code")) {
      const code = document.createElement("span");
      code.className = "palette-count renewal-machine-code";
      btn.insertBefore(code, btn.firstChild);
    }
    btn.querySelector(".renewal-machine-code").textContent = detail.searchCode || "候補";

    if (!btn.querySelector(".renewal-card-meta")) {
      const meta = document.createElement("span");
      meta.className = "renewal-card-meta";
      btn.appendChild(meta);
    }
    btn.querySelector(".renewal-card-meta").textContent = `${detail.brand || ""} / ${detail.category || ""}`;

    if (!btn.querySelector(".renewal-card-purpose")) {
      const purpose = document.createElement("span");
      purpose.className = "renewal-card-purpose";
      btn.appendChild(purpose);
    }
    btn.querySelector(".renewal-card-purpose").textContent = detail.purpose || "";
  });
}

function filterPaletteForRenewalMode() {
  const isRenewal = isRenewalSheetSelected();
  let totalVisible = 0;

  document.querySelectorAll("#palette .palette-section").forEach((section) => {
    const title = section.querySelector("h4")?.textContent?.trim() || "";
    const isCandidateSection = title.startsWith("候補");
    let visibleCount = 0;

    section.querySelectorAll(".palette-item").forEach((btn) => {
      const detail = getDetailForPaletteButton(btn);
      const haystack = `${btn.textContent || ""} ${buildSearchText(detail)}`.toLowerCase();
      const visible = !isRenewal || (isCandidateSection && !!detail && (!lastSearch || haystack.includes(lastSearch)));
      btn.style.display = visible ? "" : "none";
      if (visible) {
        visibleCount++;
        totalVisible++;
      }
    });

    section.style.display = !isRenewal || (isCandidateSection && visibleCount > 0) ? "" : "none";
  });

  renderSearchEmpty(totalVisible);
}

function renderSearchEmpty(totalVisible) {
  const palette = document.getElementById("palette");
  if (!palette) return;
  let empty = palette.querySelector(".renewal-search-empty");
  if (!isRenewalSheetSelected() || totalVisible > 0) {
    empty?.remove();
    return;
  }
  if (!empty) {
    empty = document.createElement("p");
    empty.className = "renewal-search-empty";
    palette.appendChild(empty);
  }
  empty.textContent = "該当なし";
}

function renderSelectedMachineDetail() {
  if (!isRenewalSheetSelected()) return;
  forceHidePreviewPanel();
  const canvas = capturedCanvas || window.__renewalCanvas;
  const active = canvas?.getActiveObject?.();
  const obj = active?.objectType === "part" ? active : active?.group?.objectType === "part" ? active.group : null;
  const detail = getRenewalDetailByPart(obj) || (!active ? lastClickedDetail : null);

  if (!detail) {
    renderEmptyDetail();
    return;
  }
  renderMachineDetail(detail);
}

function renderEmptyDetail() {
  const content = document.getElementById("props-content");
  if (!content) return;
  content.innerHTML = `<p class="renewal-mode-empty">候補を選択すると詳細を表示します。</p>`;
}

function renderMachineDetail(detail) {
  const content = document.getElementById("props-content");
  if (!content || !detail) return;
  const subtotal = Number(detail.unitPrice || 0) * Number(detail.count || 0);
  content.innerHTML = `
    <div class="renewal-detail-card">
      <div class="renewal-detail-title">${esc(detail.name || detail.label)}</div>
      <div class="renewal-detail-code">${esc(detail.searchCode || "候補")}<span>${esc(detail.brand || "")}</span></div>
      <dl class="renewal-detail-grid">
        <dt>カテゴリ</dt><dd>${esc(detail.category || "—")}</dd>
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
  return String(value ?? "").replace(/[&<>\"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[c]));
}
