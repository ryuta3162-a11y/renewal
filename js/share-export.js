import { drawingFileKey } from "./constants.js";
import {
  saveDesign,
  loadDesign,
  designPageKey,
  listSavedPagesForSheet,
  designHasContent,
  writeSheetPages,
  deleteSheetDesign,
  clearLegacyAliasDesigns,
} from "./storage.js";
import { loadCustomZonePresets, saveCustomZonePresets } from "./zone-custom-presets.js";
import { registerCustomSheetIfMissing } from "./projects.js";

export const SHARE_FORMAT = "renewal-studio-share";
export const SHARE_VERSION = 1;
export const SHARE_SCOPE_SHEET = "sheet";
export const SHARE_SCOPE_PROJECT = "project";

/** 図面1件分のページデータを収集（localStorage から） */
export function collectSheetPages(projectId, sheetId) {
  const pages = {};
  const nums = listSavedPagesForSheet(projectId, sheetId);
  const pageList = nums.length ? nums : [1];
  pageList.forEach((page) => {
    const data = loadDesign(designPageKey(projectId, sheetId, page));
    if (data && designHasContent(data)) {
      pages[String(page)] = JSON.parse(JSON.stringify(data));
    }
  });
  return pages;
}

export function serializeSheetForShare(sheet) {
  if (!sheet) return null;
  return {
    id: sheet.id,
    name: sheet.name,
    file: sheet.file,
    kind: sheet.kind || "pdf",
    pages: sheet.pages,
    planWidthMm: sheet.planWidthMm,
    planAreaM2: sheet.planAreaM2,
    planAreaTsubo: sheet.planAreaTsubo,
    isCustom: !!sheet.isCustom,
    nameRoot: sheet.nameRoot,
    insertAfterId: sheet.insertAfterId,
  };
}

/** 案内の全図面で保存データがあるものを収集 */
export function collectProjectSheetEntries(projectId, sheets) {
  const entries = [];
  (sheets || []).forEach((sheet) => {
    const pages = collectSheetPages(projectId, sheet.id);
    if (!Object.keys(pages).length) return;
    entries.push({
      sheet: serializeSheetForShare(sheet),
      pages,
    });
  });
  return entries;
}

export function isProjectShareBundle(data) {
  return (
    data?.scope === SHARE_SCOPE_PROJECT ||
    (Array.isArray(data?.sheets) && data.sheets.length > 0)
  );
}

export function normalizeProjectSheetEntries(sheets) {
  if (Array.isArray(sheets)) {
    return sheets
      .map((entry) => ({
        sheet: entry?.sheet || null,
        pages: entry?.pages && typeof entry.pages === "object" ? entry.pages : {},
      }))
      .filter((e) => e.sheet?.id);
  }
  return [];
}

export function buildShareBundle({
  projectId,
  projectName,
  sheet,
  pages,
  author = "",
  note = "",
}) {
  const customZonePresets = loadCustomZonePresets();
  return {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    scope: SHARE_SCOPE_SHEET,
    exportedAt: new Date().toISOString(),
    author: author.trim(),
    note: note.trim(),
    projectId,
    projectName,
    sheet: {
      id: sheet.id,
      name: sheet.name,
      file: sheet.file,
      kind: sheet.kind || "pdf",
      planWidthMm: sheet.planWidthMm,
      planAreaM2: sheet.planAreaM2,
      planAreaTsubo: sheet.planAreaTsubo,
    },
    pages,
    extras: {
      customZonePresets: customZonePresets.length
        ? JSON.parse(JSON.stringify(customZonePresets))
        : [],
    },
  };
}

export function buildProjectShareBundle({
  projectId,
  projectName,
  sheets,
  sheetEntries,
  author = "",
  note = "",
}) {
  const customZonePresets = loadCustomZonePresets();
  return {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    scope: SHARE_SCOPE_PROJECT,
    exportedAt: new Date().toISOString(),
    author: author.trim(),
    note: note.trim(),
    projectId,
    projectName,
    sheets: sheetEntries,
    sheetCatalog: (sheets || []).map((s) => serializeSheetForShare(s)).filter(Boolean),
    extras: {
      customZonePresets: customZonePresets.length
        ? JSON.parse(JSON.stringify(customZonePresets))
        : [],
    },
  };
}

