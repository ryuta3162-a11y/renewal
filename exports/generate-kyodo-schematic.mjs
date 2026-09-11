/**
 * JOYFIT24経堂 — インドアビュー由来の概略図面（厳密寸法ではない）
 * Node標準ライブラリのみで PNG を出力する。
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "drawings");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

class Canvas {
  constructor(w, h, bg = [245, 246, 248, 255]) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 4] = bg[0];
      this.px[i * 4 + 1] = bg[1];
      this.px[i * 4 + 2] = bg[2];
      this.px[i * 4 + 3] = bg[3];
    }
  }
  set(x, y, rgba) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const a = rgba[3] / 255;
    this.px[i] = Math.round(rgba[0] * a + this.px[i] * (1 - a));
    this.px[i + 1] = Math.round(rgba[1] * a + this.px[i + 1] * (1 - a));
    this.px[i + 2] = Math.round(rgba[2] * a + this.px[i + 2] * (1 - a));
    this.px[i + 3] = 255;
  }
  fillRect(x, y, w, h, rgba) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.set(xx, yy, rgba);
  }
  strokeRect(x, y, w, h, rgba, t = 3) {
    this.fillRect(x, y, w, t, rgba);
    this.fillRect(x, y + h - t, w, t, rgba);
    this.fillRect(x, y, t, h, rgba);
    this.fillRect(x + w - t, y, t, h, rgba);
  }
  // 5x7 風ドットフォント（ASCII + よく使うカナは別途簡易）
  drawText(text, x, y, rgba, scale = 2) {
    const glyphs = GLYPHS;
    let cx = Math.floor(x);
    const cy = Math.floor(y);
    for (const ch of text) {
      const g = glyphs[ch] || glyphs["?"];
      for (let row = 0; row < 7; row++) {
        const bits = g[row];
        for (let col = 0; col < 5; col++) {
          if (bits & (1 << (4 - col))) {
            this.fillRect(cx + col * scale, cy + row * scale, scale, scale, rgba);
          }
        }
      }
      cx += 6 * scale;
    }
  }
  roundedZone(x, y, w, h, fill, stroke, title, sub) {
    this.fillRect(x, y, w, h, fill);
    this.strokeRect(x, y, w, h, stroke, 4);
    this.drawText(title, x + 18, y + 18, [30, 30, 35, 255], 3);
    if (sub) this.drawText(sub, x + 18, y + 48, [80, 80, 90, 255], 2);
  }
  machine(x, y, w, h, label, fill, stroke) {
    this.fillRect(x, y, w, h, fill);
    this.strokeRect(x, y, w, h, stroke, 2);
    const tw = label.length * 12;
    this.drawText(label, x + Math.max(6, (w - tw) / 2), y + h / 2 - 7, [40, 40, 45, 255], 2);
  }
  save(file) {
    fs.writeFileSync(file, encodePng(this.w, this.h, this.px));
    console.log("wrote", file);
  }
}

/** 5x7 bitmap font — ASCII + 日本語ラベル用の短いローマ字/記号 */
const GLYPHS = {};
function def(ch, rows) {
  GLYPHS[ch] = rows;
}
// digits / letters
const ALPHA = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "/": [1, 2, 4, 8, 16, 0, 0],
  ".": [0, 0, 0, 0, 0, 0, 4],
  ",": [0, 0, 0, 0, 4, 4, 8],
  "(": [4, 8, 16, 16, 16, 8, 4],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "x": [0, 17, 10, 4, 10, 17, 0],
  "X": [17, 17, 10, 4, 10, 17, 17],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [14, 17, 1, 6, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
};
for (const [k, v] of Object.entries(ALPHA)) def(k, v);
const letters = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 19, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [1, 1, 1, 1, 17, 17, 14],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [14, 17, 16, 14, 1, 17, 14],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
};
for (const [k, v] of Object.entries(letters)) {
  def(k, v);
  def(k.toLowerCase(), v);
}

