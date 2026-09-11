const fs = require("fs");
const f = fs.readFileSync(__dirname + "/existing-machines-formula.txt", "utf8");
const expr =
  "(function(){const t=" +
  JSON.stringify(f) +
  '; const el=document.activeElement; if(!el) return {err:"no el"}; el.focus(); document.execCommand("selectAll"); const ok=document.execCommand("insertText", false, t); return {ok, tag:el.tagName, name:el.getAttribute && el.getAttribute("aria-label"), len:t.length, preview:(el.value||el.textContent||"").slice(0,80)};})()';
fs.writeFileSync(__dirname + "/cdp-expr.txt", expr, "utf8");
console.log("expr len", expr.length);
