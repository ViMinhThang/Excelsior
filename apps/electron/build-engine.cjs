const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");

// electron-builder calls this for each concrete target architecture.
module.exports=async function buildEngine(context){
 const goos={win32:"windows",linux:"linux",darwin:"darwin"}[context.electronPlatformName];
 const goarch={1:"amd64",3:"arm64"}[context.arch];
 if(!goos||!goarch)throw new Error("Engine packaging supports x64 and arm64 on Windows, Linux and macOS");
 const root=path.resolve(__dirname,"../..");
 const output=path.join(__dirname,"build","engine");
 fs.mkdirSync(output,{recursive:true});
 execFileSync("go",["build","-trimpath","-ldflags=-s -w","-o",path.join(output,goos==="windows"?"excelsior.exe":"excelsior"),"./cmd/excelsior"],{
  cwd:root,env:{...process.env,GOOS:goos,GOARCH:goarch,CGO_ENABLED:"0"},stdio:"inherit",windowsHide:true,
 });
};

