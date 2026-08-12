# 10 — Decommission Legacy Machinery + Protocol Tests

## Goal

Delete everything the new architecture supersedes — harness events, the
projector, the JSONL log, the old `@excelsior/core`, `@excelsior/agent-host`,
`@excelsior/agent-harness`, all cut features (reflection, LSP, GitHub, skills,
subagents, tasks, compaction, revert, themes), and the regex-based
architecture tests — and replace the enforcement with **protocol round-trip
and boundary tests** that run against the real engine over the real
transport. Refresh `CONTEXT.md`, `README.md`, and this docs folder into the
v2 story.

## Motivation

Every previous spec says "delete in spec 10". This spec finishes the job so
the repository reflects one architecture, not two. The regex tests
(`src/__tests__/architecture.test.ts`) die because the boundary they policed
is now enforced by the type-checked protocol and the process boundary itself.

## Scope

### Deletions

| Removed | Replaced by |
|---|---|
| `packages/agent-harness` (whole package) | `packages/engine` (functionality reimplemented in specs 02–05, 07, 09) |
| `packages/agent-host` | stdio transport (spec 09) |
| `packages/core` (whole package; absorbed in spec 01) | `packages/protocol` + presentation models in `client` (spec 08) |
| `src/events.ts`, `EventBus`, `EventStore`, `MessageComposer`, repositories (`repository/`) | `Mutate`/`DiffEmitter` (spec 03) |
| `src/projection/` (Projector, handlers, LiveDrafts, TurnStore, AiHistory, TranscriptProjection) | `SessionStore` + `RunStore` + `buildAiHistory` (specs 02/04) |
| `src/reflection/`, `src/lsp/`, `src/skills/`, `src/subagent/`, `src/inspector/`, `src/history/` (runFinalizer, turnBackups, revert), `src/integrations/github.ts`, tools `subAgent.ts`/`tasks.ts`, `context/compaction.ts` | cut — never ported |
| JSONL session files (never migrated — v2 data dir starts empty, spec 00) | checkpoint JSON (spec 02) |
| `src/__tests__/architecture.test.ts` and `src/` root tests dir | protocol/boundary tests below |
| Old flow docs (all `docs/*.md` before this v2 set) | this spec set |

Also: root `package.json` scripts `test:runtime`, `test:projection`,
`test:tools`, `test:arch` re-pointed at the new packages; `tsconfig` project
references updated; `EXCELSIOR_HARNESS_DATA_DIR` fully renamed
(`EXCELSIOR_ENGINE_DATA_DIR`) with a deprecation log if the old var is seen;
deps removed: `@octokit/rest`, `react-test-renderer` if unused, theme deps.

### New tests

1. **Protocol round-trip** (`packages/protocol/__tests__`): every command,
   delta, and request type round-trips through JSON with `v: 2` envelope and
   survives a serialize/parse identity check (deep equal).
2. **Transport fidelity** (`packages/protocol/__tests__`): in-process vs
   stdio transports deliver identical message sequences; malformed lines
   produce error envelopes; sequence numbers are monotonic.
3. **Engine integration over transport** (`packages/engine/__tests__/e2e`):
   spawn `entrypoint.ts` (or drive `createEngine` over `InProcessTransport`
   for speed) and assert the full user journey — send → run-text-deltas →
   tool-call → confirmation delta → respond → committed blocks → checkpoint
   file on disk → restart → same blocks. Plus: send-while-active returns the
   `busy` ack.
4. **Boundary tests (new shape):** import-graph checks that run as a script
   (`scripts/check-boundaries.mjs`) verifying:
   - `apps/tui` imports only `@excelsior/client`, `@excelsior/protocol`.
   - `client` imports only `protocol`.
   - `engine` imports only `protocol` (+ the AI SDK and `node:` builtins).
   - `protocol` imports nothing (zero runtime deps).
   This is a *report* tool for humans, not the enforcement mechanism — the
   package exports are the enforcement.

### Docs refresh

- `CONTEXT.md`: rewrite Domain Vocabulary + Architecture Notes to v2 terms
  (engine, protocol, store, deltas; remove harness vocabulary).
- `README.md`: update structure section (3 packages), env vars, dev scripts,
  command list (help, clear, reset, settings, mode, session, accept-edits).
- This spec set becomes the canonical docs; delete any old flow docs that
  survive.

## Steps

1. Confirm all functionality ports are complete (specs 01–05, 07–09
   acceptance).
2. Delete the legacy packages/modules listed above; fix all dangling imports
   (none should exist if the prior specs are truly complete — this is the
   test).
3. Add protocol/transport/e2e tests; add `check-boundaries` script + wire
   into `npm run check`.
4. Delete `src/__tests__/architecture.test.ts`; update package scripts;
   remove unused deps.
5. Rewrite `CONTEXT.md`/`README.md`; sweep docs for stale references.

## Acceptance Criteria

- `npm run check` passes with zero references to `agent-harness`,
  `agent-host`, `core`, harness events, projector, JSONL, or any cut feature
  (reflection, lsp, github, skills, subagent, tasks, compaction, revert,
  theme).
- `git grep -i "agent-harness|agent-host|jsonl|projector|EventBus|reflection|lsp|github"` finds nothing in `packages/`, `apps/`, `src/` (docs may reference history only).
- e2e test proves crash-recovery of committed turns and the full
  send→confirm→commit journey over a real transport.
- The TUI runs the full shape: app → `@excelsior/client` → stdio → engine
  process.
