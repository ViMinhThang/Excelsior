# Excelsior

Excelsior is a local coding agent that runs as a terminal client backed by a
persistent engine daemon. The agent works inside a workspace: it can read,
search, and edit files, run commands, and ask for approval before making
changes.

## Architecture

Excelsior v2 is a three-package core with a thin client on top:

```text
packages/
|- protocol/   # wire contract: envelopes, commands, requests, deltas, snapshots (zero dependencies)
|- engine/     # daemon: sessions, runs, turn execution (DeepSeek), tools, permissions, persistence
|- client/     # client-side host interface: agent client, read model, presentation

apps/
`- tui/        # terminal client (planned)
```

- The engine runs as a separate process and speaks a versioned JSON-lines
  protocol over stdio. Clients connect through `@excelsior/client` and never
  import engine internals.
- Every user turn is executed and persisted as a run; committed turns are
  checkpointed so history survives engine restarts.
- All events (session state, streamed text, tool activity, confirmation
  requests, committed blocks) are delivered to clients as scoped deltas.

## Requirements

- Node.js and npm
- Git
- Ripgrep (`rg`) on `PATH` for fast file search

## Setup

```powershell
npm install
```

## Configuration

The engine needs a DeepSeek API key:

```powershell
$env:DEEPSEEK_API_KEY="your-deepseek-api-key"
```

The key can also be saved at runtime with the `/settings` command or the
`settings-save` command.

Environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | Yes | API key for DeepSeek model calls |
| `EXCELSIOR_ENGINE_DATA_DIR` | No | Where sessions and settings are stored (default `~/excelsior/data`) |
| `EXCELSIOR_ENGINE_HEARTBEAT_MS` | No | Heartbeat interval for the engine process (default 5000) |

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev:engine` | Run the engine daemon standalone (stdio) |
| `npm test` | Run all tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check source |
| `npm run build` | Compile and sync package dists |
| `npm run check:boundaries` | Enforce package import rules and ban legacy references |
| `npm run check` | Typecheck, unused checks, tests, build, and boundaries |

## Engine commands

| Command | Description |
| --- | --- |
| `/help` | List commands |
| `/new` | Create a new session |
| `/sessions` | Open the session picker |
| `/clear` | Clear the active session |
| `/reset` | Delete all sessions and start fresh |
| `/settings` | Open settings |
| `/mode [plan\|act]` | Switch agent mode |
| `/accept-edits` | Approve all pending edits |

## License

ISC
