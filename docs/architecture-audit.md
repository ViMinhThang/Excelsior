# Architecture proposal audit

Date: 2026-09-08  
Reference: [architecture-proposal.md](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/docs/architecture-proposal.md)  
Scope: commit cf85221 **plus the existing uncommitted implementation**, including the new desktop client/reducer and session lease files.

**Verdict: partially implemented; stages 1 and 2 do not yet meet their acceptance criteria.** The proposed file boundaries are taking shape, but event ordering, truthful completion, reconnect state, and storage ownership still have correctness gaps.

This audit adds this report only. Production code and pre-existing changes were left intact. Temporary test overlays reproduced backend failures without changing repository tests.

## Prioritized findings

**1. [P1] Desktop never reaches a usable connection state.**  
[engineClient.ts:82](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/engineClient.ts:82), [engineState.ts:102](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/engineState.ts:102), [useEngine.ts:64](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/useEngine.ts:64)

Authentication sets the private authed flag and workspace, but neither the client nor reducer emits connected. Status stays connecting; bootstrap and active-session effects never run, and the composer remains disabled. A fake WebSocket replay produced only the connecting status. Implement authentication → synchronization → ready, with readiness reached after required snapshots.

**2. [P1] Snapshot subscription is no longer ordered with live delivery.**  
[coordinator.go:433](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:433), [coordinator.go:513](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:513), [conn.go:264](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/engine/conn.go:264)

The coordinator updates projections and copies subscribers under its mutex, then invokes subscribers after unlocking. SnapshotAndSubscribe returns before the adapter enqueues the snapshot. A later event can arrive before the snapshot and be erased when the snapshot replaces the view. Conversely, an event already represented in a snapshot can arrive afterward and appear twice. A deterministic blocked-subscriber test reproduced duplication. Snapshot capture, snapshot enqueue, and subsequent delivery need one ordered boundary. Also, dispatchChat sends the starting snapshot only to the initiating connection; existing subscribers need the new run identity and starting projection.

**3. [P1] Both clients discard authoritative failure outcomes.**  
[client.go:212](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/engine/client.go:212), [engineState.ts:113](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/engineState.ts:113), [coordinator.go:418](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:418)

The remote CLI returns success for every done envelope, including failed, canceled, and persistence_failed. Execution errors can be missed because the coordinator sends the outcome before the separate error envelope and the CLI exits on done. Desktop clears streaming without reading status, persisted, code, or error; persistence failures do not get a separate error envelope. Tests reproduced successful remote completion for all three unsuccessful statuses and no desktop error for a failed save. Decode outcomes in both clients and distinguish generated output from saved success.

**4. [P1] Desktop state and reconnect restoration are not scoped to the confirmed engine/workspace.**  
[engineState.ts:102](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/engineState.ts:102), [useEngine.ts:47](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/useEngine.ts:47), [useEngine.ts:64](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/useEngine.ts:64), [page.tsx:139](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/app/page.tsx:139)

Authentication and workspace acknowledgements replace only the workspace field; transcripts, active session, usage, run IDs, and prompts remain. Replacing the engine client preserves those maps too. A replay switching A → B retained A's transcript and pending question under B. workspaceRef is never assigned, so reconnect cannot restore a selected non-default workspace; only the active session is restored, not background subscriptions. The view changes its project label before acceptance and can submit session.create immediately after workspace.set, even if selection fails. Separate desired and confirmed scope, reset or key server state by endpoint/workspace/session, and restore subscriptions before enabling mutations.

**5. [P1] Delayed callbacks can acquire the wrong workspace label.**  
[conn.go:83](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/engine/conn.go:83), [conn.go:59](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/engine/conn.go:59), [coordinator.go:443](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:443)

Application callbacks carry session/run identity but no workspace. The adapter reconstructs workspace from the connection's mutable session-ID map. A callback copied before a workspace switch can run after old subscriptions are removed; its empty lookup falls back to the new current workspace. A same-ID subscription in the new workspace also returns that new workspace. Old output can pass the client's workspace filter. Bind workspace to the subscription/event and drop callbacks from revoked subscriptions. Client run-ID validation is also missing.

**6. [P1] Command sending silently loses drafts and cannot correlate acknowledgements.**  
[engineClient.ts:30](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/engineClient.ts:30), [useEngine.ts:85](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/useEngine.ts:85), [Composer.tsx:39](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/components/Composer.tsx:39)

