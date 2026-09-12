const path = require("node:path");
const { fileURLToPath } = require("node:url");

function resolveEndpoint(env) {
 if (env.EXCELSIOR_ENGINE) {
  const url = new URL(env.EXCELSIOR_ENGINE);
  if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password) throw new Error("Engine URL must use ws:// or wss:// without embedded credentials");
  return { url: url.href, addr: null, external: true };
 }
 const addr = env.EXCELSIOR_ENGINE_ADDR || "127.0.0.1:17812";
 const parsed = new URL("http://" + (addr.startsWith(":") ? "127.0.0.1" + addr : addr));
 const host = ["0.0.0.0", "[::]"].includes(parsed.hostname) ? "127.0.0.1" : parsed.hostname;
 return { addr, url: "ws://" + host + ":" + (parsed.port || "80") + "/v1/ws", external: false };
}
function trustedURL(url, target) {
 if (!target) return false;
 try {
  const candidate = new URL(url);
  if (target.kind === "app") return candidate.protocol === "excelsior:" && candidate.host === "desktop" && candidate.pathname === "/index.html" && !candidate.username && !candidate.password;
  if (target.kind === "file") {
   if (candidate.protocol !== "file:") return false;
   const normalize = p => process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p);
   return normalize(fileURLToPath(candidate)) === normalize(target.value);
  }
  return candidate.origin === new URL(target.value).origin && ["http:", "https:"].includes(candidate.protocol);
 } catch { return false; }
}
function trustedSender(event, win, target) {
 return !!win && !win.isDestroyed() && event.sender === win.webContents &&
  event.senderFrame === win.webContents.mainFrame && trustedURL(event.senderFrame.url, target);
}
function engineBinary({ packaged, resourcesPath, projectRoot, platform }) {
 return packaged ? path.join(resourcesPath, "engine", platform === "win32" ? "excelsior.exe" : "excelsior")
  : path.join(projectRoot, platform === "win32" ? "excelsior.exe" : "excelsior");
}
function authenticateEngine(url, token, createSocket = u => new WebSocket(u), timeoutMs = 1500) {
 return new Promise((resolve, reject) => {
  const socket = createSocket(url);
  const timer = setTimeout(() => finish(new Error("Engine handshake timed out")), timeoutMs);
  let finished = false;
  const finish = error => {
   if (finished) return; finished = true; clearTimeout(timer); socket.close();
   error ? reject(error) : resolve();
  };
  socket.onopen = () => socket.send(JSON.stringify({ver:"v1",type:"auth",payload:{token}}));
  socket.onmessage = event => {
   try {
    const msg = JSON.parse(event.data);
    if (msg.ver !== "v1" || msg.type !== "auth" || msg.payload?.ok !== true ||
     !msg.payload.capabilities?.includes("run-lifecycle-v1")) throw new Error("Engine is incompatible");
    finish();
   } catch(error) { finish(error); }
  };
  socket.onerror = () => finish(new Error("Engine connection failed"));
  socket.onclose = () => { if (!finished) finish(new Error("Engine authentication failed")); };
 });
}
module.exports = { resolveEndpoint, trustedURL, trustedSender, engineBinary, authenticateEngine };

