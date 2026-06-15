import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

export async function pdfToDataUrl(url, pageNum = 1, scale = 2) {
  let doc;
  try {
    doc = await pdfjsLib.getDocument(url).promise;
  } catch (err) {
    throw new Error(`PDFを開けませんでした (${url}): ${err?.message || err}`);
  }
  const safePage = Math.min(Math.max(1, pageNum), doc.numPages);
  const page = await doc.getPage(safePage);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    numPages: doc.numPages,
  };
}
