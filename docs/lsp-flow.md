# LSP Flow

This document explains how Excelsior collects language-server diagnostics and appends them to file tool results.

## Big Picture

LSP support is harness-owned. Clients do not start language servers, track diagnostics, or render a separate diagnostics panel. Instead, the harness lazily asks a language adapter for diagnostics whenever the agent reads or changes a supported source file, then appends the result as ordinary tool result text.

The important behaviors are:

- the harness creates one `LspManager` per workspace
- the current implementation registers a TypeScript adapter
- diagnostics are collected only when file tools touch a supported file
- supported TypeScript files are `.ts` and `.tsx`
- diagnostics are appended to `view`, `write`, and `edit` tool output
- startup failures, timeouts, and cancellation become non-fatal notices
- clients receive diagnostics through normal transcript projection

The high-level path is:

```text
HarnessStore is constructed
  -> LspManager.create(workspace.rootPath)
  -> runAssembly puts lsp on ToolExecutionContext
  -> view/write/edit touches a workspace file
  -> appendLspDiagnostics calls lsp.syncTouchedFile(...)
  -> LspManager selects a supporting adapter
  -> TypeScriptLspAdapter starts/reuses typescript-language-server
  -> file content is opened or changed over LSP
  -> diagnostics are formatted and appended to the tool result
```

## Main Components

The core implementation lives in:

```text
packages/agent-harness/src/lsp/LspManager.ts
```

The integration points are:

- `packages/agent-harness/src/harness.ts`: constructs and disposes the workspace `LspManager`
- `packages/agent-harness/src/context/runAssembly.ts`: attaches the LSP client to `ToolExecutionContext`
- `packages/agent-harness/src/tools/fs.ts`: calls LSP after `view`, `write`, and `edit`
- `packages/agent-harness/src/types.ts`: includes optional `lsp` on the tool execution context

The tests are:

- `packages/agent-harness/__tests__/lspManager.test.ts`
- `packages/agent-harness/__tests__/tools.test.ts`

## Harness Lifecycle

`HarnessStore` owns the LSP manager for the selected workspace.

During construction:

```ts
this.lsp = LspManager.create(this.workspace.rootPath);
```

`LspManager.create()` currently returns a manager with one adapter:

```ts
new LspManager([new TypeScriptLspAdapter(workspaceRoot)])
```

The manager is passed into the run assembly:

```text
HarnessStore.send(...)
  -> buildRunAssembly({ ..., lsp: this.lsp })
  -> toolContext.lsp = input.lsp
```

When the harness is disposed, it disposes the LSP manager:

```ts
this.lsp.dispose();
```

That gives adapters a chance to shut down language-server processes.

## Tool Integration

LSP diagnostics are attached by `appendLspDiagnostics()` in `packages/agent-harness/src/tools/fs.ts`.

The file tools call it after they have the current file content:

- `view`: reads the file and appends diagnostics after the numbered file output
- `write`: writes the new file content and appends diagnostics after the success message and diff
- `edit`: writes the edited content and appends diagnostics after the success message and diff

The flow for a `view` call is:

```text
view({ filePath })
  -> resolveWorkspacePath(filePath)
  -> read file content
  -> render numbered lines
  -> appendLspDiagnostics(output, ctx, filePath, content, fullPath)
  -> return text(...)
```

The flow for `write` and `edit` is similar, except they run confirmation and backup logic before writing. Diagnostics are collected from the new content after the write succeeds.

`appendLspDiagnostics()` skips LSP when:

- `ctx.lsp` is absent
- the resolved path is outside the workspace
- no adapter supports the file path
- the adapter returns no diagnostics and no notice

The outside-workspace check matters because `write` and `edit` can be approved for paths outside the workspace. Those writes do not get LSP diagnostics.

## Adapter Selection

`LspManager.syncTouchedFile()` is the public tool-facing API.

```ts
export interface LspClient {
  syncTouchedFile(input: {
    filePath: string;
    content: string;
    abortSignal?: AbortSignal;
  }): Promise<string | null>;
  dispose(): void;
}
```

The manager picks the first adapter whose `supports(filePath)` returns true.

If no adapter supports the file, it returns `null`. This means unsupported files stay quiet in tool output.

The TypeScript adapter supports:

```text
.ts
.tsx
```

The adapter receives the relative tool path, the current full file content, and the run abort signal.

## TypeScript Server Startup

`TypeScriptLspAdapter` starts the server lazily. It does not spawn anything when the harness starts. The first supported file touch calls `ensureServer()`.

Startup creates a `TypeScriptServerSession`, then calls `start()`.

The server command is resolved in this order:

1. `<workspaceRoot>/node_modules/.bin/typescript-language-server`
2. `<process.cwd()>/node_modules/.bin/typescript-language-server`
3. `typescript-language-server` from `PATH`

On Windows the command name uses `.cmd`.

The process is spawned as:

```text
typescript-language-server --stdio
```

with `cwd` set to the workspace root.

