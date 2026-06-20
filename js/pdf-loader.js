import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

const PAGE_GAP = 12;

async function openPdfDocument(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return await pdfjsLib.getDocument({ data: buf }).promise;
  } catch (err) {
    throw new Error(`PDFを開けませんでした (${url}): ${err?.message || err}`);
  }
}

async function renderPdfPage(doc, pageNum, scale) {
  const safePage = Math.min(Math.max(1, pageNum), doc.numPages);
  const page = await doc.getPage(safePage);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return {
    canvas,
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function pdfToDataUrl(url, pageNum = 1, scale = 2) {
  const doc = await openPdfDocument(url);
  const rendered = await renderPdfPage(doc, pageNum, scale);
  return {
    dataUrl: rendered.dataUrl,
    width: rendered.width,
    height: rendered.height,
    numPages: doc.numPages,
  };
}

/** 複数ページPDFを縦に連結して1枚の画像にする */
export async function pdfToStackedDataUrl(url, scale = 2, gap = PAGE_GAP) {
  const doc = await openPdfDocument(url);
  const numPages = doc.numPages;

  if (numPages <= 1) {
    const rendered = await renderPdfPage(doc, 1, scale);
    return {
      dataUrl: rendered.dataUrl,
      width: rendered.width,
      height: rendered.height,
      numPages: 1,
    };
  }

  const pages = [];
  let maxW = 0;
  let totalH = 0;
  for (let i = 1; i <= numPages; i++) {
    const rendered = await renderPdfPage(doc, i, scale);
    pages.push(rendered);
    maxW = Math.max(maxW, rendered.width);
    totalH += rendered.height;
    if (i < numPages) totalH += gap;
  }

  const out = document.createElement("canvas");
  out.width = maxW;
  out.height = Math.max(1, totalH);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);

  let y = 0;
  pages.forEach((p, idx) => {
    const x = Math.floor((maxW - p.width) / 2);
    ctx.drawImage(p.canvas, x, y);
    y += p.height;
    if (idx < pages.length - 1) y += gap;
  });

  return {
    dataUrl: out.toDataURL("image/png"),
    width: out.width,
    height: out.height,
    numPages,
  };
}
