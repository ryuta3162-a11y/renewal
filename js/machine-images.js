let manifest = null;
const imageCache = new Map();

export async function loadMachineManifest() {
  if (manifest) return manifest;
  try {
    const res = await fetch("/machines/manifest.json");
    manifest = await res.json();
  } catch {
    manifest = { machines: {}, lpBaseUrl: "" };
  }
  return manifest;
}

function findEntry(label) {
  if (!manifest?.machines || !label) return null;
  if (manifest.machines[label]) return manifest.machines[label];
  for (const [key, entry] of Object.entries(manifest.machines)) {
    if (entry.aliases?.includes(label)) return entry;
    if (label.includes(key) || key.includes(label)) return entry;
  }
  return null;
}

export function resolveImageUrl(label, customUrl) {
  if (customUrl) return customUrl;
  const entry = findEntry(label);
  if (!entry) return null;
  if (entry.file) return `/machines/${entry.file}`;
  if (manifest.lpBaseUrl && entry.lpFile) {
    return `${manifest.lpBaseUrl.replace(/\/$/, "")}/${entry.lpFile}`;
  }
  return null;
}

export function attachImageToPart(part) {
  const url = resolveImageUrl(part.label, part.imageUrl);
  return url ? { ...part, imageUrl: url } : part;
}

export function checkImageExists(url) {
  if (!url) return Promise.resolve(false);
  if (imageCache.has(url)) return Promise.resolve(imageCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, true);
      resolve(true);
    };
    img.onerror = () => {
      imageCache.set(url, false);
      resolve(false);
    };
    img.src = url;
  });
}

export async function enrichPartWithImage(part) {
  const url = resolveImageUrl(part.label, part.imageUrl);
  if (!url) return { ...part, hasImage: false };
  const exists = await checkImageExists(url);
  return exists ? { ...part, imageUrl: url, hasImage: true } : { ...part, hasImage: false };
}

export function getManifestHint(label) {
  const entry = findEntry(label);
  if (!entry?.file) return null;
  return `machines/${entry.file}`;
}
