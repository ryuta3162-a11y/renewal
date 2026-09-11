const fs = require("fs");
const f = fs.readFileSync(__dirname + "/existing-machines-formula.txt", "utf8");
const b64 = Buffer.from(f, "utf8").toString("base64");
const expr = `(function(){const b64=${JSON.stringify(b64)}; const bin=atob(b64); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); const t=new TextDecoder('utf-8').decode(bytes); window.__sheetFormula=t; const el=document.activeElement; if(!el) return {err:'no el', len:t.length}; el.focus(); document.execCommand('selectAll'); const ok=document.execCommand('insertText', false, t); return {ok, len:t.length, tag:el.tagName, preview:(el.value||el.textContent||'').slice(0,60)};})()`;
fs.writeFileSync(__dirname + "/cdp-b64-insert.txt", expr, "utf8");
console.log("expr", expr.length, "b64", b64.length);
