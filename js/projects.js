import { DRAWINGS, MASTER_PROJECT_ID, STORAGE_PREFIX } from "./constants.js";

const IMPORTED_KEY = STORAGE_PREFIX + "imported-proposals";
const CUSTOM_SHEETS_KEY = STORAGE_PREFIX + "custom-sheets";
let sharedManifest = null;

export async function loadSharedProposals() {
  if (sharedManifest) return sharedManifest;
  try {
    const res = await fetch("/proposals/manifest.json");
    sharedManifest = await res.json();
  } catch {
    sharedManifest = { proposals: [] };
  }
  return sharedManifest;
}

export function loadImportedProposals() {
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveImportedProposals(list) {
  localStorage.setItem(IMPORTED_KEY, JSON.stringify(list));
}

function mapDrawingToSheet(d) {
  return {
    id: d.id,
    name: d.name,
    file: d.file,
    kind: d.kind || "pdf",
    pages: d.pages,
    planWidthMm: d.planWidthMm,
    scaleHints: d.scaleHints,
    planAreaM2: d.planAreaM2,
    planAreaTsubo: d.planAreaTsubo,
    isCustom: !!d.isCustom,
    nameRoot: d.nameRoot,
    insertAfterId: d.insertAfterId,
  };
}

export function loadCustomSheetsMap() {
  try {
    const raw = localStorage.getItem(CUSTOM_SHEETS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCustomSheetsMap(map) {
  localStorage.setItem(CUSTOM_SHEETS_KEY, JSON.stringify(map));
}

export function getCustomSheetsForProject(projectId) {
  return loadCustomSheetsMap()[projectId] || [];
}

export function isCustomSheet(sheet) {
  return !!sheet?.isCustom;
}

function mergeSheetsWithCustom(baseSheets, customSheets) {
  if (!customSheets.length) return baseSheets;
  const result = baseSheets.map((s) => ({ ...s }));
  const pending = customSheets.map((s) => mapDrawingToSheet(s));
  while (pending.length) {
    let inserted = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const custom = pending[i];
      let insertIdx = -1;
      for (let j = result.length - 1; j >= 0; j--) {
        if (result[j].id === custom.insertAfterId) {
          insertIdx = j;
          break;
        }
      }
      if (insertIdx >= 0) {
        result.splice(insertIdx + 1, 0, custom);
        pending.splice(i, 1);
        inserted = true;
      }
    }
    if (!inserted) {
      result.push(...pending);
      break;
    }
  }
  return result;
}

function nextDuplicateName(nameRoot, existingNames) {
  const taken = new Set(existingNames);
  let n = 2;
  while (taken.has(`${nameRoot}-${n}`)) n++;
  return `${nameRoot}-${n}`;
}

/** 図面を複製してリストに追加（同一PDF・区画データ付き） */
export function duplicateProjectSheet(projectId, sourceSheetId) {
  const sheets = getProjectSheets(projectId);
  const source = sheets.find((s) => s.id === sourceSheetId);
  if (!source) return null;

  const nameRoot = source.nameRoot || source.name;
  const newName = nextDuplicateName(
    nameRoot,
    sheets.map((s) => s.name)
  );
  const newSheet = mapDrawingToSheet({
    id: "custom-" + crypto.randomUUID(),
    name: newName,
    file: source.file,
    kind: source.kind,
    pages: source.pages,
    planWidthMm: source.planWidthMm,
    scaleHints: source.scaleHints,
    planAreaM2: source.planAreaM2,
    planAreaTsubo: source.planAreaTsubo,
    isCustom: true,
    nameRoot,
    insertAfterId: sourceSheetId,
  });

  const map = loadCustomSheetsMap();
  if (!map[projectId]) map[projectId] = [];
  map[projectId].push(newSheet);
  saveCustomSheetsMap(map);
  return newSheet;
}

/** 複製図面を削除（組み込み図面は不可） */
export function deleteProjectSheet(projectId, sheetId) {
  const map = loadCustomSheetsMap();
  const list = map[projectId];
  if (!list?.some((s) => s.id === sheetId)) return false;
  map[projectId] = list.filter((s) => s.id !== sheetId);
  if (!map[projectId].length) delete map[projectId];
  saveCustomSheetsMap(map);
  return true;
}

export function getMasterProject() {
  return {
    id: MASTER_PROJECT_ID,
    name: "原本",
    type: "master",
    sheets: DRAWINGS.map(mapDrawingToSheet),
  };
}

export async function getAllProjects() {
  await loadSharedProposals();
  const imported = loadImportedProposals().map((p) => ({
    id: p.id,
    name: p.name,
    type: "imported",
    author: p.author || "",
    sheets: p.sheets,
  }));
  const shared = (sharedManifest.proposals || []).map((p) => ({
    id: p.id,
    name: p.name,
    type: "shared",
    author: p.author || "",
    sheets: p.sheets.map((s) => ({
      id: s.id,
      name: s.name,
      file: s.file,
      kind: s.kind || (s.file?.endsWith(".pdf") ? "pdf" : "image"),
      baseDrawing: s.baseDrawing,
    })),
  }));
  return [getMasterProject(), ...shared, ...imported];
}

export function findProject(projectId) {
  return getAllProjectsSync().find((p) => p.id === projectId);
}

let cachedProjects = null;

export async function refreshProjects() {
  cachedProjects = await getAllProjects();
  return cachedProjects;
}

function getAllProjectsSync() {
  return cachedProjects || [getMasterProject()];
}

export function setCachedProjects(projects) {
  cachedProjects = projects;
}

export function getCachedProjects() {
  return cachedProjects || [getMasterProject()];
}

export function getProjectSheets(projectId) {
  const p = getAllProjectsSync().find((x) => x.id === projectId);
  const base = (p?.sheets ?? DRAWINGS).map((s) => mapDrawingToSheet(s));
  return mergeSheetsWithCustom(base, getCustomSheetsForProject(projectId));
}

export function addImportedProposal({ name, author, sheets }) {
  const list = loadImportedProposals();
  const entry = {
    id: "import-" + crypto.randomUUID(),
    name,
    author: author || "",
    sheets,
    createdAt: new Date().toISOString(),
  };
  list.push(entry);
  saveImportedProposals(list);
  return entry;
}

export function deleteImportedProposal(id) {
  saveImportedProposals(loadImportedProposals().filter((p) => p.id !== id));
}
