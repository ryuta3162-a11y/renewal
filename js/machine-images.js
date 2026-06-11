let manifest = null;
const imageCache = new Map();
const EXTENSIONS = ["webp", "png", "jpg", "jpeg"];

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

function fileBase(entry) {
  if (!entry?.file) return null;
  return entry.file.replace(/\.[^.]+$/, "");
}

export function getManifestHint(label) {
  const entry = findEntry(label);
  if (!entry?.file) return null;
  const base = fileBase(entry);
  return `machines/${base}.webp（.png .jpg も可）`;
}

export function resolveImageUrl(label, customUrl) {
  if (customUrl) return customUrl;
  const entry = findEntry(label);
  if (!entry?.file) return null;
  return `/machines/${entry.file}`;
}

export async function resolveImageUrlAsync(label, customUrl) {
  if (customUrl) {
    const ok = await checkImageExists(customUrl);
    return ok ? customUrl : null;
  }
  const entry = findEntry(label);
  if (!entry) return null;

  const base = fileBase(entry);
  if (base) {
    for (const ext of EXTENSIONS) {
      const url = `/machines/${base}.${ext}`;
      if (await checkImageExists(url)) return url;
    }
  }

  if (manifest.lpBaseUrl && entry.lpFile) {
    const url = `${manifest.lpBaseUrl.replace(/\/$/, "")}/${entry.lpFile}`;
    if (await checkImageExists(url)) return url;
  }

  return null;
}

export function attachImageToPart(part) {
  const entry = findEntry(part.label);
  if (!entry?.file) return part;
  return {
    ...part,
    imageUrl: `/machines/${entry.file}`,
    imageHasLabel: !!entry.imageHasLabel,
  };
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
  const entry = findEntry(part.label);
  const url = await resolveImageUrlAsync(part.label, part.imageUrl);
  if (!url) {
    return { ...part, hasImage: false, imageUrl: resolveImageUrl(part.label) };
  }
  return {
    ...part,
    imageUrl: url,
    hasImage: true,
    imageHasLabel: !!entry?.imageHasLabel,
  };
}
