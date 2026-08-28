"use client";
import { useEffect, useRef, useState } from "react";
import type { AskReq, Delta } from "../lib/protocol";

type Block = { role: "system"|"user"|"assistant"|"reason"|"tool"|"error"; content: string; meta?: string };

export default function Page(){
  const [model] = useState("deepseek-v4-flash");
  const [wsState, setWsState] = useState("disconnected");
  const [blocks, setBlocks] = useState<Block[]>([
    {role:"system", content:"Excelsior — deepseek-native  •  monochrome 252"},
    {role:"system", content:"Enter: send • Ctrl+C: quit • askQuestion → 3 options + input"}
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ask, setAsk] = useState<AskReq & { _resolve:(r:{selected:number,answer:string,label:string})=>void } | null>(null);
  const [askInput, setAskInput] = useState("");
  const wsRef = useRef<WebSocket|null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Fix hydration: same initial value on server and client, update after mount if needed
  const [engineUrl, setEngineUrl] = useState("ws://localhost:17812/v1/ws");
  useEffect(()=>{
    const envUrl = (window as unknown as {EXCELSIOR_ENGINE?:string}).EXCELSIOR_ENGINE;
    if(envUrl) setEngineUrl(envUrl);
    // keep default 17812 for both dev (3000) and prod; don't use location.host
  },[]);

  useEffect(()=>{
    const url = engineUrl;
    // don't connect until engineUrl is set (always set, but guard)
    if(!url) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = ()=> setWsState("connected");
    ws.onclose = ()=> setWsState("disconnected");
    ws.onerror = ()=> setWsState("error");
    ws.onmessage = (ev)=>{
      const env = JSON.parse(ev.data);
      if(env.type==="delta"){
        const d:Delta = env.payload;
        if(d.type==="text") setBlocks(b=>[...b, {role:"assistant", content:d.text||""}]);
        else if(d.type==="reasoning") setBlocks(b=>[...b, {role:"reason", content:d.reasoning||""}]);
        else if(d.type==="tool_start") setBlocks(b=>[...b, {role:"tool", content:d.toolArgs||"", meta:d.toolName}]);
        else if(d.type==="tool_result") setBlocks(b=>[...b, {role:"tool", content:d.toolResult||"", meta:(d.toolName||"")+" →"}]);
        else if(d.type==="error") setBlocks(b=>[...b, {role:"error", content:d.text||""}]);
        setStreaming(true);
      } else if(env.type==="done"){ setStreaming(false); }
      else if(env.type==="error"){ setBlocks(b=>[...b, {role:"error", content: env.payload?.error||"error"}]); setStreaming(false); }
      else if(env.type==="ask.req"){
        const q:AskReq = env.payload;
        // show overlay with promise
        let resolve!: (r:any)=>void;
        const p = new Promise<any>(r=>{ resolve=r; });
        (p as unknown as {resolve:any}).resolve = resolve;
        setAsk({ ...q, _resolve: resolve } as unknown as typeof ask & { _resolve:any });
        // when resolved, send back
        p.then((resp:{selected:number,answer:string,label:string})=>{
          ws.send(JSON.stringify({ver:"v1", type:"ask.resp", payload: resp}));
          setAsk(null);
        });
      }
    };
    return ()=> ws.close();
  },[engineUrl]);

  useEffect(()=>{ transcriptRef.current?.scrollTo(0, 9e9); },[blocks]);

  const send = ()=>{
    const text = input.trim();
    if(!text || !wsRef.current || wsRef.current.readyState!==1) return;
    setBlocks(b=>[...b, {role:"user", content:text}]);
    wsRef.current!.send(JSON.stringify({ver:"v1", type:"chat.req", payload:{model, messages:[{role:"user", content:text}]}}));
    setInput(""); setStreaming(true);
  };

  const answerAsk = (selected:number, label:string)=>{
    const a = ask; if(!a) return;
    const resp = selected===-1 ? {selected, answer: askInput.trim(), label: askInput.trim()} : {selected, answer: label, label};
    if(!resp.answer) return;
    (a as unknown as {_resolve:(r:any)=>void})._resolve(resp);
  };

  return (
    <main className="max-w-[900px] mx-auto h-screen flex flex-col gap-2 p-3">
      <header className="border border-border rounded-xl px-3 py-2 flex gap-2 items-center">
        <span className="bg-fg text-bg px-2 py-1 rounded-md font-bold"> excelsior </span>
        <span className="text-muted text-sm">{model} • {engineUrl} • <span className={streaming?"text-fg font-bold":"text-muted"}>{streaming?"● streaming…":"idle"}</span></span>
        <span className="ml-auto text-xs text-muted">WS: {wsState}</span>
      </header>

      <div ref={transcriptRef} className="flex-1 overflow-auto border border-[#222] rounded-xl p-3 bg-surface">
        {blocks.map((b,i)=>(
          <div key={i} className={`mb-3 ${b.role==="system"?"text-muted italic":b.role==="user"?"text-fg font-bold":b.role==="assistant"?"text-fg whitespace-pre-wrap":b.role==="reason"?"text-dim italic whitespace-pre-wrap":b.role==="error"?"text-fg underline whitespace-pre-wrap":""}`}>
            {b.role==="tool" ? (
              <><div className="text-fg font-bold">◆ {b.meta}</div><div className="border border-border rounded-lg p-2 bg-[#111] text-[#ddd] whitespace-pre-wrap max-h-[300px] overflow-auto">{b.content.slice(0,800)}</div></>
            ) : b.role==="user" ? `You: ${b.content}` : b.role==="system" ? `· ${b.content}` : b.role==="reason" ? `… ${b.content}` : b.role==="error" ? `✖ ${b.content}` : b.content}
          </div>
        ))}
      </div>

      {ask && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-10">
          <div className="border border-border rounded-xl bg-surface p-4 w-[min(560px,90vw)]">
            <div className="font-bold mb-3">{ask.question}</div>
            {(ask.options||[]).slice(0,3).map((o:string,i:number)=>(
              <div key={i} onClick={()=>answerAsk(i,o)} className="border border-[#333] rounded-lg p-2 my-1 cursor-pointer hover:border-border">{i+1}. {o}</div>
            ))}
            <div className="flex gap-2 mt-3"><input value={askInput} onChange={e=>setAskInput(e.target.value)} placeholder="Type your answer…" className="flex-1 bg-transparent border border-border rounded-lg px-3 py-2 outline-none"/><button onClick={()=>answerAsk(-1,askInput)} className="border border-border bg-fg text-bg rounded-lg px-4 font-bold">Send</button></div>
            <div className="text-muted text-xs italic mt-2">1/2/3 select • Enter send • Esc cancel</div>
          </div>
        </div>
      )}

      <div className="border border-border rounded-xl p-2 flex gap-2 items-center bg-surface">
        <span className="font-bold">❯</span>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); send(); } }} placeholder="Ask anything — Enter to send…" className="flex-1 bg-transparent outline-none" disabled={!!ask || streaming} />
        <button onClick={send} className="border border-border bg-fg text-bg rounded-lg px-4 py-1 font-bold disabled:opacity-50" disabled={!!ask || streaming || !input.trim()}>Send</button>
      </div>
      <div className="text-muted text-xs">{blocks.length} blocks • {wsState} • ↑↓ scroll</div>
    </main>
  );
}