send returns void and silently drops unauthenticated/closed-socket commands. startChat mutates the transcript before knowing whether sending succeeded; Composer clears its text immediately. A socket closing between the readiness check and send loses the draft. Requests lack unique IDs except for a fixed workspace.set ID. A pending new-session prompt is released on any activeId change rather than its matching session.create acknowledgement, allowing unrelated navigation/list responses to select its destination. Return explicit unsent/uncertain results, retain drafts on local failure, and correlate dependent mutations without automatically replaying uncertain commands.

**7. [P1] Shutdown neither drains runs nor preserves committed outcomes.**  
[coordinator.go:667](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:667), [coordinator.go:382](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:382), [hub.go:103](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/engine/hub.go:103)

Close cancels every context, including persisting runs, and returns without waiting for Done channels, closing coordinator subscriptions, or closing stores. ExecuteTurn prioritizes context cancellation over the actual save result. An injected shutdown during Save committed the record but emitted canceled with persisted:false. The server can return from shutdown while workers remain active. Add a bounded drain, preserve actual commit results once persistence starts, and release leases only after workers finish. The pre-commit cancellation decision and transition to persisting also need to be atomic.

**8. [P1] The engine can execute persistent work without owning its store.**  
[hub.go:78](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/engine/hub.go:78), [coordinator.go:213](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:213), [session.go:144](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/session/session.go:144), [session.go:100](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/session/session.go:100)

NewDirStore records acquisition failure instead of returning it. Standalone CLI checks LeaseError, but the engine does not; Load ignores ownership. A second engine can load an existing session, call the provider, and execute tools before failing at Save. If the first owner releases its lease meanwhile, Save retries acquisition and can commit history prepared before ownership was acquired. Require successful acquisition before preparing persistent work. Production callers also never call DirStore.Close; bind leases to drained runtime lifetime.

**9. [P1] Unsaved output disappears immediately after a terminal run.**  
[coordinator.go:263](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:263), [coordinator.go:364](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:364), [coordinator.go:561](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:561)

ExecuteTurn discards the returned generated result and deletes the only in-memory run projection on exit. Later snapshots load durable history alone and carry no terminal outcome or unsaved-content availability. A failed-save reproduction returned an empty snapshot immediately after output had been emitted. Reconnection loses that output while the same process remains alive. Retain the latest terminal projection within an explicit budget and expose its outcome and availability in snapshots.

**10. [P1] Packaging cannot reliably produce the declared supported installations.**  
[package.json:10](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/package.json:10), [package.json:31](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/package.json:31), [main.js:13](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/main.js:13), [main.js:27](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/main.js:27)

Windows/Linux packaging does not build Go first and always bundles excelsior.exe. Binary lookup prefers checkout locations; installed startup derives its workspace from the installation rather than an explicit writable project. ENGINE_ADDR and ENGINE_URL remain independent, so changing the spawned port can leave the renderer elsewhere. Build the engine per target, resolve packaged resources and one endpoint, and require a compatible authenticated handshake. Installed-app smoke tests remain necessary.

**11. [P1] Native renderer trust checks remain broader than the proposal allows.**  
[main.js:62](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/main.js:62), [main.js:76](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/main.js:76)

IPC handlers do not validate the sending frame. Navigation trusts every file URL plus any URL beginning with http://localhost:3000; this also accepts a different port such as 30001. Navigated content retains the preload surface and can request the configured engine's owner token. The requested engine URL check restricts credential destination, not who can request it. Validate exact renderer origins or packaged paths and senderFrame on privileged IPC while preserving context isolation and sandboxing.

**12. [P2] Remote Ctrl+C does not target an acknowledged run or reliably bound confirmation.**  
[client.go:99](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/engine/client.go:99), [client.go:118](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/engine/client.go:118), [client.go:195](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/pkg/engine/client.go:195)

Cancellation sends only sessionId, ignoring run IDs in snapshots. It can target a replacement run if another client starts work before cancellation is handled. The cancel write has no deadline, ignores its error, and precedes installation of the three-second read deadline. Later readEnvelope calls overwrite that deadline with sixty seconds. Track the acknowledged run ID, bound writes and confirmation with one deadline, and distinguish failed send from unconfirmed cancellation.

