const { app, BrowserWindow, ipcMain, shell, dialog, Menu, protocol, net } = require("electron");
const path = require("node:path");
const {pathToFileURL}=require("node:url");
protocol.registerSchemesAsPrivileged([{scheme:"excelsior",privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const fs = require("node:fs");
const http = require("node:http");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { resolveEndpoint, trustedURL, trustedSender, engineBinary, authenticateEngine } = require("./desktop-runtime.cjs");
const execFileAsync = promisify(execFile);
const endpoint = resolveEndpoint(process.env);
const IS_DEV = !app.isPackaged;
const projectRoot = path.resolve(__dirname, "../..");
let engineProc = null, win = null, rendererTarget = null, quitting = false, startup = null;

function getEngineBin() {
 const bin = engineBinary({packaged:app.isPackaged,resourcesPath:process.resourcesPath,projectRoot,platform:process.platform});
 return fs.existsSync(bin) ? bin : null;
}
async function getEngineToken(url) {
 if (url !== endpoint.url) return "";
 if (process.env.EXCELSIOR_ENGINE_TOKEN) return process.env.EXCELSIOR_ENGINE_TOKEN;
 if (!["localhost","127.0.0.1","[::1]"].includes(new URL(url).hostname)) return "";
 const bin = getEngineBin(); if (!bin) return "";
 const {stdout} = await execFileAsync(bin, ["engine","token"], {windowsHide:true,timeout:5000});
 return stdout.trim();
}
function reportStatus(status) {
 if (win && !win.isDestroyed()) win.webContents.send("engine-status",status);
}
async function startEngine() {
 const token = await getEngineToken(endpoint.url);
 try { await authenticateEngine(endpoint.url,token); reportStatus({running:true}); return; }
 catch (error) {
  if (endpoint.external || process.env.EXCELSIOR_AUTO_ENGINE === "0" || (IS_DEV && process.env.EXCELSIOR_AUTO_ENGINE !== "1")) {
   reportStatus({running:false,error:String(error)}); return;
  }
 }
 const bin=getEngineBin();if (!bin) throw new Error("The packaged engine binary is missing.");
 const workspace=process.env.EXCELSIOR_WORKSPACE || path.join(app.getPath("userData"),"workspace");
 fs.mkdirSync(workspace,{recursive:true});
 const child=spawn(bin,["engine","--addr",endpoint.addr,"--workspace",workspace,"--parent-pipe"],{
  cwd:workspace,env:process.env,stdio:["pipe","ignore","pipe"],windowsHide:true,
 });
 engineProc=child;
 let startupError=null;
 child.on("error",error=>{startupError=error;reportStatus({running:false,error:String(error)});});
 child.stderr.on("data",data=>console.error("[engine]",data.toString().trim()));
 child.on("exit",code=>{if(engineProc===child)engineProc=null;reportStatus({running:false,code});});
 const deadline=Date.now()+10000;
 while(Date.now()<deadline && !quitting){
  if(startupError)throw startupError;
  if(child.exitCode!==null)throw new Error("Engine exited before becoming ready ("+child.exitCode+")");
  try{await authenticateEngine(endpoint.url,token);reportStatus({running:true});return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 throw new Error("Engine did not complete its authenticated handshake.");
}
async function stopOwnedEngine() {
 const child=engineProc;if(!child)return;
 await new Promise(resolve=>{
  let finished=false;
  const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);resolve();};
  const timer=setTimeout(()=>{child.kill();finish();},6500);
  child.once("exit",finish);
  // Closing the parent pipe requests bounded Go shutdown on Windows and Unix.
  child.stdin.end();
  if(child.exitCode!==null)finish();
 });
 if(engineProc===child)engineProc=null;
}
function devUp(url,ms=600) {
 return new Promise(resolve=>{const req=http.get(url,res=>{res.resume();resolve(res.statusCode<500);});req.on("error",()=>resolve(false));req.setTimeout(ms,()=>{req.destroy();resolve(false);});});
}
async function frontendTarget() {
 if(IS_DEV && process.env.ELECTRON_START_URL)return{kind:"url",value:process.env.ELECTRON_START_URL};
 if(IS_DEV && await devUp("http://localhost:3000"))return{kind:"url",value:"http://localhost:3000"};
 const file=path.join(__dirname,"dist","index.html");
 if(fs.existsSync(file))return{kind:"app",value:"excelsior://desktop/index.html"};
 throw new Error("Desktop assets are missing. Build the frontend before packaging.");
}
function openExternal(url) {try{if(["http:","https:"].includes(new URL(url).protocol))void shell.openExternal(url);}catch{}}
async function createWindow() {
 rendererTarget=await frontendTarget();
 win=new BrowserWindow({
  width:1200,height:800,minWidth:900,minHeight:600,backgroundColor:"#0d0d0d",title:"Excelsior",frame:false,
  titleBarStyle:"hidden",webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true},
  autoHideMenuBar:true,show:false,
 });
 win.once("ready-to-show",()=>{if(!process.argv.includes("--smoke-test"))win.show();});
 win.webContents.setWindowOpenHandler(({url})=>{openExternal(url);return{action:"deny"};});
 win.webContents.on("will-navigate",(event,url)=>{if(!trustedURL(url,rendererTarget)){event.preventDefault();openExternal(url);}});
 win.webContents.on("will-redirect",(event,url)=>{if(!trustedURL(url,rendererTarget))event.preventDefault();});
 win.webContents.on("will-attach-webview",event=>event.preventDefault());
 win.webContents.on("before-input-event",(event,input)=>{
  if(input.key==="F12"||(input.control&&input.shift&&input.key.toLowerCase()==="i")){win.webContents.toggleDevTools();event.preventDefault();}
 });
 Menu.setApplicationMenu(null);
 await win.loadURL(rendererTarget.value);
}
function requireSender(event){if(!trustedSender(event,win,rendererTarget))throw new Error("Untrusted native IPC caller");}
ipcMain.handle("get-engine-url",event=>{requireSender(event);return endpoint.url;});
ipcMain.handle("get-engine-token",async(event,url)=>{requireSender(event);return getEngineToken(url);});
ipcMain.handle("open-folder-dialog",async event=>{
 requireSender(event);const result=await dialog.showOpenDialog(win,{properties:["openDirectory"],title:"Open Project Folder"});
 return result.canceled?null:result.filePaths[0]??null;
});
ipcMain.on("window-control",(event,action)=>{
 if(!trustedSender(event,win,rendererTarget))return;
 if(action==="minimize")win.minimize();else if(action==="maximize")win.isMaximized()?win.unmaximize():win.maximize();else if(action==="close")win.close();
});
ipcMain.on("toggle-devtools",event=>{if(trustedSender(event,win,rendererTarget))win.webContents.toggleDevTools();});
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on("second-instance",()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(async()=>{
  protocol.handle("excelsior",request=>{
   const url=new URL(request.url),root=path.join(__dirname,"dist");
   if(url.host!=="desktop")return new Response("Not found",{status:404});
   const file=path.resolve(root,"."+decodeURIComponent(url.pathname));
   const relative=path.relative(root,file);
   if(relative.startsWith("..")||path.isAbsolute(relative))return new Response("Not found",{status:404});
   return net.fetch(pathToFileURL(file).href);
  });
  await createWindow();
  startup=startEngine().catch(error=>{reportStatus({running:false,error:String(error)});dialog.showErrorBox("Engine startup failed",String(error));});
  app.on("activate",()=>{if(!BrowserWindow.getAllWindows().length)void createWindow();});
 }).catch(error=>{dialog.showErrorBox("Desktop startup failed",String(error));app.quit();});
}
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
app.on("before-quit",event=>{
 if(quitting)return;
 if(engineProc || startup){
  event.preventDefault();quitting=true;
  void Promise.resolve(startup).then(stopOwnedEngine).finally(()=>app.quit());
 }
});
