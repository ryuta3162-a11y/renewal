import { STORAGE_PREFIX, DRAWING_ID_ALIASES } from "./constants.js";

const IDB_NAME = "renewal-studio";
const IDB_VERSION = 1;
const IDB_STORE = "designs";

export class StorageQuotaError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorageQuotaError";
    this.code = "QUOTA_EXCEEDED";
  }
}

let db = null;
/** @type {Map<string, object>} */
const designCache = new Map();
/** @type {Map<string, string>} */
const payloadCache = new Map();
let writeChain = Promise.resolve();
let initPromise = null;
let migratedFromLocalStorage = 0;

function isQuotaError(err) {
  return (
    err?.name === "QuotaExceededError" ||
    err?.code === 22 ||
    err?.code === "QUOTA_EXCEEDED"
  );
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDatabase() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(IDB_STORE)) {
        database.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll() {
  const tx = db.transaction(IDB_STORE, "readonly");
  return idbRequest(tx.objectStore(IDB_STORE).getAll());
}

async function idbPut(id, payload) {
  const tx = db.transaction(IDB_STORE, "readwrite");
  await idbRequest(tx.objectStore(IDB_STORE).put({ id, payload }));
}

async function idbDelete(id) {
  const tx = db.transaction(IDB_STORE, "readwrite");
  await idbRequest(tx.objectStore(IDB_STORE).delete(id));
}

function cacheDesign(id, json, payload) {
  designCache.set(id, json);
  payloadCache.set(id, payload);
}

function parsePayload(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function removeFromCache(id) {
  designCache.delete(id);
  payloadCache.delete(id);
}

function queueIdbPut(id, payload) {
  writeChain = writeChain.then(() => idbPut(id, payload)).catch((err) => {
    console.error("IndexedDB save failed:", id, err);
  });
}

function queueIdbDelete(id) {
  writeChain = writeChain.then(() => idbDelete(id)).catch((err) => {
    console.error("IndexedDB delete failed:", id, err);
  });
}

async function loadCacheFromIdb() {
  const rows = await idbGetAll();
  rows.forEach((row) => {
    if (!row?.id || typeof row.payload !== "string") return;
    const json = parsePayload(row.payload);
    if (!json) return;
    cacheDesign(row.id, json, row.payload);
  });
}

function collectLocalStorageDesignKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

async function migrateFromLocalStorage() {
  const keys = collectLocalStorageDesignKeys();
  if (!keys.length) return 0;

  let moved = 0;
  for (const fullKey of keys) {
    const id = fullKey.slice(STORAGE_PREFIX.length);
    const raw = localStorage.getItem(fullKey);
    if (!raw) continue;
    const json = parsePayload(raw);
    if (!json) {
      localStorage.removeItem(fullKey);
      continue;
    }
    try {
      if (!designCache.has(id)) {
        cacheDesign(id, json, raw);
        await idbPut(id, raw);
      }
      localStorage.removeItem(fullKey);
      moved++;
    } catch (err) {
      console.error("Migration kept in localStorage:", fullKey, err);
    }
  }
  return moved;
}

/** 起動時に1回だけ呼ぶ（IndexedDB 読み込み + localStorage からの自動移行） */
export function initStorage() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!globalThis.indexedDB) {
      console.warn("IndexedDB unavailable — falling back to in-memory only");
      return { migrated: 0, backend: "memory" };
    }
    await openDatabase();
    await loadCacheFromIdb();
    migratedFromLocalStorage = await migrateFromLocalStorage();
    return { migrated: migratedFromLocalStorage, backend: "indexeddb" };
  })().catch((err) => {
    initPromise = null;
    console.error("initStorage failed:", err);
    throw err;
  });
  return initPromise;
}

export function getStorageMigrationCount() {
  return migratedFromLocalStorage;
}

/** 未保存の書き込みをフラッシュ（タブ非表示時など） */
export function flushStorage() {
  return writeChain;
}

export function saveDesign(drawingId, json) {
  const payload = JSON.stringify(json);
  try {
    cacheDesign(drawingId, json, payload);
    if (db) queueIdbPut(drawingId, payload);
    return true;
  } catch (err) {
    if (isQuotaError(err)) {
      throw new StorageQuotaError(
        "ブラウザの保存容量が一杯です。古い図面データを削除するか、JSONでバックアップ後に整理してください。"
      );
    }
    throw err;
  }
}

