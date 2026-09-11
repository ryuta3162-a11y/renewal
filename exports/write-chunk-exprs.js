const fs = require("fs");
const chunks = JSON.parse(
  fs.readFileSync(__dirname + "/formula-chunks.json", "utf8")
);
// sanity: first chunk should start with ={" and contain single backslash separators
console.log("chunk0 start:", JSON.stringify(chunks[0].slice(0, 40)));
console.log("has backslash-quote:", chunks[0].includes('"\\"'));
for (let i = 0; i < chunks.length; i++) {
  const expr =
    "window.__sheetFormula=(window.__sheetFormula||'')+" +
    JSON.stringify(chunks[i]) +
    "; window.__sheetFormula.length";
  fs.writeFileSync(__dirname + `/cdp-chunk-${i}.txt`, expr, "utf8");
}
fs.writeFileSync(
  __dirname + "/cdp-commit.txt",
  `(function(){const t=window.__sheetFormula; const el=document.activeElement; if(!el) return {err:'no el'}; el.focus(); document.execCommand('selectAll'); const ok=document.execCommand('insertText', false, t); return {ok, len:t.length, tag:el.tagName, preview:(el.value||el.textContent||'').slice(0,60)};})()`,
  "utf8"
);
console.log("wrote", chunks.length, "chunk exprs");
