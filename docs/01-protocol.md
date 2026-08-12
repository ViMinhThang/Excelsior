# 01 — Wire Protocol (`@excelsior/protocol`)

## Goal

Create the `@excelsior/protocol` package as the **single shared type surface**
of v2 — all value types (absorbing the old `@excelsior/core`) plus the typed
wire contract between the TUI and the engine: commands (in), deltas (out),
sync requests (resume), and `Transport` implementations (in-process + stdio).
Purely additive: no behavior change, no deletion.

## Motivation

Today the client boundary is a function-call interface (`AgentHost.dispatch`)
plus regex tests (`src/__tests__/architecture.test.ts`), and shared types are
spread across `core` and `client`. There is no serializable contract, so the
engine can never leave the client process, and the "boundary" is not enforced
by types. This spec turns the boundary into a versioned protocol and folds
every shared type into one package.

## Scope

- New workspace package `packages/protocol`.
- Absorb `@excelsior/core` value types (Session, Workspace, AppSettings,
  CommandDefinition, ConfirmRequest/Response, AskQuestionRequest/Response,
  AgentMode, SendOptions, transcript block types) — `core` is deleted in
  spec 10; `protocol` is the only shared type package.
- Define `AgentCommand`s (serializable intents), `AgentDelta`s (the only thing
  the engine pushes), `AgentRequest`s, `CommandAck`.
- `Transport` interface + `InProcessTransport` and `StdioTransport`.
- Envelope with versioning and sequence numbers.

**Non-goals:** engine implementation, client read models, presentation models
(tool display, diff preview — they move to `client` in spec 08), deleting
`@excelsior/client`/`@excelsior/agent-host` (still in use until specs 08–09).

## Design

### Envelope

Every message on the wire is one JSON value wrapped in an envelope:

```ts
interface Envelope {
  v: 2;                        // protocol version
  seq: number;                 // per-transport monotonic sequence
  type: "command" | "delta" | "request" | "response" | "heartbeat";
  payload: unknown;            // discriminated by type
}
```

Messages are newline-delimited JSON (one envelope per line) on stdio
(`stdin`/`stdout` of the engine process); the in-process transport skips
serialization but must still round-trip through the same types.

### Commands (client → engine)

Trimmed mirror of today's `AgentHostIntent`, renamed to wire language:

```ts
export type AgentCommand =
  | { cmd: "send"; content: string; mode?: AgentMode; options?: SendOptions }
  | { cmd: "cancel" }
  | { cmd: "execute-command"; input: string }
  | { cmd: "session-create"; title?: string }
  | { cmd: "session-switch"; sessionId: string }
  | { cmd: "session-delete"; sessionId: string }
  | { cmd: "session-rename"; sessionId: string; title: string }
  | { cmd: "session-delete-all" }
  | { cmd: "mode-set"; mode: AgentMode }
  | { cmd: "mode-toggle" }
  | { cmd: "settings-save"; patch: Partial<AppSettings> }
  | { cmd: "confirm-respond"; callId: string; approved: boolean }
  | { cmd: "confirm-approve-all" }
  | { cmd: "question-respond"; response: AskQuestionResponse }
  | { cmd: "messages-clear" }
  | { cmd: "sync"; scope: DeltaScope; cursor: number | null };
```

Every command may produce a `CommandAck`:

```ts
export type CommandAck =
  | { ok: true; result?: { kind: "command-result"; result: CommandResult } }
  | { ok: true; result?: { kind: "session"; session: Session } }
  | { ok: true; result?: { kind: "mode"; mode: AgentMode } }
  | { ok: true; result?: { kind: "busy" } }      // send rejected: run active
  | { ok: false; error: string };
```

### Deltas (engine → client)

The only thing the engine ever pushes. Every delta identifies a **scope** and
a monotonic **revision** so the client can order, dedupe, and resume:

```ts
export type DeltaScope =
  | { kind: "session"; sessionId: string }     // transcript + interactions
  | { kind: "run"; sessionId: string }         // in-flight turn deltas
  | { kind: "meta" };                          // sessions list, mode, workspace, llm

export type AgentDelta =
  | { scope: DeltaScope; rev: number; delta: { kind: "session-state"; session: SessionState } } // sync reply
  | { scope: DeltaScope; rev: number; delta: { kind: "block-committed"; block: TranscriptBlock } }
  | { scope: DeltaScope; rev: number; delta: { kind: "run-text-delta"; turnId: string; content: string } }
  | { scope: DeltaScope; rev: number; delta: { kind: "run-tool"; tool: RunToolState } }
  | { scope: DeltaScope; rev: number; delta: { kind: "run-status"; status: RunStatus } }
  | { scope: DeltaScope; rev: number; delta: { kind: "interaction"; interaction: InteractionState } }
  | { scope: DeltaScope; rev: number; delta: { kind: "meta-changed" } }
  | { scope: DeltaScope; rev: number; delta: { kind: "error"; message: string } };
```

No tasks, no sub-agent, no job deltas — those features are cut.

### Requests (client → engine, reply expected)

```ts
export type AgentRequest =
  | { req: "catalog" }                          // → CommandDefinition[] + AppSettings
  | { req: "sync"; scope: DeltaScope; cursor: number | null }; // → SessionState snapshot delta

export type AgentResponse =
  | { req: "catalog"; ok: true; data: { commands: CommandDefinition[]; settings: AppSettings } }
  | { req: "sync"; ok: true; scope: DeltaScope; rev: number; snapshot: unknown }
  | { ok: false; error: string };
```

The catalog is static (commands/settings); after `settings-save` the client
refetches it — no catalog delta needed.

### Transport

```ts
export interface Transport {
  send(message: Envelope): void;
  onMessage(listener: (message: Envelope) => void): () => void;
  close(): void;
}

export function createInProcessTransport(): { a: Transport; b: Transport };
export function createStdioTransport(opts?: { stdin?: NodeJS.ReadableStream; stdout?: NodeJS.WritableStream }): Transport;
```

- `InProcessTransport` must round-trip JSON (deep-clone) to prove
  serializability.
- `StdioTransport` splits lines, parses envelopes, and rejects malformed lines
  with an error envelope.
- `{ type: "heartbeat" }` envelope every 5 s (used by spec 09 for liveness).

### Shared value types (absorbed from `core`)

- `Session`, `Workspace`, `AppSettings`, `AgentMode`, `SendOptions`,
  `CommandDefinition`, `CommandResult`
- `ConfirmRequest`/`ConfirmResponse`, `AskQuestionRequest`/`AskQuestionResponse`
- `TranscriptBlock`, `SessionState` (spec 02), `RunStatus`/`RunToolState`
  (spec 04), `InteractionState` (spec 05)

No engine, harness, or client types leak into `protocol`.

## Steps

1. Create `packages/protocol` (package.json, tsconfig mirroring `core`).
2. Move `core` value types into `protocol`; update `core` to re-export from
   `protocol` (temporary shim so the build stays green until spec 10).
3. Add `envelope.ts`, `commands.ts`, `deltas.ts`, `requests.ts`, `transport.ts`.
4. Add `@excelsior/protocol` to root `tsconfig` and workspace.
5. Unit tests: envelope round-trip, transport ordering/sequence, malformed
   input, value-type serializability (deep-equal through JSON).

## Acceptance Criteria

- `@excelsior/protocol` exports every shared type + the wire contract + both
  transports; zero runtime dependencies (pure types + `node:` stdlib).
- `npm run check` passes; existing tests untouched (via the `core` shim).
- Protocol types have no import of `agent-harness`, `agent-host`, or `client`.