function make2F() {
  const W = 3200;
  const H = 2000;
  const c = new Canvas(W, H);
  const m = 80;
  const fx = m;
  const fy = m + 70;
  const fw = W - m * 2;
  const fh = H - m * 2 - 90;

  c.drawText("JOYFIT24 KYODO - 2F CURRENT LAYOUT (ROUGH)", 80, 20, [25, 25, 30, 255], 3);
  c.drawText("Not to exact scale. Based on Indoor View + machine list. Top=windows / Bottom=entrance", 80, 52, [100, 100, 110, 255], 2);
  c.strokeRect(fx, fy, fw, fh, [40, 40, 45, 255], 8);

  // Cardio top
  c.roundedZone(fx + 40, fy + 30, fw - 80, 320, [200, 220, 245, 255], [60, 110, 180, 255], "CARDIO", "Technogym Run x13 / Synchro x4 / Bike+Recline");
  let cx = fx + 70;
  for (let i = 0; i < 13; i++) {
    c.machine(cx, fy + 120, 70, 180, "TM", [230, 236, 245, 255], [70, 100, 150, 255]);
    cx += 82;
  }
  cx += 20;
  for (let i = 0; i < 4; i++) {
    c.machine(cx, fy + 120, 70, 180, "XT", [220, 235, 230, 255], [50, 130, 110, 255]);
    cx += 82;
  }
  cx += 20;
  c.machine(cx, fy + 120, 70, 180, "BK", [235, 230, 245, 255], [110, 80, 160, 255]);
  cx += 90;
  c.machine(cx, fy + 120, 70, 180, "RC", [235, 230, 245, 255], [110, 80, 160, 255]);
  cx += 82;
  c.machine(cx, fy + 120, 70, 180, "RC", [235, 230, 245, 255], [110, 80, 160, 255]);

  // Lockers left
  c.roundedZone(fx + 40, fy + 380, 420, 980, [235, 235, 238, 255], [110, 110, 120, 255], "LOCKERS", "Wall bank + desk");
  let ly = fy + 470;
  for (let r = 0; r < 8; r++) {
    c.machine(fx + 80, ly, 340, 90, "L" + (r + 1), [250, 250, 252, 255], [140, 140, 150, 255]);
    ly += 100;
  }
  c.machine(fx + 80, fy + 1280, 340, 60, "DESK", [255, 255, 255, 255], [90, 90, 100, 255]);

  // Aisle
  c.fillRect(fx + 480, fy + 380, 220, 980, [220, 222, 228, 255]);
  c.drawText("AISLE", fx + 540, fy + 820, [100, 100, 110, 255], 3);

  // Red pillar
  c.fillRect(fx + 720, fy + 700, 70, 70, [200, 40, 45, 255]);
  c.drawText("RED", fx + 730, fy + 780, [40, 40, 45, 255], 2);

  // Resistance
  c.roundedZone(fx + 720, fy + 380, 1100, 520, [255, 230, 230, 255], [180, 55, 55, 255], "CYBEX SELECTORIZED", "Eagle NX / VR1 / Prestige");
  const names = [
    ["LEG PRESS", 0, 0],
    ["SHOULDER", 1, 0],
    ["PECC FLY", 2, 0],
    ["LAT PULL", 3, 0],
    ["GLUTE", 0, 1],
    ["LEG EXT", 1, 1],
    ["LEG CURL", 2, 1],
    ["HIP A/A", 3, 1],
    ["TORSO", 0, 2],
    ["CHEST", 1, 2],
    ["ROW", 2, 2],
    ["ABS", 3, 2],
  ];
  for (const [label, col, row] of names) {
    c.machine(fx + 760 + col * 250, fy + 470 + row * 130, 230, 110, label, [255, 245, 245, 255], [160, 50, 50, 255]);
  }
  c.machine(fx + 760, fy + 860, 230, 110, "SITUP", [255, 245, 245, 255], [160, 50, 50, 255]);
  c.machine(fx + 1010, fy + 860, 230, 110, "BACK EXT", [255, 245, 245, 255], [160, 50, 50, 255]);

  // Freeweight
  c.roundedZone(fx + 1860, fy + 380, 1140, 980, [235, 245, 230, 255], [70, 130, 70, 255], "FREE WEIGHT", "Rack / Smith / Cable / DB");
  const fwItems = [
    ["RACK x2", 0, 0, 520, 160],
    ["SMITH x3", 540, 0, 520, 160],
    ["BENCH PRESS", 0, 180, 250, 140],
    ["INCLINE", 270, 180, 250, 140],
    ["CHIN/DIP", 540, 180, 250, 140],
    ["PREACHER", 810, 180, 250, 140],
    ["BRAVO", 0, 340, 340, 140],
    ["DAP", 360, 340, 340, 140],
    ["JUNGLE", 720, 340, 340, 140],
    ["45 LEG PRESS", 0, 500, 520, 160],
    ["DB RACK", 540, 500, 250, 160],
    ["BENCH x5", 810, 500, 250, 160],
  ];
  for (const [label, dx, dy, ww, hh] of fwItems) {
    c.machine(fx + 1900 + dx, fy + 470 + dy, ww, hh, label, [245, 252, 240, 255], [60, 110, 60, 255]);
  }

  c.roundedZone(fx + 720, fy + 940, 1100, 420, [250, 245, 230, 255], [160, 130, 60, 255], "STRETCH / OPEN", "Confirm on site");

  c.drawText("^ WINDOWS (street)", fx + fw / 2 - 120, fy + 8, [100, 100, 110, 255], 2);
  c.drawText("v ENTRANCE / STAIRS", fx + fw / 2 - 130, fy + fh - 36, [100, 100, 110, 255], 2);

  const scale = Math.floor((fw * 10) / 29);
  c.fillRect(fx + 40, H - 42, scale, 4, [0, 0, 0, 255]);
  c.drawText("approx 10m scale bar", fx + 40, H - 70, [25, 25, 30, 255], 2);

  return c;
}

