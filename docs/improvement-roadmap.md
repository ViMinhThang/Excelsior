# Excelsior optimization and architecture roadmap

Date: 2026-09-07

This is a source-based review, not a performance benchmark or a completed implementation. Recommendations below describe observed code paths; predicted performance benefits still need measurement. The earlier shell-output fix already limits capture to 100,000 bytes and has boundary and subprocess tests.

Keep the existing architecture: one Go engine, engine-owned runs, WebSocket clients, GoAI for provider orchestration, and atomic JSON session storage. Improve correctness and expensive paths before adding infrastructure.

## Recommended order

| Priority | Improvement | Expected benefit | Relative scope |
| --- | --- | --- | --- |
| P0 | Fix transcript hook ordering | Prevent runtime failures when a conversation changes between empty and populated | Small |
| P1 | Make packaged engine startup platform-correct | Produce usable Windows and Linux installations | Medium |
| P1 | Bound shell cancellation and edit reads | Limit hangs and memory consumption in tool execution | Medium |
| P1 | Make desktop connection state explicit | Reliable reconnects and workspace/engine switches | Medium |
| P1 | Separate committed completion from interrupted runs | Accurate UI state and recoverable partial work | Medium |
| P2 | Reduce session-list I/O and fix diff attribution | Faster sidebar refreshes and correct file statistics | Small to medium |
| P2 | Shorten global run-lock critical sections | Prevent unrelated sessions blocking one another | Medium |
| P2 | Batch rendering and bound retained state | Lower allocation pressure during long streams | Medium |
| P2 | Enforce context budgets on actual provider input | More predictable long conversations and request sizes | Medium |

P0 means address before the next release. P1 means the next reliability work. P2 means measure first or implement after correctness work. Scope is comparative, not a delivery estimate.

## 1. Fix transcript hook ordering

**Evidence:** `apps/electron/components/Transcript.tsx` returns early for an empty transcript before calling `useRef` and `useState`. The same component can later receive populated blocks and execute those hooks. TypeScript checking does not catch this hook-order violation.

**Smallest change:** Move every hook above the empty-state return. Keep the existing component and rendering structure.

**Acceptance:** Render empty → populated → empty in one mounted component, including switching sessions, without hook-order errors. Add a hook-rules check to frontend validation so this class of regression cannot pass on types alone.

## 2. Make packaging and engine startup reproducible

**Evidence:** `apps/electron/package.json` declares Windows and Linux targets but always copies `../../excelsior.exe` into resources. Its packaging scripts do not build the Go binary first. `main.js` searches checkout binaries before packaged resources and derives the spawned engine workspace from `__dirname/../../`.

**Smallest change:** Build and bundle the engine for the target OS and architecture as part of packaging. In packaged mode, resolve the engine only from packaged resources. Use an explicit user-selected writable workspace rather than deriving one from the installation directory. Report missing binaries and startup failures in the UI.

**Acceptance:** Build on clean Windows and Linux environments without an existing checkout binary. Launch the installed app, authenticate, select a workspace, and execute a harmless tool command. Confirm quitting stops an engine the app started and leaves an external engine running.

**Tradeoff:** Native packaging jobs are simpler to validate than promising every cross-compilation and installer combination immediately.

## 3. Finish bounding tool execution

**Evidence:** `pkg/tools/bash.go` now bounds output capture, but uses `exec.CommandContext` on the shell without explicit descendant-process management or a bound on pipe-drain waiting. Child processes that inherit output handles deserve cancellation tests. `readEditFile` in `pkg/tools/edit.go` reads the entire file before checking `MaxWriteSize`.

**Smallest changes:**

- Read edit input through a limit of `MaxWriteSize + 1`, rejecting excess bytes before replacement. Preserve the existing size error contract.
- Add platform-specific tests for cancellation and timeouts with a spawned child that inherits stdout/stderr. Bound waiting and terminate descendants according to the supported OS process model.
- Preserve an edited file's permission bits; the current atomic replacement always requests `0644`, which can remove executable bits or broaden a private file's permissions on Unix.

**Acceptance:** Oversized files fail without allocating their full size. A canceled shell test returns within a defined bound and leaves no test child running. Executable and private-file mode tests pass on Unix. Existing truncation, exit-error, and timeout output behavior remains covered.

