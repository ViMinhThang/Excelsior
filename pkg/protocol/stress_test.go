package protocol

import (
	"encoding/json"
	"errors"
	"math"
	"testing"
)

// CyclicalNode defines a self-referential struct for testing cycle detection in JSON marshaling.
type CyclicalNode struct {
	Name string        `json:"name"`
	Next *CyclicalNode `json:"next,omitempty"`
}

func TestMustMarshalPayload_AdversarialInputs(t *testing.T) {
	// 1. Cyclical pointer structure
	node1 := &CyclicalNode{Name: "Node1"}
	node2 := &CyclicalNode{Name: "Node2", Next: node1}
	node1.Next = node2 // Create cycle

	rawCycle := MustMarshalPayload(node1)
	if rawCycle != nil {
		t.Errorf("expected nil for cyclical struct, got %s", string(rawCycle))
	}

	// 2. Unmarshalable Go types: channel
	ch := make(chan int, 5)
	if raw := MustMarshalPayload(ch); raw != nil {
		t.Errorf("expected nil for channel, got %s", string(raw))
	}

	// 3. Unmarshalable Go types: function
	fn := func(x int) int { return x * 2 }
	if raw := MustMarshalPayload(fn); raw != nil {
		t.Errorf("expected nil for function, got %s", string(raw))
	}

	// 4. Unmarshalable Go types: complex number
	c := complex(3.14, 2.71)
	if raw := MustMarshalPayload(c); raw != nil {
		t.Errorf("expected nil for complex number, got %s", string(raw))
	}

	// 5. Special IEEE 754 float values
	if raw := MustMarshalPayload(math.NaN()); raw != nil {
		t.Errorf("expected nil for math.NaN(), got %s", string(raw))
	}
	if raw := MustMarshalPayload(math.Inf(1)); raw != nil {
		t.Errorf("expected nil for +Inf, got %s", string(raw))
	}
	if raw := MustMarshalPayload(math.Inf(-1)); raw != nil {
		t.Errorf("expected nil for -Inf, got %s", string(raw))
	}

	// 6. Nil value
	if raw := MustMarshalPayload(nil); raw != nil {
		t.Errorf("expected nil for nil value, got %s", string(raw))
	}
}

func TestMarshalPayload_AdversarialInputs(t *testing.T) {
	// 1. Cyclical struct
	node := &CyclicalNode{Name: "Self"}
	node.Next = node

	raw, err := MarshalPayload(node)
	if err == nil {
		t.Fatal("expected error for cyclical payload")
	}
	if raw != nil {
		t.Errorf("expected nil raw on error, got %s", string(raw))
	}
	if !errors.Is(err, ErrInvalidPayload) {
		t.Fatalf("expected errors.Is(err, ErrInvalidPayload), got %v", err)
	}
	var protoErr *ProtocolError
	if !errors.As(err, &protoErr) {
		t.Fatalf("expected *ProtocolError, got %T: %v", err, err)
	}
	if protoErr.Op != "marshal" {
		t.Errorf("expected Op 'marshal', got %q", protoErr.Op)
	}

	// 2. Unmarshalable channel
	rawCh, errCh := MarshalPayload(make(chan struct{}))
	if errCh == nil || rawCh != nil {
		t.Fatalf("expected error and nil payload for chan, got payload=%v, err=%v", rawCh, errCh)
	}

	// 3. NaN float
	rawNaN, errNaN := MarshalPayload(math.NaN())
	if errNaN == nil || rawNaN != nil {
		t.Fatalf("expected error and nil payload for NaN, got payload=%v, err=%v", rawNaN, errNaN)
	}

	// 4. Valid nil payload returns (nil, nil)
	rawNil, errNil := MarshalPayload(nil)
	if errNil != nil || rawNil != nil {
		t.Fatalf("expected (nil, nil) for nil input, got raw=%v, err=%v", rawNil, errNil)
	}
}

func TestEnvelope_AdversarialConstructors(t *testing.T) {
	// Cyclical payload passed to NewEnvelope and NewEnvelopeWithID
	cycle := &CyclicalNode{Name: "A"}
	cycle.Next = cycle

	env1 := NewEnvelope(TypeDelta, cycle)
	if env1.Payload != nil {
		t.Errorf("expected nil payload for NewEnvelope with cycle, got %s", string(env1.Payload))
	}

	env2 := NewEnvelopeWithID("id-cycle", TypeDelta, cycle)
	if env2.Payload != nil {
		t.Errorf("expected nil payload for NewEnvelopeWithID with cycle, got %s", string(env2.Payload))
	}

	// BuildEnvelope with cyclical payload
	_, err := BuildEnvelope("id-cycle", TypeDelta, cycle)
	if err == nil || !errors.Is(err, ErrInvalidPayload) {
		t.Fatalf("expected ErrInvalidPayload from BuildEnvelope on cycle, got %v", err)
	}
}

func TestEnvelopeDecode_CorruptedPayloads(t *testing.T) {
	testCases := []struct {
		name    string
		payload string
	}{
		{"Empty string", ""},
		{"Truncated JSON object", `{"key": "val`},
		{"Invalid array syntax", `[1, 2,`},
		{"Invalid token", `undefined`},
		{"Control characters", "{\x00\x01\x02}"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			env := Envelope{
				Ver:     Ver,
				Type:    TypeChatReq,
				Payload: json.RawMessage(tc.payload),
			}
			var target map[string]any
			err := env.Decode(&target)
			if len(tc.payload) == 0 {
				if err != nil {
					t.Fatalf("expected nil error for empty payload, got %v", err)
				}
			} else {
				if err == nil {
					t.Fatalf("expected error for corrupted payload %q", tc.payload)
				}
				if !errors.Is(err, ErrInvalidPayload) {
					t.Fatalf("expected ErrInvalidPayload, got %v", err)
				}
			}
		})
	}
}