export function validateShareBundle(data) {
  if (!data || typeof data !== "object") return "JSONの形式が正しくありません";
  if (data.format !== SHARE_FORMAT) return "Renewal Studio の書き出しファイルではありません";
  if (isProjectShareBundle(data)) {
    const entries = normalizeProjectSheetEntries(data.sheets);
    if (!entries.length) return "図面データがありません";
    const hasPage = entries.some((e) =>
      Object.values(e.pages || {}).some((p) => designHasContent(p))
    );
    if (!hasPage) return "区画などのデータが空です";
    return null;
  }
  if (!data.sheet?.id) return "図面情報がありません";
  if (!data.pages || typeof data.pages !== "object") return "ページデータがありません";
  const hasPage = Object.values(data.pages).some((p) => designHasContent(p));
  if (!hasPage) return "区画などのデータが空です";
  return null;
}

/** バンドル内の区画数（pages 内 objects を集計） */
export function countZonesInBundle(bundle) {
  if (isProjectShareBundle(bundle)) {
    return normalizeProjectSheetEntries(bundle.sheets).reduce(
      (sum, entry) => sum + countZonesInSheetPages(entry.pages),
      0
    );
  }
  return countZonesInSheetPages(bundle?.pages);
}

function countZonesInSheetPages(pages) {
  let n = 0;
  Object.values(pages || {}).forEach((page) => {
    (page?.objects || []).forEach((o) => {
      if (o?.objectType === "zone" || o?.objectType === "fillArea") n++;
    });
  });
  return n;
}

export function summarizeProjectBundle(bundle) {
  const entries = normalizeProjectSheetEntries(bundle?.sheets);
  const withZones = entries.filter((e) => countZonesInSheetPages(e.pages) > 0);
  return {
    sheetCount: entries.length,
    sheetsWithData: withZones.length,
    zoneCount: countZonesInBundle(bundle),
    names: entries.map((e) => e.sheet.name || e.sheet.id),
  };
}

function normalizePageCopy(pageData, sheetMeta) {
  const copy = JSON.parse(JSON.stringify(pageData));
  if (copy._sheetMeta && sheetMeta) {
    copy._sheetMeta = {
      ...copy._sheetMeta,
      name: copy._sheetMeta.name || sheetMeta.name,
      file: copy._sheetMeta.file || sheetMeta.file,
    };
  }
  return copy;
}

function mergeCustomZonePresetsFromBundle(bundle) {
  const incoming = bundle.extras?.customZonePresets;
  if (!incoming?.length) return false;
  const existing = loadCustomZonePresets();
  const names = new Set(existing.map((p) => p.name));
  const merged = [...existing];
  incoming.forEach((p) => {
    if (!p?.name || names.has(p.name)) return;
    merged.push({
      ...p,
      id: p.id?.startsWith("custom-") ? p.id : "custom-" + crypto.randomUUID(),
      isCustom: true,
    });
    names.add(p.name);
  });
  if (merged.length > existing.length) {
    saveCustomZonePresets(merged);
    return true;
  }
  return false;
}

/** 受け取ったバンドルをストレージへ書き込み（既存キーは上書き） */
export function applyShareBundle(bundle, targetProjectId, targetSheetId, retryOpts = {}) {
  const pages = {};
  Object.entries(bundle.pages).forEach(([pageStr, pageData]) => {
    const page = parseInt(pageStr, 10);
    if (!Number.isFinite(page) || page < 1 || !pageData) return;
    pages[pageStr] = normalizePageCopy(pageData, bundle.sheet);
  });

  if (retryOpts.validSheetIds?.length) {
    writeSheetPages(targetProjectId, targetSheetId, pages, retryOpts);
  } else {
    Object.entries(pages).forEach(([pageStr, copy]) => {
      const page = parseInt(pageStr, 10);
      saveDesign(designPageKey(targetProjectId, targetSheetId, page), copy);
    });
  }

  mergeCustomZonePresetsFromBundle(bundle);

  return { projectId: targetProjectId, sheetId: targetSheetId };
}

