"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { EngineClient } from "./engineClient";
import { initialEngineState, reduce, NO_USAGE } from "./engineState";
import type { AskReq, PermissionReq, Commands } from "./protocol";

export function useEngine(engineUrl: string) {
 const [state, dispatch] = useReducer(reduce, undefined, initialEngineState);
 const [credentialsVersion, setCredentialsVersion] = useState(0);
 const clientRef = useRef<EngineClient | null>(null);
 const stateRef = useRef(state);
 stateRef.current = state;
 useEffect(() => {
  const refresh = () => setCredentialsVersion(v => v + 1);
  window.addEventListener("engine-credentials", refresh);
  return () => window.removeEventListener("engine-credentials", refresh);
 }, []);
 useEffect(() => {
  dispatch({type:"reset"});
  if (!engineUrl) return;
  let alive = true;
  const client = new EngineClient(engineUrl, {
   onMessage: msg => { if(alive) dispatch({type:"server",msg}); },
   onStatus: status => { if(alive) dispatch({type:"status",status}); },
   onError: message => { if(alive) dispatch({type:"error",message}); },
   getToken: async url => sessionStorage.getItem("engine-token:"+url) || await window.electronAPI?.getEngineToken(url) || "",
  });
  clientRef.current = client;
  return () => { alive=false;client.close();if(clientRef.current===client)clientRef.current=null; };
 }, [engineUrl,credentialsVersion]);
 const perform = useCallback(async <T,>(operation:(client:EngineClient)=>Promise<T>):Promise<T|undefined> => {
  const client=clientRef.current;
  try {
   if(!client)throw new Error("Engine disconnected; command was not sent.");
   dispatch({type:"error",message:null});
   const result=await operation(client);
   return client===clientRef.current ? result : undefined;
  } catch(e) {
   if(client===clientRef.current)dispatch({type:"error",message:e instanceof Error?e.message:String(e)});
   return undefined;
  }
 },[]);
 useEffect(()=>{
  if(state.refreshList && state.status==="connected")void perform(c=>c.refreshSessions());
 },[state.refreshList,state.status,perform]);
 const selectSession=useCallback(async(id:string)=>{
  const result=await perform(c=>c.selectSession(id));
  if(result)dispatch({type:"active",id});
  return !!result;
 },[perform]);
 const createSession=useCallback((title?:string)=>perform(c=>c.createSession(title)),[perform]);
 const setWorkspace=useCallback((workspace:string)=>perform(c=>c.setWorkspace(workspace)),[perform]);
 const startChat=useCallback(async(text:string,model="")=>{
  const trimmed=text.trim();if(!trimmed)return false;
  const id=stateRef.current.activeId;
  return !!await perform(c=>c.startChat(trimmed,model,id));
 },[perform]);
 const cancelRun=useCallback(async()=>{
  const s=stateRef.current,id=s.activeId;if(!id||!s.runIds[id])return;
  await perform(c=>c.cancelRun(id,s.runIds[id]));
 },[perform]);
 const replyAsk=useCallback((q:AskReq,selected:number,answer:string,label:string)=>perform(c=>c.replyAsk({sessionId:q.sessionId,runId:q.runId,interactionId:q.interactionId,selected,answer,label})),[perform]);
 const replyPermission=useCallback((p:PermissionReq,approved:boolean)=>perform(c=>c.replyPermission({sessionId:p.sessionId,runId:p.runId,interactionId:p.interactionId,approved})),[perform]);
 const deleteSession=useCallback((id:string)=>perform(c=>c.deleteSession(id)),[perform]);
 const renameSession=useCallback((id:string,title:string)=>perform(c=>c.renameSession(id,title)),[perform]);
 const setSettings=useCallback((settings:Commands["settings.set"])=>perform(c=>c.setSettings(settings)),[perform]);
 const pushLocal=useCallback((message:string)=>dispatch({type:"error",message}),[]);
 const id=state.activeId;
 return {
  wsState:state.status,sessions:state.sessions,activeId:id,workspace:state.workspace,
  blocks:id?state.blocksBySession[id]??[]:[],streaming:!!(id&&state.streamingBySession[id]),
  usage:id?state.usageBySession[id]??NO_USAGE:NO_USAGE,ask:id?state.asksBySession[id]??null:null,
  permission:id?state.permsBySession[id]??null:null,outcome:id?state.outcomes[id]??null:null,
  allowAll:state.allowAll,error:state.error,
  selectSession,createSession,setWorkspace,startChat,cancelRun,replyAsk,replyPermission,
  deleteSession,renameSession,setSettings,pushLocal,
 };
}
