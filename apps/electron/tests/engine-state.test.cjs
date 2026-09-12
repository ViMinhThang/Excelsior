require("./load-typescript.cjs");
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {decodeMessage}=require("../lib/protocol.ts");
const {reduce,initialEngineState}=require("../lib/engineState.ts");
const wire=(type,payload,workspace="A")=>({ver:"v1",type,payload,workspace});
const apply=(s,type,p,ws)=>reduce(s,{type:"server",msg:wire(type,p,ws)});
const snap=(id="shared",runId="current")=>({id,runId,running:true,messages:[{role:"user",content:"hello"}],events:[],unsavedAvailable:false,projectionUnavailable:false});

test("Go lifecycle fixture decodes and failure survives terminal snapshot",()=>{
 const fixtures=JSON.parse(fs.readFileSync(path.resolve(__dirname,"../../../pkg/protocol/testdata/lifecycle.json"),"utf8"));
 let state=initialEngineState();
 for(const item of fixtures)state=reduce(state,{type:"server",msg:decodeMessage(JSON.stringify(item))});
 assert.equal(state.outcomes["session-one"].status,"persistence_failed");
 assert.equal(state.streamingBySession["session-one"],undefined);
 assert.equal(state.blocksBySession["session-one"][1].content,"generated result");
 assert.match(state.blocksBySession["session-one"].at(-1).content,/not saved/);
});
test("scope changes reset every server-derived map; stale run and interaction events are ignored",()=>{
 let s=apply(initialEngineState(),"workspace.set",{workspace:"A"});
 s=apply(s,"session.data",snap());
 const prompt={sessionId:"shared",runId:"current",interactionId:"latest",question:"choose",options:["yes"]};
 s=apply(s,"ask.req",prompt);
 assert.equal(apply(s,"interaction.done",{sessionId:"shared",runId:"old",interactionId:"old"}),s);
 assert.equal(apply(s,"delta",{sessionId:"shared",runId:"old",type:"text",text:"old"}),s);
 assert.equal(apply(s,"done",{sessionId:"shared",runId:"old",status:"canceled",persisted:false}),s);
 s=apply(s,"workspace.set",{workspace:"B"},"B");
 assert.equal(s.activeId,null);
 for(const key of ["blocksBySession","streamingBySession","usageBySession","asksBySession","permsBySession","runIds","outcomes"])assert.deepEqual(s[key],{});
 assert.deepEqual(reduce(s,{type:"reset"}),initialEngineState());
});
test("malformed or incompatible messages fail before changing state",()=>{
 for(const msg of [
  {ver:"v0",type:"auth",payload:{}},
  wire("session.data",{...snap(),runId:""}),
  wire("session.data",{...snap(),events:[{sessionId:"other",runId:"current",type:"text"}]}),
  wire("done",{sessionId:"shared",runId:"current",status:"succeeded",persisted:false}),
  wire("ask.req",{sessionId:"shared",runId:"current",interactionId:"i",question:"?",options:42}),
 ])assert.throws(()=>decodeMessage(JSON.stringify(msg)));
});
test("terminal snapshots replace the view without duplicate text or error blocks",()=>{
 let s=apply(initialEngineState(),"workspace.set",{workspace:"A"});
 const p={...snap(),running:false,messages:[{role:"assistant",content:"answer"}],outcome:{sessionId:"shared",runId:"current",status:"persistence_failed",persisted:false,error:"disk full"},unsavedAvailable:true};
 s=apply(s,"session.data",p);s=apply(s,"session.data",p);
 assert.equal(s.blocksBySession.shared.length,2);
 assert.equal(s.blocksBySession.shared[0].content,"answer");
});

