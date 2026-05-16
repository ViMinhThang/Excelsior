# @excelsior/run-runtime

Small lifecycle framework for cancellable workflows that emit ordered events.

## Boundary

This package owns generic run mechanics only: event envelopes, sequencing,
causation/correlation ids, snapshots, subscriptions, cancellation, execution
orchestration, and persistence callbacks.

It must not depend on Excelsior product concepts such as agents, chat messages,
tools, sessions, JSONL storage, Plan/Act mode, GitHub, model SDKs, React, or Ink.

## EventfulRun

`EventfulRun<TEvents>` is a typed event source. Each emitted event is frozen and
uses the stable envelope:

```ts
{
  id,
  runId,
  sequence,
  type,
  version,
  causationId,
  correlationId,
  timestamp,
  data,
  parentEventId?,
  relatedToolCallId?,
}
```

Events are sequenced in emit order. `causationId` points at the previous event
unless explicitly overridden. `correlationId` defaults to the run id and can be
provided by callers that link parent/child work.

For deterministic tests, callers can inject `createRunId`, `createEventId`, and
`now`.

## Cancellation

`cancel(reason?)` aborts the run signal and blocks later non-terminal events.
Event types listed in `terminalEventTypes` may still be emitted after
cancellation so adapters can record final status events.

Parent abort signals propagate into child runs and preserve the parent abort
reason.

## RunOrchestrator

`RunOrchestrator.start(run, config)` executes caller-provided work and returns a
`RunHandle`:

```ts
{
  cancel(reason?),
  done,
  completion,
}
```

`completion` always resolves with structured lifecycle status:

- `completed` when execution returns and the run was not cancelled.
- `cancelled` when the run was cancelled, a parent signal aborted, or execution
  throws an abort-classified error.
- `failed` when execution throws a non-abort error.

`done` is kept for compatibility and resolves with recorded events. It preserves
the previous abort-error behavior by rejecting when execution throws an
abort-classified error.

## Persistence

Persistence is adapter-provided through `persist.write`. Writes are FIFO and do
not overlap, so durable storage observes the same order as emitted events.

`persist.filter` decides which events are included in the returned event list
and written to persistence. `persist.onError` fires once after the first write
failure; later events still attempt to persist. Completion waits for pending
persistence writes and listener cleanup before settling.
