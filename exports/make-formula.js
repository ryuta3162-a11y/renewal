const fs = require("fs");
let t = fs
  .readFileSync(__dirname + "/existing-machines.tsv", "utf8")
  .replace(/^\uFEFF/, "");
const rows = t
  .trimEnd()
  .split(/\r?\n/)
  .map((line) => {
    const cols = line.split("\t");
    while (cols.length < 9) cols.push("");
    return cols.slice(0, 9);
  });
const esc = (s) => String(s).replace(/"/g, '""');
// Japanese Sheets: ; = row sep, \ = col sep in array literals
const body = rows
  .map((r) => r.map((c) => '"' + esc(c) + '"').join("\\"))
  .join(";");
const formula = "={" + body + "}";
fs.writeFileSync(__dirname + "/existing-machines-formula.txt", formula, "utf8");
console.log("len", formula.length);
console.log(formula.slice(0, 150));
