import { STORAGE_PREFIX } from "./constants.js";

export class StorageQuotaError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorageQuotaError";
    this.code = "QUOTA_EXCEEDED";
  }
}

function isQuotaError(err) {
  return (
    err?.name === "QuotaExceededError" ||
    err?.code === 22 ||
    err?.code === "QUOTA_EXCEEDED"
  );
}

export function saveDesign(drawingId, json) {
  const key = STORAGE_PREFIX + drawingId;
  const payload = JSON.stringify(json);
  try {
    localStorage.setItem(key, payload);
    return true;
  } catch (err) {
    if (isQuotaError(err)) {
      throw new StorageQuotaError(
        "ブラウザの保存容量が一杯です。不要な「複製」図面を削除するか、使っていない図面の区画を整理してください。"
      );
    }
    throw err;
  }
}

export function loadDesign(drawingId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + drawingId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function listSavedDesigns() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      keys.push(key.slice(STORAGE_PREFIX.length));
    }
  }
  return keys;
}

export function designPageKey(projectId, sheetId, page = 1) {
  return `${projectId}-${sheetId}-p${page}`;
}

/** projectId と sheetId からストレージキーを分解 */
export function parseDesignPageKey(key, projectId) {
  const prefix = `${projectId}-`;
  if (!key.startsWith(prefix) || !key.includes("-p")) return null;
  const rest = key.slice(prefix.length);
  const pIdx = rest.lastIndexOf("-p");
  if (pIdx < 1) return null;
  const sheetId = rest.slice(0, pIdx);
  const page = parseInt(rest.slice(pIdx + 2), 10);
  if (!sheetId || !Number.isFinite(page) || page < 1) return null;
  return { sheetId, page };
}

export function listSavedPagesForSheet(projectId, sheetId) {
  const prefix = `${projectId}-${sheetId}-p`;
  const pages = listSavedDesigns()
    .filter((k) => k.startsWith(prefix))
    .map((k) => parseInt(k.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n) && n >= 1);
  return [...new Set(pages)].sort((a, b) => a - b);
}

export function designHasContent(data) {
  if (!data) return false;
  return !!(
    data.objects?.length ||
    data.scaleCalibrated ||
    data.mmPerImagePx ||
    data.workBoundaryCanvasPoints?.length ||
    data.drawingTransform
  );
}

export function sheetHasSavedDesign(projectId, sheetId) {
  const prefix = `${projectId}-${sheetId}-p`;
  return listSavedDesigns().some((k) => {
    if (!k.startsWith(prefix)) return false;
    return designHasContent(loadDesign(k));
  });
}

export function estimateStorageBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const val = localStorage.getItem(key);
    total += (key?.length || 0) + (val?.length || 0);
  }
  return total * 2;
}

/** 一覧に無い図面の保存データを削除 */
export function pruneOrphanDesigns(projectId, validSheetIds) {
  const valid = new Set(validSheetIds);
  let removed = 0;
  listSavedDesigns().forEach((key) => {
    const parsed = parseDesignPageKey(key, projectId);
    if (!parsed || valid.has(parsed.sheetId)) return;
    localStorage.removeItem(STORAGE_PREFIX + key);
    removed++;
  });
  return removed;
}

/** 図面の全ページ保存データを削除 */
export function deleteSheetDesign(projectId, sheetId) {
  const prefix = `${projectId}-${sheetId}-p`;
  listSavedDesigns()
    .filter((k) => k.startsWith(prefix))
    .forEach((k) => localStorage.removeItem(STORAGE_PREFIX + k));
}

/** 図面の全ページデータを別シートへ複製（localStorage） */
export function copySheetDesign(srcProjectId, srcSheetId, destProjectId, destSheetId) {
  const prefix = `${srcProjectId}-${srcSheetId}-p`;
  const keys = listSavedDesigns().filter((k) => k.startsWith(prefix));
  if (!keys.length) return { copied: 0, pages: [] };

  const pages = [];
  try {
    keys.forEach((key) => {
      const page = parseInt(key.slice(prefix.length), 10);
      if (!Number.isFinite(page) || page < 1) return;
      const data = loadDesign(key);
      if (!data) return;
      saveDesign(designPageKey(destProjectId, destSheetId, page), JSON.parse(JSON.stringify(data)));
      pages.push(page);
    });
  } catch (err) {
    if (err instanceof StorageQuotaError) throw err;
    throw err;
  }
  return { copied: pages.length, pages: [...new Set(pages)].sort((a, b) => a - b) };
}
