const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const {resolveEndpoint,trustedURL,trustedSender,engineBinary,authenticateEngine}=require("../desktop-runtime.cjs");
test("listener and client resolve to the same endpoint",()=>{
 assert.deepEqual(resolveEndpoint({EXCELSIOR_ENGINE_ADDR:"127.0.0.1:19001"}),{addr:"127.0.0.1:19001",url:"ws://127.0.0.1:19001/v1/ws",external:false});
 assert.equal(resolveEndpoint({EXCELSIOR_ENGINE:"wss://remote.example/v1/ws"}).external,true);
 assert.throws(()=>resolveEndpoint({EXCELSIOR_ENGINE:"file:///tmp/socket"}));
});
test("native trust checks reject lookalike origins, other files and child frames",()=>{
 const target={kind:"url",value:"http://localhost:3000"};
 assert.equal(trustedURL("http://localhost:3000/settings",target),true);
 for(const url of ["http://localhost:30001","http://localhost:3000.evil.test","file:///tmp/evil.html","https://localhost:3000"])assert.equal(trustedURL(url,target),false);
 const file=path.resolve("dist/index.html"),local={kind:"file",value:file};
 assert.equal(trustedURL(pathToFileURL(file).href,local),true);
 assert.equal(trustedURL(pathToFileURL(path.resolve("dist/other.html")).href,local),false);
 const frame={url:target.value},webContents={mainFrame:frame},win={webContents,isDestroyed:()=>false};
 assert.equal(trustedSender({sender:webContents,senderFrame:frame},win,target),true);
 assert.equal(trustedSender({sender:webContents,senderFrame:{url:target.value}},win,target),false);
 assert.equal(trustedSender({sender:{},senderFrame:frame},win,target),false);
});
test("installed engine lookup uses packaged resources for each platform",()=>{
 for(const platform of ["win32","linux","darwin"]){
  const bin=engineBinary({packaged:true,platform,resourcesPath:"resources",projectRoot:"checkout"});
  assert.equal(bin,path.join("resources","engine",platform==="win32"?"excelsior.exe":"excelsior"));
 }
});
test("readiness requires capability-bearing authentication, not an open socket",async()=>{
 function socket(payload){const s={close(){},send(){queueMicrotask(()=>s.onmessage({data:JSON.stringify(payload)}));}};queueMicrotask(()=>s.onopen());return s;}
 await authenticateEngine("ws://test","token",()=>socket({ver:"v1",type:"auth",payload:{ok:true,capabilities:["run-lifecycle-v1"]}}));
 await assert.rejects(authenticateEngine("ws://test","token",()=>socket({ver:"v1",type:"auth",payload:{ok:true,capabilities:[]}})));
});


test("packaged application origin trusts only the exact main page",()=>{
 const target={kind:"app",value:"excelsior://desktop/index.html"};
 assert.equal(trustedURL(target.value,target),true);
 for(const url of ["excelsior://evil/index.html","excelsior://desktop/other.html","file:///index.html","https://desktop/index.html"])assert.equal(trustedURL(url,target),false);
});
