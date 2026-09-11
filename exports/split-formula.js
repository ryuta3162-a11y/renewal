const fs = require("fs");
const f = fs.readFileSync(__dirname + "/existing-machines-formula.txt", "utf8");
const chunks = [];
const size = 400;
for (let i = 0; i < f.length; i += size) chunks.push(f.slice(i, i + size));
fs.writeFileSync(
  __dirname + "/formula-chunks.json",
  JSON.stringify(chunks),
  "utf8"
);
console.log("chunks", chunks.length, "total", f.length);
