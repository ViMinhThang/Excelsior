package protocol

import (
 "bytes"
 "encoding/json"
 "os"
 "path/filepath"
 "testing"
 "excelsior/pkg/llm"
)
func TestLifecycleContractFixture(t *testing.T){
 pending:=NewEnvelope(TypePermissionReq,PermissionReq{SessionID:"session-one",RunID:"run-one",InteractionID:"approval-one",Tool:"edit",FilePath:"file.go",Preview:"replace"})
 outcome:=DoneResp{SessionID:"session-one",RunID:"run-one",Status:"persistence_failed",Persisted:false,Code:"persistence_failed",Error:"disk full"}
 snapshot:=SessionDataResp{ID:"session-one",RunID:"run-one",Running:true,Messages:[]llm.Message{{Role:"user",Content:"edit file"}},Events:[]Delta{{SessionID:"session-one",RunID:"run-one",Type:"text",Text:"working"}},Pending:&pending}
 terminal:=SessionDataResp{ID:"session-one",RunID:"run-one",Messages:[]llm.Message{{Role:"user",Content:"edit file"},{Role:"assistant",Content:"generated result"}},Outcome:&outcome,UnsavedAvailable:true,Status:outcome.Status}
 envelopes:=[]Envelope{
  NewEnvelope(TypeAuth,map[string]any{"ok":true,"workspace":"fixture-workspace","capabilities":[]string{RunLifecycleCapability}}),
  NewEnvelopeWithID("workspace-one",TypeWorkspaceSet,WorkspaceSetReq{Workspace:"fixture-workspace"}),
  NewEnvelopeWithID("snapshot-one",TypeSessionData,snapshot),
  pending,
  NewEnvelope(TypeInteractionDone,map[string]string{"sessionId":"session-one","runId":"run-one","interactionId":"approval-one"}),
  NewEnvelope(TypeDelta,Delta{SessionID:"session-one",RunID:"run-one",Type:"generation",TotalTokens:42,PromptTokens:30,CompletionTokens:12}),
  NewEnvelope(TypeDone,outcome),
  NewEnvelopeWithID("reconnect-one",TypeSessionData,terminal),
 }
 for i:=range envelopes{if envelopes[i].Type!=TypeAuth{envelopes[i].Workspace="fixture-workspace"}}
 expected,err:=json.MarshalIndent(envelopes,"","  ");if err!=nil{t.Fatal(err)};expected=append(expected,'\n')
 path:=filepath.Join("testdata","lifecycle.json")
 if os.Getenv("UPDATE_PROTOCOL_FIXTURE")=="1"{if err:=os.MkdirAll("testdata",0755);err!=nil{t.Fatal(err)};if err:=os.WriteFile(path,expected,0644);err!=nil{t.Fatal(err)}}
 actual,err:=os.ReadFile(path);if err!=nil{t.Fatal(err)}
 if !bytes.Equal(bytes.ReplaceAll(actual,[]byte("\r\n"),[]byte("\n")),expected){t.Fatal("wire fixture drift: regenerate with UPDATE_PROTOCOL_FIXTURE=1 and run desktop contract tests")}
}