/** 全図面バンドルを一括インポート */
export function applyProjectShareBundle(bundle, targetProjectId, sheets, retryOpts = {}) {
  const entries = normalizeProjectSheetEntries(bundle.sheets);
  const applied = [];
  const skipped = [];

  entries.forEach((entry) => {
    const sheetMeta = entry.sheet;
    registerCustomSheetIfMissing(targetProjectId, sheetMeta);

    const miniBundle = {
      sheet: sheetMeta,
      pages: entry.pages,
      extras: bundle.extras,
    };
    const targetSheetId = resolveImportSheetId(miniBundle, sheets, null);
    if (!targetSheetId) {
      skipped.push(sheetMeta.name || sheetMeta.id);
      return;
    }

    deleteSheetDesign(targetProjectId, targetSheetId);
    clearLegacyAliasDesigns(targetProjectId, targetSheetId);
    applyShareBundle(miniBundle, targetProjectId, targetSheetId, retryOpts);
    applied.push({
      sheetId: targetSheetId,
      name: sheetMeta.name || sheetMeta.id,
      zones: countZonesInSheetPages(entry.pages),
    });
  });

  mergeCustomZonePresetsFromBundle(bundle);

  return { applied, skipped };
}

/** インポート先の図面 id を決める */
export function resolveImportSheetId(bundle, sheets, fallbackSheetId) {
  if (sheets.some((s) => s.id === bundle.sheet.id)) return bundle.sheet.id;
  const byFile = bundle.sheet.file
    ? sheets.find((s) => drawingFileKey(s.file) === drawingFileKey(bundle.sheet.file))
    : null;
  if (byFile) return byFile.id;
  if (sheets.some((s) => s.id === fallbackSheetId)) return fallbackSheetId;
  return sheets[0]?.id || bundle.sheet.id;
}

export function shareBundleFilename(bundle) {
  if (isProjectShareBundle(bundle)) {
    const proj = (bundle.projectName || bundle.projectId || "project")
      .replace(/[<>:"/\\|?*]/g, "_")
      .slice(0, 24);
    const d = (bundle.exportedAt || "").slice(0, 10);
    return `renewal-${proj}-全図面-${d || "export"}.json`;
  }
  const name = (bundle.sheet?.name || bundle.sheet?.id || "drawing")
    .replace(/[<>:"/\\|?*]/g, "_")
    .slice(0, 40);
  const d = (bundle.exportedAt || "").slice(0, 10);
  return `renewal-${name}-${d || "export"}.json`;
}

export function downloadShareBundle(bundle) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = shareBundleFilename(bundle);
  a.click();
  URL.revokeObjectURL(a.href);
}

export function readShareBundleFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch {
        reject(new Error("JSONの解析に失敗しました"));
      }
    };
    reader.onerror = () => reject(new Error("ファイルを読めませんでした"));
    reader.readAsText(file, "UTF-8");
  });
}

/** 旧形式: 生のページデータだけの JSON も読めるようにする */
export function normalizeImportedJson(data) {
  const err = validateShareBundle(data);
  if (!err) return data;
  if (data?.objects && Array.isArray(data.objects)) {
    return {
      format: SHARE_FORMAT,
      version: SHARE_VERSION,
      exportedAt: new Date().toISOString(),
      projectId: "master",
      projectName: "原本",
      sheet: { id: "imported", name: "imported", file: "", kind: "pdf" },
      pages: { "1": data },
      extras: { customZonePresets: [] },
    };
  }
  throw new Error(err);
}
