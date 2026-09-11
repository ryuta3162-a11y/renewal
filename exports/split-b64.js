const fs = require("fs");
const f = fs.readFileSync(__dirname + "/existing-machines-formula.txt", "utf8");
const b64 = Buffer.from(f, "utf8").toString("base64");
const size = 800;
const chunks = [];
for (let i = 0; i < b64.length; i += size) chunks.push(b64.slice(i, i + size));
fs.writeFileSync(__dirname + "/b64-chunks.json", JSON.stringify(chunks), "utf8");
console.log("chunks", chunks.length);
for (let i = 0; i < chunks.length; i++) {
  console.log("CHUNK", i, chunks[i].length);
}
