# E2E Test Infra: Excelsior Codebase

## Test Philosophy
- Opaque-box, requirement-driven. Derives test cases directly from `ORIGINAL_REQUEST.md` and user-facing requirements.
- Validates system behavior via CLI invocations, WebSocket message exchanges, agent execution loops, and domain error inspection.
- Independent of implementation internals.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Configuration & Environment Loading | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | LLM Client & SSE Streaming | ORIGINAL_REQUEST §R1, R3 | 5 | 5 | ✓ |
| 3 | Tool Registry & Execution (Bash, View, Write, Edit, Glob, Grep, Ls, Ask) | ORIGINAL_REQUEST §R1, R3 | 8 | 8 | ✓ |
| 4 | Agent Loop & Tool Calling ReAct Cycle | ORIGINAL_REQUEST §R1, R3 | 5 | 5 | ✓ |
| 5 | Session Persistence & History | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | WebSocket Engine Protocol & Remote Streaming | ORIGINAL_REQUEST §R1, R3 | 5 | 5 | ✓ |
| 7 | Unified Domain Error Inspection (errors.Is/As) | ORIGINAL_REQUEST §R2 | 8 | 8 | ✓ |
| 8 | Context Cancellation & Timeout Propagation | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- **Location**: `test/e2e`
- **Runner**: Go standard test runner (`go test -v ./test/e2e/...`)
- **Tiers**:
  - Tier 1: Feature Coverage (Isolation, happy-path representative inputs)
  - Tier 2: Boundary & Corner Cases (Empty strings, invalid tokens, zero-length slices, max limits, cancellations)
  - Tier 3: Cross-Feature Combinations (Engine + Agent + Tools + Errors + Session)
  - Tier 4: Real-World Workload Scenarios (End-to-end coding tasks, tool execution sequences, server restarts)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Multi-step Code Editing Session | Agent + Tool (View/Edit) + Session + LLM | High |
| 2 | Workspace Grep and File Inspection | Agent + Tools (Grep/Glob/View) + Engine | Medium |
| 3 | Error Recovery & Retry Lifecycle | LLM Retry + Domain Error + Engine | High |
| 4 | Remote WebSocket Agent Execution | Engine Server + WSClient + Protocol + Agent | High |
| 5 | Graceful Context Cancellation | Agent Loop + Tool Bash Timeout + Engine Conn | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature (~40 test cases)
- Tier 2: ≥5 per feature (~40 test cases)
- Tier 3: Pairwise coverage of major feature pairs (≥15 test cases)
- Tier 4: ≥5 realistic application scenarios
- **Total: ≥100 test cases across Tiers 1-4**
