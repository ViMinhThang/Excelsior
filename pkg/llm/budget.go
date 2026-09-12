package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/zendev-sh/goai/provider"
)

// MaxProviderInputBytes bounds the actual assembled input at every tool-loop step,
// including system text, tool schemas, arguments and results. It is not a token count.
const MaxProviderInputBytes = 600_000

type budgetedModel struct{ provider.LanguageModel }

func (m budgetedModel) Capabilities() provider.ModelCapabilities {
	return provider.ModelCapabilitiesOf(m.LanguageModel)
}
func checkProviderInput(p provider.GenerateParams) error {
	b, err := json.Marshal(p)
	if err != nil {
		return fmt.Errorf("provider input: %w", err)
	}
	if len(b) > MaxProviderInputBytes {
		return fmt.Errorf("%w: provider input is %d bytes (limit %d); start a shorter conversation", ErrInvalidRequest, len(b), MaxProviderInputBytes)
	}
	return nil
}
func (m budgetedModel) DoStream(ctx context.Context, p provider.GenerateParams) (*provider.StreamResult, error) {
	if err := checkProviderInput(p); err != nil {
		return nil, err
	}
	return m.LanguageModel.DoStream(ctx, p)
}
func (m budgetedModel) DoGenerate(ctx context.Context, p provider.GenerateParams) (*provider.GenerateResult, error) {
	if err := checkProviderInput(p); err != nil {
		return nil, err
	}
	return m.LanguageModel.DoGenerate(ctx, p)
}
