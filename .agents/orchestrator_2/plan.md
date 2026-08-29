# Execution Plan — Orchestrator Gen 2

## Milestone 3: Subsystem Hardening, Concurrency & Resilience
1. Analyze `pkg/engine/conn.go`, `pkg/llm/client.go`, `pkg/tools/grep.go`, `pkg/engine/client.go`, `pkg/agent/agent.go`.
2. Concurrency fix in `pkg/engine/conn.go`:
   - Mutex-guarded send / closed state or safe send pattern to eliminate race conditions on `c.send` during close/write.
   - Backpressure control envelope delivery: critical envelopes (`TypeDone`, `TypeError`, etc.) must not be silently dropped when buffer is saturated or during teardown.
3. Streaming fix in `pkg/llm/client.go`:
   - Remove hardcoded 120s HTTP Client timeout so streaming models (like reasoning models) are bounded solely by caller context.
4. Tool / Subsystem edge cases:
   - Hardening `pkg/tools/grep.go` against nil/empty matches or missing paths.
   - Hardening `pkg/engine/client.go:Ask` against index out of range or malformed responses.
   - Hardening `pkg/agent/agent.go` against nil messages or invalid delta states.
5. Unit tests for M3 hardening & race test verification (`go test -race ./pkg/engine/... ./pkg/llm/... ./pkg/tools/... ./pkg/agent/...`).
6. Gate 3 verification & recording in `GATE_STATUS.md`.

## Milestone 4: Production Test Suite & Static Analysis Excellence
1. Unit tests for `pkg/util`: `atomic_test.go`, `truncate_test.go`.
2. Unit tests for `pkg/tui`: Bubble Tea headless/mock testing for UI components, viewport, key handling, and sink integration.
3. Unit tests for `cmd/excelsior`: CLI flag parsing, root commands, subcommand execution (`serve`, `version`, `history`, `tui`).
4. Repowide coverage calculation & verification that test coverage exceeds 85%.
5. Run `go vet ./...` and resolve any warnings.
6. Gate 4 verification & recording in `GATE_STATUS.md`.

## Milestone 5: Dual-Track Opaque-Box E2E Test Suite (Tiers 1-4)
1. Implement requirement-driven E2E tests in `test/e2e/`:
   - Tier 1: CLI commands & configuration loading.
   - Tier 2: Protocol serialization & WebSocket Engine communication.
   - Tier 3: Agent ReAct loop execution & tool calling.
   - Tier 4: Streaming LLM responses, backpressure & cancellation.
2. Verify all Tiers pass with `go test -race -v ./test/e2e/...`.
3. Publish `TEST_READY.md` documenting test architecture and verification results.
4. Gate 5 verification & recording in `GATE_STATUS.md`.

## Milestone 6: Tier 5 White-box Adversarial Hardening & Final Victory Audit
1. Tier 5 white-box adversarial stress tests (heavy concurrency, rapid disconnects, malformed envelopes, LLM fault injection).
2. Complete test suite verification: `go test -race ./...`, `go vet ./...`, `go build ./cmd/excelsior`.
3. Final Forensic Audit verification (Integrity Check, No mocks in prod code, Real state and behavior).
4. Final Human Report generation and completion notification.
