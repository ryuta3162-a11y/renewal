import { drawingFileKey } from "./constants.js";
import {
  saveDesign,
  loadDesign,
  designPageKey,
  listSavedPagesForSheet,
  designHasContent,
  writeSheetPages,
} from "./storage.js";
import { loadCustomZonePresets, saveCustomZonePresets } from "./zone-custom-presets.js";

export const SHARE_FORMAT = "renewal-studio-share";
export const SHARE_VERSION = 1;

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

export function validateShareBundle(data) {
  if (!data || typeof data !== "object") return "JSONの形式が正しくありません";
  if (data.format !== SHARE_FORMAT) return "Renewal Studio の書き出しファイルではありません";
  if (!data.sheet?.id) return "図面情報がありません";
  if (!data.pages || typeof data.pages !== "object") return "ページデータがありません";
  const hasPage = Object.values(data.pages).some((p) => designHasContent(p));
  if (!hasPage) return "区画などのデータが空です";
  return null;
}

/** バンドル内の区画数（pages 内 objects を集計） */
export function countZonesInBundle(bundle) {
  let n = 0;
  Object.values(bundle?.pages || {}).forEach((page) => {
    (page?.objects || []).forEach((o) => {
      if (o?.objectType === "zone" || o?.objectType === "fillArea") n++;
    });
  });
  return n;
}

function normalizePageCopy(pageData, bundle) {
  const copy = JSON.parse(JSON.stringify(pageData));
  if (copy._sheetMeta) {
    copy._sheetMeta = {
      ...copy._sheetMeta,
      name: copy._sheetMeta.name || bundle.sheet?.name,
      file: copy._sheetMeta.file || bundle.sheet?.file,
    };
  }
  return copy;
}

/** 受け取ったバンドルをストレージへ書き込み（既存キーは上書き） */
export function applyShareBundle(bundle, targetProjectId, targetSheetId, retryOpts = {}) {
  const pages = {};
  Object.entries(bundle.pages).forEach(([pageStr, pageData]) => {
    const page = parseInt(pageStr, 10);
    if (!Number.isFinite(page) || page < 1 || !pageData) return;
    pages[pageStr] = normalizePageCopy(pageData, bundle);
  });

  if (retryOpts.validSheetIds?.length) {
    writeSheetPages(targetProjectId, targetSheetId, pages, retryOpts);
  } else {
    Object.entries(pages).forEach(([pageStr, copy]) => {
      const page = parseInt(pageStr, 10);
      saveDesign(designPageKey(targetProjectId, targetSheetId, page), copy);
    });
  }

  const incoming = bundle.extras?.customZonePresets;
  if (incoming?.length) {
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
    if (merged.length > existing.length) saveCustomZonePresets(merged);
  }

  return { projectId: targetProjectId, sheetId: targetSheetId };
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