/** 容量超過時に孤立データ削除を試みてから再保存 */
export function saveDesignWithRetry(drawingId, json, retryOpts = {}) {
  try {
    return saveDesign(drawingId, json);
  } catch (err) {
    if (
      err instanceof StorageQuotaError &&
      retryOpts.projectId &&
      retryOpts.validSheetIds?.length
    ) {
      const pruned = pruneOrphanDesigns(retryOpts.projectId, retryOpts.validSheetIds);
      if (pruned > 0) return saveDesign(drawingId, json);
    }
    throw err;
  }
}

export function loadDesign(drawingId) {
  const data = designCache.get(drawingId);
  if (!data) return null;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return null;
  }
}

export function listSavedDesigns() {
  return [...designCache.keys()];
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
  payloadCache.forEach((payload, id) => {
    total += id.length + payload.length;
  });
  return total * 2;
}

function removeDesign(id) {
  removeFromCache(id);
  if (db) queueIdbDelete(id);
}

/** 一覧に無い図面の保存データを削除（custom-* は削除しない） */
export function pruneOrphanDesigns(projectId, validSheetIds) {
  const valid = new Set(validSheetIds);
  let removed = 0;
  listSavedDesigns().forEach((key) => {
    const parsed = parseDesignPageKey(key, projectId);
    if (!parsed || valid.has(parsed.sheetId)) return;
    if (parsed.sheetId.startsWith("custom-")) return;
    removeDesign(key);
    removed++;
  });
  return removed;
}

/** IndexedDB / キャッシュ上の custom 図面 ID を列挙 */
export function listCustomSheetIdsFromDesigns(projectId) {
  const ids = new Set();
  listSavedDesigns().forEach((key) => {
    const parsed = parseDesignPageKey(key, projectId);
    if (!parsed?.sheetId?.startsWith("custom-")) return;
    if (!designHasContent(loadDesign(key))) return;
    ids.add(parsed.sheetId);
  });
  return [...ids];
}

/** 図面の全ページ保存データを削除 */
export function deleteSheetDesign(projectId, sheetId) {
  const prefix = `${projectId}-${sheetId}-p`;
  listSavedDesigns()
    .filter((k) => k.startsWith(prefix))
    .forEach((k) => removeDesign(k));
}

/** 旧 id の保存データを削除（新 id への読込時に干渉しないよう） */
export function clearLegacyAliasDesigns(projectId, sheetId) {
  const oldId = Object.entries(DRAWING_ID_ALIASES).find(([, v]) => v === sheetId)?.[0];
  if (oldId) deleteSheetDesign(projectId, oldId);
}

/** 複数ページを別シートへ書き込み（上書き） */
export function writeSheetPages(destProjectId, destSheetId, pages, retryOpts = {}) {
  const written = [];
  Object.entries(pages).forEach(([pageStr, pageData]) => {
    const page = parseInt(pageStr, 10);
    if (!Number.isFinite(page) || page < 1 || !pageData) return;
    if (!designHasContent(pageData)) return;
    saveDesignWithRetry(
      designPageKey(destProjectId, destSheetId, page),
      JSON.parse(JSON.stringify(pageData)),
      retryOpts
    );
    written.push(page);
  });
  return { copied: written.length, pages: [...new Set(written)].sort((a, b) => a - b) };
}

/** 図面の全ページデータを別シートへ複製 */
export function copySheetDesign(srcProjectId, srcSheetId, destProjectId, destSheetId, retryOpts = {}) {
  const prefix = `${srcProjectId}-${srcSheetId}-p`;
  const keys = listSavedDesigns().filter((k) => k.startsWith(prefix));
  if (!keys.length) return { copied: 0, pages: [] };

  const pages = {};
  keys.forEach((key) => {
    const page = parseInt(key.slice(prefix.length), 10);
    if (!Number.isFinite(page) || page < 1) return;
    const data = loadDesign(key);
    if (!data || !designHasContent(data)) return;
    pages[String(page)] = data;
  });
  if (!Object.keys(pages).length) return { copied: 0, pages: [] };
  return writeSheetPages(destProjectId, destSheetId, pages, retryOpts);
}
