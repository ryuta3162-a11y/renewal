import { STORAGE_PREFIX } from "./constants.js";

export function saveDesign(drawingId, json) {
  localStorage.setItem(STORAGE_PREFIX + drawingId, JSON.stringify(json));
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

/** 図面の全ページデータを別シートへ複製（localStorage） */
export function copySheetDesign(srcProjectId, srcSheetId, destProjectId, destSheetId) {
  const prefix = `${srcProjectId}-${srcSheetId}-p`;
  const keys = listSavedDesigns().filter((k) => k.startsWith(prefix));
  if (!keys.length) return { copied: 0, pages: [] };

  const pages = [];
  keys.forEach((key) => {
    const page = parseInt(key.slice(prefix.length), 10);
    if (!Number.isFinite(page) || page < 1) return;
    const data = loadDesign(key);
    if (!data) return;
    saveDesign(designPageKey(destProjectId, destSheetId, page), JSON.parse(JSON.stringify(data)));
    pages.push(page);
  });
  return { copied: pages.length, pages: [...new Set(pages)].sort((a, b) => a - b) };
}