**Boundary:** A shell working directory is not a filesystem sandbox. Document that distinction rather than claiming shell commands are jailed. The earlier hypothetical new-file symlink escape is not reachable through the current registry, which exposes only `edit`, `bash`, and `askQuestion`.

## 4. Make desktop connection transitions explicit

**Evidence:** `apps/electron/lib/useEngine.ts` combines transport, authentication, workspace selection, snapshots, transcript transformation, usage, and interaction promises. `send` silently drops requests when disconnected. Workspace changes clear several maps but leave usage and the session list in place. Changing the engine URL does not explicitly clear all old engine state. Reauthentication restores the active session, not a tracked set of subscribed sessions. Run IDs are stored but delta handling does not validate them.

**Smallest change:** Extract a pure session-state reducer and retain a thin connection effect. Define transitions for authentication, workspace acknowledgement, snapshot, delta, completion, and disconnect. Scope state to engine + canonical workspace + session. Reset all scoped maps together and make send failure observable to the caller.

Track intended subscriptions if background sessions should keep updating after reconnect. Ignore stale run events only after establishing ordering rules for initial snapshots and run changes. Preserve explicit server snapshots as the recovery mechanism.

**Acceptance:** Test engine switching with identical session IDs, workspace rejection, reconnect during streaming, two subscribed sessions, stale interaction replies, and sending while disconnected. Verify an unsent prompt remains available for retry. Do not automatically replay a potentially accepted `chat.req` without request deduplication.

**Tradeoff:** No global state library or event bus is necessary. A pure reducer makes ordering testable without replacing the UI architecture.

## 5. Separate generated completion, persisted completion, and interruption

**Evidence:** `pkg/agent/agent.go` emits a done event before `internal/chat/service.go` saves history. `pkg/engine/runs.go` later sends a separate completion envelope. Failed or canceled partial turns are not saved, as documented in `ARCHITECTURE.md`; tool side effects may nevertheless already exist. `Hub.Close` cancels runs and closes sockets without waiting on their `done` channels.

**Smallest change:** Make terminal run status explicit: succeeded, canceled, failed, or persistence failed. Reserve user-facing successful completion for the post-save result. Keep provider usage completion distinct. Add a bounded engine shutdown wait for active runs after cancellation, without holding the global run lock.

If retaining interrupted work is desired, store a small separate run checkpoint containing the input, displayable partial output, and terminal status. Keep incomplete tool conversations out of replay history. Never automatically re-execute tools from a checkpoint.

**Acceptance:** Inject save failure after successful generation; the UI must not claim the conversation was saved. Cancel after a tool side effect and verify the interrupted state is understandable. Shutdown finishes within its budget. Disconnect alone still leaves a run alive.

**Tradeoff:** Durable checkpoints are a deliberate extension of the current product contract. A full event log, automatic crash resumption, and a database migration are unnecessary for this first step.

## 6. Reduce session-list work and correct file statistics

**Evidence:** `pkg/session/session.go` reads and parses every session file in `List`. `handleSessionList` in `pkg/engine/handlers.go` loads every history again to extract edited files and runs Git commands on each request. The desktop requests another list on completion and several session operations. Statistics lookup uses `filepath.Base(f)` even though Git reports repository-relative paths, so nested files can be missed or attributed to a same-named root file.

**Smallest changes:**

1. Fix attribution using normalized repository-relative paths. Parse machine-readable Git output that handles unusual filenames and renames.
2. Keep basic session metadata separate from optional working-tree statistics. Fetch expensive statistics when needed rather than for every session-list response.
3. If profiling still shows list latency, add a rebuildable metadata cache invalidated by saves, deletes, and detected external changes. JSON files remain authoritative.
4. Add pagination only when the response size or sidebar rendering actually needs it.

**Acceptance:** Cover nested files, duplicate basenames, spaces, renames, and staged plus unstaged changes. Benchmark cold and warm lists with 10, 100, and 1,000 histories. Record latency, bytes read, and allocations before introducing a cache.

**Tradeoff:** Working-tree diff totals are not exact per-session contributions. Label them accordingly; exact attribution requires tracking the edits themselves.

## 7. Reduce work under the global run lock