**13. [P2] Interaction resolution omits kind validation and ordered notifications.**  
[coordinator.go:597](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:597), [coordinator.go:611](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/internal/chat/coordinator.go:611), [engineState.ts:109](C:/Users/huynh/OneDrive/Desktop/projects/Excelsior/apps/electron/lib/engineState.ts:109)

Both reply APIs match IDs but not interaction kind, so a permission reply can consume a question or an ask reply can consume a permission prompt. The runner receives its reply before subscribers receive interaction.done, allowing the next interaction request to overtake the previous resolution. Desktop clears interactions for a session without checking runId/interactionId; an old-resolution replay cleared the latest prompt. Validate kind and all identities, and enqueue resolution before waking execution.

## Proposal coverage

| Stage | Assessment | Remaining acceptance gate |
| --- | --- | --- |
| 1. Extract ownership | Partial | Transport-neutral Coordinator owns runs/interactions, but atomic delivery is broken. Runner construction remains in Hub; standalone CLI still calls Service directly. |
| 2. Unify execution | Partial; acceptance fails | History loads once for prepared execution, corruption protection and reservations remain. Clients ignore outcomes, shutdown misreports commits, and terminal retention/snapshots are missing. |
| 3. Separate desktop state | Files split; behavior incomplete | Client/reducer/hook exist and raw wsRef access is removed. Readiness, scope reset, subscriptions, correlation, decoding, and identity validation remain incomplete. Views retain generic send. |
| 4. Enforce ownership | Partial | Windows and Unix OS-lock implementations exist; Windows cross-process/release tests passed. Engine preparation does not require ownership. Lease closure and acknowledged-run cancellation remain incomplete. |
| 5. Operational work | Mostly pending | Per-session history/Git diff rescans were removed; session.list still invokes Git for branch. Packaging, readiness, IPC trust, shutdown, and descendant-process cleanup remain. |
| 6. Measured optimization | Deferred | No list/stream measurements found. Store I/O remains under the coordinator mutex. Defer optimization until correctness and measurement gates are met. |

Other proposal requirements still pending:

- Authentication has no capability advertisement. TypeScript lacks terminal/snapshot DTOs matching Go; JSON.parse is followed by a cast, not runtime validation. No cross-language fixtures or reducer tests are wired into the desktop package.
- Subscriber queues are bounded by count, not bytes; current-run projections have no byte budget. Provider context checking omits tool-call arguments and checks only initial input. Display truncation does not constrain tool output returned to the provider.
- Shell cancellation uses CommandContext on the immediate shell without explicit descendant cleanup or a pipe-drain bound. Edit reads the whole file before its size check and writes replacements with mode 0644. These roadmap issues remain open.
- The transcript hook-order fix is present: hooks precede the empty-state return. Its mounted empty/populated transition was not exercised here.
- ARCHITECTURE.md still describes earlier ownership/ordering behavior. MOBILE_PLAN.md, FLOWS.md, and docs/flows.md remain unreconciled. CI selects Go 1.23 despite go.mod requiring 1.25.0, omits desktop/Windows checks, and masks govulncheck failure.

## Verification

| Check | Result |
| --- | --- |
| go test ./... | All packages passed except TestOwnerTokenRotation under the restricted Windows sandbox. |
| Isolated TestOwnerTokenRotation outside sandbox | Passed; the earlier failure was environment-specific. |
| go vet ./... | Passed. |
| go build ./... | Passed. |
| Desktop tsc --noEmit --incremental false | Passed. |
| Focused desktop replay | Reproduced missing readiness, cross-workspace state retention, accepted stale run delta, stale resolution clearing a current interaction, and ignored persistence failure. |
| Temporary coordinator regression checks | Failed intended invariants: duplicate event after snapshot, committed record reported canceled at shutdown, and immediate loss of unsaved projection. |
| Temporary remote-client outcome checks | Failed for failed, persistence_failed, and canceled: all treated as successful completion. |
| Race detector | Not run: CGO_ENABLED=0 and no gcc on PATH. |
| Linux/macOS runtime and installed desktop smoke tests | Not run. No live provider execution was needed. |

The normal suite and type checker do not cover the reproduced acceptance failures. Preserve focused regression cases when implementing fixes.

**Recommended sequence:** restore desktop readiness and command/scope handling; repair ordered coordinator delivery and workspace-bound subscriptions; make completion and lease/shutdown behavior authoritative; finish packaging and native trust checks. Re-run the proposal's cross-client, failure, reconnect, ownership, and installed-app acceptance cases before declaring a stage complete.