The harness communicates with the server using:

- `vscode-jsonrpc/node`
- `vscode-languageserver-protocol`
- stdio streams from the child process

## LSP Initialization

After spawning the process, `TypeScriptServerSession.start()`:

- creates a JSON-RPC message connection over stdout/stdin
- registers a `textDocument/publishDiagnostics` notification handler
- starts listening
- sends `initialize`
- sends `initialized`

The initialize params include:

- current process id
- workspace `rootUri`
- publish diagnostics capability
- workspace configuration capability
- workspace folders capability
- one workspace folder for the selected workspace root

Initialization is wrapped in a timeout:

```ts
const DIAGNOSTIC_WAIT_MS = 1_500;
```

If initialization takes longer than 1.5 seconds, startup fails for that request and the tool result receives a non-fatal notice.

## File Sync

`TypeScriptServerSession.syncFile(filePath, content)` sends the current file content to the language server.

The session tracks:

```ts
private readonly versions = new Map<string, number>();
private readonly diagnosticVersions = new Map<string, number>();
private readonly diagnostics = new Map<string, LspDiagnostic[]>();
private readonly opened = new Set<string>();
```

For each sync:

1. Resolve the relative file path against the workspace root.
2. Convert it to a file URI.
3. Increment the document version for that URI.
4. Remember the current diagnostic version for that URI.
5. Send `textDocument/didOpen` if this URI has not been opened before.
6. Send `textDocument/didChange` if it has already been opened.
7. Wait for fresh diagnostics, or fall back to the last known diagnostics after the timeout.

The language id is:

- `typescript` for `.ts`
- `typescriptreact` for `.tsx`

Diagnostics are considered fresh when the publish-diagnostics handler increments that URI's diagnostic version after the sync began.

## Diagnostic Wait

After `didOpen` or `didChange`, the session waits up to 1.5 seconds for diagnostics.

`waitForDiagnostics()` checks every 50 ms:

```text
if diagnostic version changed:
  return latest diagnostics
if timeout expires:
  return whatever diagnostics are currently stored
```

This keeps file tools responsive. A slow language server may produce no appended output on the first touch, or may return the last known diagnostics if those are all that are available before timeout.

## Output Format

`LspManager.syncTouchedFile()` returns a formatted string only when there are diagnostics or a notice.

Diagnostics are formatted as:

```text
LSP diagnostics for <filePath>:
- <severity> <source> <line>:<column> <message>
```

Example:

```text
LSP diagnostics for src/demo.ts:
- error typescript 2:7 Cannot find name 'missing'.
```

If the language server is unavailable, the result is:

```text
LSP diagnostics for <filePath>:
Unavailable: <reason>
```

Line and column numbers are converted from LSP's zero-based positions to one-based positions before formatting.

Severity mapping:

- `DiagnosticSeverity.Warning` -> `warning`
- `DiagnosticSeverity.Information` -> `information`
- `DiagnosticSeverity.Hint` -> `hint`
- missing or error severity -> `error`

## Cancellation And Failure

The run abort signal is passed from `ToolExecutionContext` into `syncTouchedFile()`.

The TypeScript adapter wraps both server startup and file sync with `withAbort()`. If the run is cancelled before or during diagnostics, the adapter returns:

```text
LSP diagnostics for <filePath>:
Unavailable: LSP diagnostics cancelled.
```

Failures are intentionally non-fatal. `TypeScriptLspAdapter.syncFile()` catches errors and returns:

```ts
{ diagnostics: [], notice: `Unavailable: ${message}` }
```

This means a broken or missing language server does not fail the original file tool. The agent still sees the file output, write result, or edit result, plus a notice if the adapter supported the file.

Startup failures are not cached as permanent. If server startup fails, `ensureServer()` clears the cached server instance and disposes the failed session, so a later supported file touch can try again.

## Disposal

`LspManager.dispose()` calls `dispose()` on every adapter.

`TypeScriptLspAdapter.dispose()` disposes its cached `TypeScriptServerSession`, if one exists.

`TypeScriptServerSession.dispose()` best-effort disposes the JSON-RPC connection and kills the child process.

Harness disposal calls LSP disposal after cancelling active work:

```text
HarnessStore.dispose()
  -> cancelReflection()
  -> cancel()
  -> lsp.dispose()
```

## Current Limits

The current implementation is diagnostics-only.

It does not expose:

- completions
- hover
- go-to-definition
- references
- code actions
- workspace-wide problem lists
- client-side diagnostics state

The adapter API is intentionally small, so adding another language today means implementing `LspLanguageAdapter.supports()`, `syncFile()`, and `dispose()`, then registering it in `LspManager.create()`.

## Important Boundaries

LSP is advisory feedback attached to file tool results. It is not part of canonical event projection, not a separate client protocol, and not required for tools to succeed.

This keeps clients simple: TUI and desktop render the normal tool result text they already receive. The harness remains responsible for process management, path checks, cancellation, timeouts, and formatting.
