import { DRAWINGS, MASTER_PROJECT_ID, STORAGE_PREFIX } from "./constants.js";

const IMPORTED_KEY = STORAGE_PREFIX + "imported-proposals";
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

export function getMasterProject() {
  return {
    id: MASTER_PROJECT_ID,
    name: "原本",
    type: "master",
    sheets: DRAWINGS.map((d) => ({
      id: d.id,
      name: d.name,
      file: d.file,
      kind: d.kind || "pdf",
      pages: d.pages,
      planWidthMm: d.planWidthMm,
    })),
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
  return p?.sheets ?? DRAWINGS;
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
