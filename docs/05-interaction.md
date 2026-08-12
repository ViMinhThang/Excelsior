# 05 — Interactions as Store State (confirmations & questions)

## Goal

Move pending confirmations and questions out of in-memory Promise maps
(`ConfirmationCoordinator`/`ConfirmationRouter`) into **store state with
deltas**, so they are single-sourced and visible to every consumer — while
tool execution still blocks on a resolution.

## Motivation

Today a tool call needing approval creates a `ConfirmRequest`, stashes a
resolve function in a `Map`, and awaits. The UI learns about it through a
side-channel field on the snapshot. The Map is invisible to any other part of
the system, and there are two near-identical implementations
(`ConfirmationCoordinator`, `ConfirmationRouter`) plus the `askQuestion`
variant. Interactions are state like any other: store them.

## Scope

- `InteractionState` in `SessionStore` (per session): at most one pending
  confirmation and one pending question.
- `interaction-*` mutations + `interaction` delta (already in spec 01).
- `InteractionManager` replaces `ConfirmationCoordinator`/`ConfirmationRouter`:
  tools still `await` a promise, but the promise is backed by store state.
- `approve-all` remains a single mutation.

**Non-goals:** permission *policy* (spec 07), client-side rendering changes
(spec 08).

## Design

### State

```ts
interface InteractionState {
  confirmation: { callId: string; request: ConfirmRequest; approved: boolean | null } | null;
  question: { callId: string; request: AskQuestionRequest; response: AskQuestionResponse | null } | null;
}
```

Stored inside `SessionState` so it checkpoints with the session; a pending
interaction survives a daemon restart (the tool call does not — the run is
gone — but the UI can show "last unanswered confirmation" instead of losing
it silently; auto-resolve as cancelled on run start).

Mutations:

```ts
| { kind: "interaction-confirm-request"; callId: string; request: ConfirmRequest }
| { kind: "interaction-confirm-respond"; callId: string; approved: boolean }
| { kind: "interaction-confirm-approve-all" }
| { kind: "interaction-confirm-cancel-all" }
| { kind: "interaction-question-request"; callId: string; request: AskQuestionRequest }
| { kind: "interaction-question-respond"; callId: string; response: AskQuestionResponse }
```

### InteractionManager

```ts
class InteractionManager {
  requestConfirmation(request: ConfirmRequest): Promise<boolean>;   // blocks
  requestQuestion(request: AskQuestionRequest): Promise<AskQuestionResponse>; // blocks
  respondToConfirmation(callId: string, approved: boolean): void;
  approveAllConfirmations(): void;
  respondToQuestion(response: AskQuestionResponse): void;
  cancelAll(): void;   // resolves all pending as cancelled; clears state
}
```

Implementation rules:

- The promise resolves when a responder mutation lands; the waiter subscribes
  to `DiffEmitter` for the session scope rather than holding a resolver Map —
  single source of truth, and `DiffEmitter`'s ring buffer makes the pending
  state visible to any new subscriber (spec 08 client).
- Requests are validated: no new confirmation while one is pending (replace,
  with an error delta).
- `cancelAll()` runs on run cancel (wired from spec 04) and on session switch.
- Emitted deltas: `{ kind: "interaction", interaction: InteractionState }` —
  one delta covering both slots, simplest to consume.

### Snapshot

`pendingConfirmation`/`pendingQuestion` in the snapshot now read straight from
`SessionStore.interaction`. No side-channel.

## Steps

1. Add `InteractionState` to `SessionState` + persistence (part of existing
   checkpoint file — bump checkpoint `version` to 3).
2. Add `interaction-*` mutations + `interaction` delta.
3. Reimplement `InteractionManager` over `Mutate`/`DiffEmitter`; delete
   `ConfirmationCoordinator` + `ConfirmationRouter`.
4. Rewire `requestConfirmation`/`askQuestion` in the tool context
   (spec 07's capability context) to the new manager; delete the old wiring.
5. Update `confirmationRouter.test.ts` and the ask-question behavior tests to
   the new manager; keep the client-visible behavior tests unchanged.

## Acceptance Criteria

- Pending state is readable from `SessionStore.interaction` at any moment and
  included in checkpoints; no Promise map or resolver stash exists.
- Tool `confirm()`/`askQuestion()` still block until a response; approve-all,
  cancel-all, and session-switch semantics are identical to today.
- The snapshot's `pendingConfirmation`/`pendingQuestion` derive purely from
  store state.
- `npm run check` passes.
