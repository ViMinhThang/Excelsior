package llm
import(
 "context"
 "errors"
 "strings"
 "testing"
 "github.com/zendev-sh/goai/provider"
)
type countingProvider struct{calls int}
func(p *countingProvider)ModelID()string{return "test"}
func(p *countingProvider)DoStream(context.Context,provider.GenerateParams)(*provider.StreamResult,error){p.calls++;return &provider.StreamResult{},nil}
func(p *countingProvider)DoGenerate(context.Context,provider.GenerateParams)(*provider.GenerateResult,error){p.calls++;return &provider.GenerateResult{},nil}
func TestBudgetChecksEveryAssembledProviderRequest(t *testing.T){
 next:=&countingProvider{};model:=budgetedModel{LanguageModel:next}
 first:=provider.GenerateParams{Messages:[]provider.Message{{Role:provider.RoleUser,Content:[]provider.Part{{Type:provider.PartText,Text:"hello"}}}}}
 if _,err:=model.DoStream(context.Background(),first);err!=nil{t.Fatal(err)}
 second:=first;second.Messages=append(second.Messages,provider.Message{Role:provider.RoleTool,Content:[]provider.Part{{Type:provider.PartToolResult,ToolOutput:strings.Repeat("x",MaxProviderInputBytes)}}})
 if _,err:=model.DoStream(context.Background(),second);!errors.Is(err,ErrInvalidRequest){t.Fatalf("oversized tool result sent to provider: %v",err)}
 args:=first;args.Messages=append(args.Messages,provider.Message{Role:provider.RoleAssistant,Content:[]provider.Part{{Type:provider.PartToolCall,ToolInput:[]byte("\""+strings.Repeat("x",MaxProviderInputBytes)+"\"")}}})
 if _,err:=model.DoGenerate(context.Background(),args);!errors.Is(err,ErrInvalidRequest){t.Fatalf("oversized arguments sent to provider: %v",err)}
 if next.calls!=1{t.Fatalf("budget reached network: %d calls",next.calls)}
}

