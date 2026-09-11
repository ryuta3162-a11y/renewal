const fs = require("fs");
let t = fs
  .readFileSync(__dirname + "/existing-machines-v2.tsv", "utf8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n");
const b64 = Buffer.from(t, "utf8").toString("base64");
const size = 900;
const chunks = [];
for (let i = 0; i < b64.length; i += size) chunks.push(b64.slice(i, i + size));
const expr =
  "window.__tsvB64=" +
  chunks.map((x) => JSON.stringify(x)).join("+") +
  "; window.__tsvB64.length";
fs.writeFileSync(__dirname + "/cdp-set-tsv-b64-v2.txt", expr, "utf8");
console.log("chunks", chunks.length, "b64", b64.length, "expr", expr.length);
