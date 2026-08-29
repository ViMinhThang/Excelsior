// Copy apps/web/dist -> apps/electron/renderer (single source of truth)
const fs = require('fs'), path = require('path');
const SRC = path.resolve(__dirname, '../../web/dist'), DEST = path.resolve(__dirname, '../renderer');
if (!fs.existsSync(SRC)) { console.error('[copy-web-dist] missing '+SRC+' — run `npm --prefix ../web run build`'); process.exit(1); }
if (fs.existsSync(DEST)) fs.rmSync(DEST,{recursive:true,force:true});
fs.mkdirSync(DEST,{recursive:true});
(function cp(s,d){ const st=fs.statSync(s); if(st.isDirectory()){ fs.mkdirSync(d,{recursive:true}); for(const e of fs.readdirSync(s)) cp(path.join(s,e),path.join(d,e)); } else fs.copyFileSync(s,d); })(SRC,DEST);
console.log('[copy-web-dist] '+SRC+' -> '+DEST);