function make3F() {
  const W = 3200;
  const H = 2000;
  const c = new Canvas(W, H);
  const m = 80;
  const fx = m;
  const fy = m + 70;
  const fw = W - m * 2;
  const fh = H - m * 2 - 90;

  c.drawText("JOYFIT24 KYODO - 3F CURRENT LAYOUT (ROUGH)", 80, 20, [25, 25, 30, 255], 3);
  c.drawText("Not to exact scale. Corridor ends at Mens/Womens lockers. Other zones estimated.", 80, 52, [100, 100, 110, 255], 2);
  c.strokeRect(fx, fy, fw, fh, [40, 40, 45, 255], 8);

  c.roundedZone(fx + 80, fy + 40, 1450, 340, [220, 230, 245, 255], [60, 90, 150, 255], "MENS LOCKER", "Confirmed in Indoor View");
  c.roundedZone(fx + 1600, fy + 40, 1400, 340, [245, 225, 230, 255], [160, 60, 90, 255], "WOMENS LOCKER", "Confirmed in Indoor View");

  c.fillRect(fx + 1200, fy + 400, 640, 1100, [225, 227, 232, 255]);
  c.drawText("CORRIDOR", fx + 1380, fy + 900, [100, 100, 110, 255], 3);

  c.roundedZone(fx + 80, fy + 420, 1080, 500, [240, 240, 245, 255], [120, 120, 130, 255], "WALL / INFO", "Mural + INFORMATION");
  c.roundedZone(fx + 1880, fy + 420, 1120, 500, [255, 240, 220, 255], [180, 110, 40, 255], "STUDIO (est.)", "From floor-guide poster");
  c.roundedZone(fx + 80, fy + 960, 1080, 560, [230, 245, 235, 255], [50, 120, 70, 255], "TRAINING (est.)", "Hours may be limited");
  c.roundedZone(fx + 1880, fy + 960, 1120, 560, [250, 245, 230, 255], [160, 130, 60, 255], "OPEN / STRETCH", "Confirm on site");

  c.drawText("^ LOCKER END", fx + fw / 2 - 80, fy + 8, [100, 100, 110, 255], 2);
  c.drawText("v STAIRS / 2F LINK", fx + fw / 2 - 100, fy + fh - 36, [100, 100, 110, 255], 2);

  const scale = Math.floor((fw * 10) / 29);
  c.fillRect(fx + 40, H - 42, scale, 4, [0, 0, 0, 255]);
  c.drawText("approx 10m scale bar", fx + 40, H - 70, [25, 25, 30, 255], 2);

  return c;
}

fs.mkdirSync(outDir, { recursive: true });
make2F().save(path.join(outDir, "経堂現状概略　2F.png"));
make3F().save(path.join(outDir, "経堂現状概略　3F.png"));