**Evidence:** `beginTurn` and inactive-session `snapshot` in `pkg/engine/runs.go` perform store I/O while holding `runsMu`. Streaming callbacks in `chat_handler.go` hold it during event accumulation and broadcast. `sendEnvelope` marshals separately for each connection. Slow disk reads and large snapshots can therefore delay unrelated runs and replies.

**Smallest change:** Measure contention first. Separate short run-map coordination from session-local snapshot/event ordering. Reserve a session before loading it so duplicate starts remain impossible; perform slow work outside the global lock and roll back reservations on failure. Marshal a workspace-scoped broadcast once when all recipients receive identical bytes.

**Acceptance:** Use a blocking fake store to prove a slow session load does not delay cancellation or streaming in another session. Keep existing atomic snapshot/subscription and first-valid-interaction-reply tests. Run concurrency tests with the race detector on a supported CI runner.

**Tradeoff:** Do not simply unlock around existing code: snapshot ordering and run registration are correctness requirements. Avoid introducing a worker queue or actor framework for this change.

## 8. Reduce streaming allocations and retained state

**Evidence:** `chat_handler.go` repeatedly concatenates accumulated text strings. `useEngine.ts` copies transcript arrays and session maps on deltas. `Transcript.tsx` mounts every visible block. Markdown rendering already uses memoization, so adding more memo wrappers alone may not help. Server send queues are bounded by message count rather than byte size, and current-turn event storage has no explicit byte budget.

**Smallest change:** Profile long streams. Batch adjacent text/reasoning deltas into one UI update per animation frame; apply interaction and terminal events promptly and flush buffered text before completion. Consider chunked server text accumulation if allocation profiles justify it. Release unused desktop session state and define a byte budget for retained run data and queued snapshots.

**Acceptance:** Replay a fixed stream at several delta rates against a long transcript. Compare rendering time, allocation rate, peak memory, and exact final text. Test background-window behavior, completion flushes, and reconnect snapshots. Retain the existing slow-subscriber disconnect-and-resnapshot policy.

**Tradeoff:** Introduce transcript virtualization only if profiling identifies mounted history as the bottleneck. Any replay cap must preserve a coherent snapshot; silently dropping tool or permission events is not acceptable.

## 9. Budget the actual provider context

**Evidence:** `totalChars` in `pkg/agent/agent.go` counts content and reasoning but excludes tool-call arguments. Validation occurs before the tool loop. The `maxToolResult` truncation applies to emitted tool-result events; the tool callback returns its original output to the provider adapter.

**Smallest change:** Account for every large text field and distinguish display limits from provider-input limits. Verify where GoAI assembles subsequent requests before choosing the enforcement point. Start with a clear actionable size error; preserve complete tool-call/result pairs if older history is later trimmed.

**Acceptance:** Use a fake provider to inspect requests after large tool output and arguments. Verify the intended budget is enforced on actual provider input, not only UI events. Test long multi-step runs and ensure trimming never leaves unmatched tool calls.

**Tradeoff:** Character counts are a rough guard, not token counts. Add model-aware token accounting or summarization only when the observed failures justify that complexity.

## Validation and implementation sequence

1. Fix the transcript hook issue and add a runtime transition check.
2. Validate installed Windows/Linux startup and the tool resource bounds.
3. Add deterministic connection-state and persistence-failure tests before changing lifecycle code.
4. Establish session-list and streaming benchmarks, then optimize the measured bottleneck.
5. Re-run `go test ./...`, `go vet ./...`, `go build ./...`, desktop type checking, and targeted runtime checks. Package smoke tests are separate from a successful source build.

Use the existing CI workflow as the starting point. `.github/workflows/ci.yml` currently selects Go 1.23 while `go.mod` declares Go 1.25.0; derive the toolchain from the module declaration instead of depending on implicit toolchain downloads. The workflow has no desktop checks or Windows job. Its `govulncheck ./... || echo ...` step masks all scan failures, not just a missing executable: install the scanner explicitly and preserve its failure status.

Ensure Windows-specific account/ACL tests run under a real test account: the earlier owner-token test failed inside the restricted sandbox and passed outside it. Run race checks where the toolchain supports them.

No performance numbers are claimed here. Record reproducible fixture sizes, machine details, and before/after results with each optimization. Do not add microservices, Redis, a message broker, a generic repository layer, or SQLite until a measured requirement exceeds the current single-engine design.
