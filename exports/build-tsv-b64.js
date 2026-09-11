const fs = require("fs");
let t = fs
  .readFileSync(__dirname + "/existing-machines.tsv", "utf8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n");
const b64 = Buffer.from(t, "utf8").toString("base64");
fs.writeFileSync(__dirname + "/tsv-b64.txt", b64, "utf8");
console.log(b64.length);
