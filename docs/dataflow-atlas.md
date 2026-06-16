# Excelsior Dataflow Atlas

This document maps the **complete dataflow of every key operation** in the system.
Each flow shows every module, event type, and data transformation involved,
with file paths and function names for quick navigation.

---

## 1. User Send Flow (Full Lifecycle)

```
User types message in TUI/Desktop
```

### 1.1 Client -> Host Boundary

```
TUI ChatScreen / Desktop renderer
  │  useChatInteractionController.ts
  │  calls: agentHostClient.send(content, options)
  │
  ▼
@excelsior/client  src/hostActions.ts
  AgentHostClient.send()
  │  calls: this.host.dispatch({ type: "send", content, options })
  │
  ▼
@excelsior/agent-host  src/host/HarnessAgentHost.ts
  HarnessAgentHost.dispatch({ type: "send", ... })
  │  case "send": this.harness.send({ content, mode, ...options })
  │
  ▼
@excelsior/agent-harness  src/harness.ts
  HarnessStore.send()
```

### 1.2 HarnessStore.send() -- Entry

File: `packages/agent-harness/src/harness.ts` (line 134)

```
HarnessStore.send(input)
│
├── 1. Check active run → steering or fresh run
│     ActiveRunManager.isActive()
│       ├── if active: acceptSteering() → emitUserMessage() → return
│       └── if inactive: proceed to new run
│
├── 2. If sessionId provided → switchSession()
│     storage.loadSessionFile() → eventStore.replaceEvents()
│     → emit SESSION_CHANGED event
│
├── 3. Ensure session exists
│     ensureSession(content) → creates session if none current
│     storage.createSession() → SessionManager
│
├── 4. Generate run/turn IDs
│     runId = `run_${randomUUID()}`
│     turnId = `turn_${randomUUID()}`
│
├── 5. Begin active run
│     ActiveRunManager.begin({ runId, turnId, sessionId })
│     → creates AbortController, stores handle
│
├── 6. Build run assembly
│     buildRunAssembly({...})  (src/context/runAssembly.ts)
│     │
│     │   ├── loadProjectInstructions(workspaceRoot)
│     │   │   reads PROJECT_INSTRUCTIONS env or <root>/EXCELSIOR_INSTRUCTIONS.md
│     │   │
│     │   ├── createEmitter(runId, sessionId, turnId)
│     │   │   EventBus.createEmitter() → bound HarnessEventEmitter
│     │   │   (src/EventBus.ts line 26)
│     │   │
│     │   ├── buildRunContext({...})  (src/context/contextBuilder.ts)
│     │   │   │
│     │   │   │   ├── priorMessages: projectionCache aiHistory snapshot
│     │   │   │   ├── userContent appended
│     │   │   │   ├── modeMessage: system message with mode + timestamp
│     │   │   │   ├── reflectionMemoryContext (if enabled)
│     │   │   │   └── systemPrompt: buildSystemPrompt() with skills, instructions
│     │   │   │
│     │   │   └── returns { messages: AgentMessage[], systemPrompt }
│     │   │
│     │   └── toolContext: wrapped execution context with
│     │         workspaceRoot, mode, confirm(), askQuestion(),
│     │         sendSubAgent(), emit, settings, lsp, backupDir
│     │
│     └── returns { runContext, toolContext, emit }
│
├── 7. Emit user message event (if not silent)
│     EventBus.emitUserMessage({ runId, turnId, sessionId, content, displayContent })
│     │
│     │   ├── MESSAGE_START event: { message }
│     │   ├── MESSAGE_END event:   { message }
│     │   │
│     │   │   Each emit → EventBus.emit() (src/EventBus.ts line 73)
│     │   │     → makeHarnessEvent() with causationId, correlationId
│     │   │     → eventStore.recordEvent() (persistence)
│     │   │     → sessionManager.sessions updated (timestamp)
│     │   │     → extensions.emit() (hook system)
│     │   │     → notify() (state snapshot + listeners)
│     │   │
│     │   └── Events are persisted to <data>/sessions/<ws>/<session>.jsonl
│     │
│     └── Events arrive at EventStore -> triggers projection update
│
├── 8. Run agent loop
│     runAgentLoop({ messages, systemPrompt, settings, providers, tools,
│                    toolContext, signal, emit, getSteeringMessages })
│     (src/run/RunController.ts)
│     │
│     │   ├── emit TURN_START event
│     │   │
│     │   ├── Loop: while (true)
│     │   │   │
│     │   │   ├── runModelStep()  (src/run/runModelStep.ts)
│     │   │   │   │
│     │   │   │   │   ├── RunStepRecorder created
│     │   │   │   │   │   (src/run/RunStepRecorder.ts)
│     │   │   │   │   │
│     │   │   │   │   ├── provider.get().createModel(settings)
│     │   │   │   │   │   → LanguageModel instance via ai-sdk
│     │   │   │   │   │
│     │   │   │   │   ├── streamText({ model, system, messages, tools,
│     │   │   │   │   │                stopWhen: stepCountIs(1),
│     │   │   │   │   │                abortSignal, maxRetries: 3 })
│     │   │   │   │   │
│     │   │   │   │   └── For each part in result.fullStream:
│     │   │   │   │         RunStepRecorder.accept(part) dispatches by type:
│     │   │   │   │
│     │   │   │   │         ┌─────────────────────────┬──────────────────────────────┐
│     │   │   │   │         │  SDK part type          │  Recorder action              │
│     │   │   │   │         ├─────────────────────────┼──────────────────────────────┤
│     │   │   │   │         │  text-start             │  writer.startMessage()        │
│     │   │   │   │         │  text-delta             │  writer.updateMessage()       │
│     │   │   │   │         │  text-end               │  writer.endMessage()          │
│     │   │   │   │         │  reasoning-*            │  (skipped, no handler)        │
│     │   │   │   │         │  tool-input-start       │  writer.startTool()           │
│     │   │   │   │         │  tool-input-delta       │  writer.updateToolInput()     │
│     │   │   │   │         │  tool-call              │  writer.endToolInput()         │
│     │   │   │   │         │                         │  → emits TOOL_EXECUTION_START  │
│     │   │   │   │         │  tool-result            │  writer.completeTool()         │
│     │   │   │   │         │                         │  → emits TOOL_EXECUTION_END   │
│     │   │   │   │         │  tool-error             │  same with isError=true        │
│     │   │   │   │         │  tool-output-denied     │  same with "Tool output denied"│
│     │   │   │   │         │  abort                  │  recorder.cancel()             │
│     │   │   │   │         │  error                  │  recorder.fail()               │
│     │   │   │   │         └─────────────────────────┴──────────────────────────────┘
│     │   │   │   │
│     │   │   │   │   ├── RunEventWriter (src/context/RunEventWriter.ts)
│     │   │   │   │   │   Translates SDK parts into harness events:
│     │   │   │   │   │   │
│     │   │   │   │   │   │   startMessage(id) → MESSAGE_START event
│     │   │   │   │   │   │   updateMessage(id, delta) → MESSAGE_UPDATE event
│     │   │   │   │   │   │   endMessage() → MESSAGE_END event
│     │   │   │   │   │   │   startTool(id, name) → begins tool input tracking
│     │   │   │   │   │   │   updateToolInput(id, delta) → TOOL_EXECUTION_UPDATE event
│     │   │   │   │   │   │   endToolInput(id, input) → TOOL_EXECUTION_START event
│     │   │   │   │   │   │   completeTool(id, args, result, isError) → TOOL_EXECUTION_END
│     │   │   │   │   │   │   finalizeIncompleteTools(msg) → TOOL_EXECUTION_END (error)
│     │   │   │   │   │   │   emitNotice(text) → assistant message with notice
│     │   │   │   │   │   |
│     │   │   │   │   │   └── Each event emitted via the bound HarnessEventEmitter
│     │   │   │   │   │       → EventBus.emit() → EventStore.recordEvent() → notify()
│     │   │   │   │   │
│     │   │   │   │   └── Returns { status, hasToolCalls, messages[] }
│     │   │   │   │
│     │   │   │   ├── Append step messages to activeMessages
│     │   │   │   │
│     │   │   │   ├── If step.status !== "completed" → break (error/cancel)
│     │   │   │   │
│     │   │   │   ├── Drain steering messages → append as user messages
│     │   │   │   │
│     │   │   │   ├── If !step.hasToolCalls → break (model finished)
│     │   │   │   │
│     │   │   │   └── If stepLimit reached → break with notice
│     │   │   │
│     │   │   └── emit TURN_END event { cancelled }
│     │   │
│     │   └── return
│     │
│   ┌──┴──────────────────────────────────────────────────┐
│   │  Key: Each EventBus.emit() call triggers:            │
│   │  1. makeHarnessEvent() → typed event object         │
│   │  2. EventStore.recordEvent() → persists, updates seq│
│   │  3. Session session.updatedAt refreshed              │
│   │  4. ExtensionRegistry.emit() → hook callbacks        │
│   │  5. notify() → updateSnapshot() → listener()         │
│   └──────────────────────────────────────────────────────┘
│
├── 9. Finally block
│     ActiveRunManager.finish(handle)
│       → clears current run, removes from finalized set
│     sessionManager.refreshSessions()
│     notify()
│     reflectionRun.maybeStartAutoReflection() (if not silent)
│
└── 10. State snapshot delivered to client
        flushNotify() → updateSnapshot() → for each listener() → client render
```

---

## 2. Tool Execution Flow (Inside runModelStep)

When the SDK calls a tool, here's what happens:

```
AI SDK streamText result
  │
  ▼
ToolRegistry.toToolSet(toolContext)  (src/registries.ts line 45)
  │  Wraps each HarnessTool in ai.tool() wrapper
  │  │
  │  └── For each HarnessTool:
  │        tool({
  │          description: harnessTool.description,
  │          inputSchema: harnessTool.inputSchema,
  │          execute: async (input, options) => {
  │            inputSchema.parse(input)                // zod validation
  │            harnessTool.execute(input, ctx, options) // actual execution
  │            if (result.isError) throw Error(result.content)
  │            return result.content
  │          },
  │        })
  │
  ▼
SDK calls execute() → tool call is emitted
  │
  ├── File tools (write/edit):
  │     src/tools/fs.ts
  │     ├── createWriteTool() → write/create/overwrite files
  │     │     ├── mode=plan → PLAN_MODE_BLOCKED_MESSAGE
  │     │     ├── authorizeWrite() → ctx.confirm() for approval
  │     │     ├── recordTurnBackup() → backup to <data>/backups/
  │     │     ├── fs.mkdir + fs.writeFile
  │     │     ├── buildUnifiedFileDiff() → old/new diff
  │     │     └── appendLspDiagnostics() → language-server feedback
  │     │
  │     └── createEditTool() → replace exact text block
  │           ├── authorizeWrite() → ctx.confirm()
  │           ├── recordTurnBackup()
  │           ├── content.split(oldText).length - 1 occurrence check
  │           ├── fs.writeFile with replaced content
  │           └── buildUnifiedFileDiff() + lsp diagnostics
  │
  ├── View/List tools:
  │     src/tools/fs.ts
  │     ├── createViewTool() → read file with optional line range
  │     │     └── appendLspDiagnostics() for supported files
  │     │
  │     ├── createLsTool() → list directory
  │     ├── createGlobTool() → glob matching (recursive listing + regex)
  │     └── createRipgrepTool() → spawns rg process
  │
  ├── runCommand tool:
  │     src/tools/system.ts
  │     ├── classifyCommandRisk() → blocked / write-like / safe
  │     ├── mode=plan + write-like → PLAN_MODE_BLOCKED_MESSAGE
  │     ├── write-like → ctx.confirm() for approval
  │     └── runProcess() → spawn child, stream output via TOOL_EXECUTION_UPDATE
  │           30s timeout, 100KB output cap
  │
  ├── askQuestion tool:
  │     src/tools/interaction.ts
  │     └── ctx.askQuestion() → blocks until user responds
  │
  ├── spawnSubAgent tool:
  │     src/tools/subAgent.ts → src/subagentProcess.ts
  │     │
  │     ├── Find child runner script
  │     │   resolveChildRunner() → tries:
  │     │     1. <workspace>/packages/agent-harness/dist/subagentChildRunner.js
  │     │     2. <workspace>/packages/agent-harness/src/subagentChildRunner.ts
  │     │     3. <built>/subagentChildRunner.js
  │     │     4. <source>/subagentChildRunner.ts via tsx
  │     │
  │     ├── Spawn child process with stdin JSON payload
  │     │   { workspaceRoot, role, prompt, settings, projectInstructions, skillsList }
  │     │
  │     ├── Child process (subagentChildRunner.ts):
  │     │   │
  │     │   │   ├── Creates read-only toolset (ls, view, glob, ripgrep)
  │     │   │   ├── Builds child system prompt with role constraint
  │     │   │   ├── Runs runAgentLoop with plan mode + 200 step limit
  │     │   │   ├── Emits structured JSON output lines to stdout:
  │     │   │   │     text_delta, tool_start, tool_update, tool_end, final, error
  │     │   │   └── Writes final output as { type: "final", content }
  │     │   │
  │     │   └── Back in parent (subagentProcess.ts):
  │     │         ├── Parse each JSON line from child stdout
  │     │         ├── Forward as SUB_AGENT_EVENT events with parentToolCallId
  │     │         └── Debounce progress flushes (250ms / 2048 chars)
  │     │
  │     └── Returns final aggregated content to model
  │
  └── updateTasks tool:
        src/tools/tasks.ts
        └── ctx.emit(TASKS_UPDATED, { tasks })
```

---

## 3. Projection Flow (Events -> Transcript Blocks)

File: `packages/agent-harness/src/projector/`

```
Any event stored in EventStore
  │
  ▼
harness.updateSnapshot() (src/harness.ts line 469)
  │
  ├── projectionCache.project(events)  (src/projection.ts)
  │   └── Projector (src/projector/Projector.ts)
  │       │
  │       ├── Can apply incrementally (by tracking appliedCount + lastEventId)
  │       │   If can't → full reset + replay all events
  │       │
  │       └── For each new event, dispatched to handler:
  │             │
  │             ├── MessageHandler (handles MESSAGE_START/UPDATE/END)
  │             │   │  src/projector/MessageHandler.ts
  │             │   │
  │             │   ├── MESSAGE_START:
  │             │   │   Creates new block in projection
  │             │   │   User messages → type "user" block
  │             │   │   Assistant messages → type "assistant" block (initially empty)
  │             │   │
  │             │   ├── MESSAGE_UPDATE:
  │             │   │   Appends delta to assistant block content
  │             │   │   (streaming text update)
  │             │   │
  │             │   └── MESSAGE_END:
  │             │       Finalizes block content
  │             │       User messages: modelContent stored separately
  │             │       → AiHistory.appendMessage()
  │             │
  │             ├── ToolHandler (handles TOOL_EXECUTION_START/UPDATE/END)
  │             │   │  src/projector/ToolHandler.ts
  │             │   │
  │             │   ├── TOOL_EXECUTION_START:
  │             │   │   Creates type "tool-call" block with toolName, args, status=pending
  │             │   │
  │             │   ├── TOOL_EXECUTION_UPDATE:
  │             │   │   Appends delta to tool result content (streaming output)
  │             │   │
  │             │   └── TOOL_EXECUTION_END:
  │             │       Finalizes tool result, sets status=completed/error
  │             │       → AiHistory.appendToolCall() + append assistant + tool messages
  │             │
  │             ├── SubAgentHandler (handles SUB_AGENT_EVENT)
  │             │   │  src/projector/SubAgentHandler.ts
  │             │   │
  │             │   │  Manages live state of sub-agent projection:
  │             │   │  - text_delta → appends to latestLine/fullOutput
  │             │   │  - tool_start/tool_update/tool_end → nested tool call tracking
  │             │   │  - final → sets status=done, records final output
  │             │   │  - error → sets status=error
  │             │   │
  │             │   └── Creates type "sub-agent" block with ProjectedSubAgent
  │             │
  │             ├── LifecycleHandler (handles TURN_START/END, HISTORY_COMPACTED,
  │             │                      SESSION_CHANGED, CONFIRMATION_REQUESTED/ANSWERED,
  │             │                      QUESTION_REQUESTED/ANSWERED)
  │             │   │  src/projector/LifecycleHandler.ts
  │             │   │
  │             │   ├── TURN_START: finalizes previous turn if open, starts new turned
  │             │   ├── TURN_END: marks turn as completed/interrupted/failed
  │             │   ├── HISTORY_COMPACTED: inserts compaction-boundary block
  │             │   │                     → AiHistory resets (starts fresh after compact)
  │             │   └── Others: metadata only, no visible blocks
  │             │
  │             └── TaskHandler (handles TASKS_UPDATED)
  │                   src/projector/TaskHandler.ts
  │                   └── Replaces task list with new ProjectedTask[]
  │
  └── Returns { turns: ProjectedTurn[], tasks: ProjectedTask[],
                aiHistory: AgentMessage[] }
```

### Projection Internal Architecture

```
TranscriptProjection  (src/projector/TranscriptProjection.ts)
  │
  ├── TurnStore: finalized turn states
  │   Manages completed/interrupted ProjectedTurn instances
  │   Handles turn completion, interruption, task lists
  │
  ├── LiveDrafts: active in-memory streaming blocks
  │   DraftUserBlock, DraftAssistantBlock, DraftToolBlock, DraftSubAgentBlock
  │   Each extends DraftBlock with type-specific append/update logic
  │
  └── AiHistory: model-facing message history
      Separate from UI projection → tracks assistant messages
      and tool call/result pairs for the model context
      Resets on compaction boundary
```

---

## 4. Event Bus Internals

File: `packages/agent-harness/src/EventBus.ts`

```
EventBus.emit(runId, type, data, options?)
  │
  ├── 1. Check run finalization
  │     If run is finalized → create event but don't store (already terminated)
  │
  ├── 2. Resolve session
  │     From options.sessionId or current session
  │     If no session → Error
  │
  ├── 3. Create event
  │     makeHarnessEvent({
  │       workspaceId, sessionId, runId, turnId,
  │       sequence: ++eventStore.sequence,
  │       type, data,
  │       causationId: options.causationId ?? lastEventId,
  │       correlationId: options.correlationId ?? runId,
  │     })
  │
  ├── 4. Store event
  │     eventStore.recordEvent(event, session, isActive)
  │       ├── If isActive session → push to in-memory events[]
  │       ├── Update sequence and lastEventId
  │       └── storage.appendEvent() → persist to <session>.jsonl
  │
  ├── 5. Update session metadata
  │     sessionManager.sessions updated with new updatedAt
  │
  ├── 6. Notify extensions
  │     ExtensionRegistry.emit(event) → all registered hooks
  │
  └── 7. Notify listeners
        notify() → setTimeout(flushNotify, 0)
          → updateSnapshot() → projectionCache.project() + state combiner
          → fire all subscribed listeners
```

### Event Data Types

File: `packages/agent-harness/src/events.ts`

```
HarnessEvent<T> structure:
  { id, version: 1, workspaceId, sessionId, runId, turnId?,
    sequence, type, timestamp, data, parentEventId?,
    relatedToolCallId?, causationId?, correlationId? }

Event types and their data payloads:

  TURN_START:                     {}
  TURN_END:                       { cancelled: boolean }
  MESSAGE_START:                  { message: HarnessMessage }
  MESSAGE_UPDATE:                 { messageId, role: "assistant", delta }
  MESSAGE_END:                    { message: HarnessMessage }
  TOOL_EXECUTION_START:          { toolCallId, toolName, toolArgs }
  TOOL_EXECUTION_UPDATE:         { toolCallId, toolName, delta, target? }
  TOOL_EXECUTION_END:            { toolCallId, toolName, toolArgs, result, isError }
  SUB_AGENT_EVENT:               { parentToolCallId, event: TextDelta | ToolStart | ... }
  CONFIRMATION_REQUESTED:        { request: ConfirmRequest }
  CONFIRMATION_ANSWERED:         { response: ConfirmResponse }
  QUESTION_REQUESTED:            { request: AskQuestionRequest }
  QUESTION_ANSWERED:             { response: AskQuestionResponse }
  HISTORY_COMPACTED:             { summary, compactedEventCount, triggerMode }
  SESSION_CHANGED:               { sessionId, reason }
  TASKS_UPDATED:                 { tasks: ProjectedTask[] }
  ERROR:                         { message }
```

---

## 5. Tool Display Pipeline (Event Content -> UI Model)

```
Raw tool result content
  │
  ▼
createToolDisplay()  (src/core/conversationPresentation/createToolDisplay.ts)
  │
  ├── parseToolArgs(toolArgs) → Record<string, unknown> | null
  ├── normalizeToolText(content) → normalized string
  ├── previewContent(normalizedContent) → first 3 lines, max 120 chars each
  ├── toneFor(status, content) → "pending" | "success" | "error" | "muted"
  │
  ├── createCommand(name, args, argsStr, filePath)
  │   ├── Registered config.formatCommand() if exists
  │   │   write("file.ts")  /  read("file.ts")  /  Run(cmd)  /  Test(cmd)
  │   └── Default: toolName({arg: val})
  │
  ├── createSummaryLine(name, args, content) → one-line status
  │
  ├── Policy detection:
  │   ├── isFileActionTool → write/writeFile/edit/editFile
  │   ├── isWriteTool → write/writeFile
  │   └── isReadOnlyBrowseTool → view/ls/glob
  │
  ├── Pending file change preview (for confirmation UI):
  │   parsePendingFileChangePreview({ toolName, filePath, diff })
  │
  └── Registered formatter OR default formatting

Registered Tool Display Configs:

  Tool          | formatCommand example     | formatter
  ──────────────┼───────────────────────────┼────────────────────────────
  view          | read(file.ts)             | detail/resultPreview
  ls            | Listfiles(dir)            | detail/resultPreview
  glob          | glob(pattern)             | summary (no formatter)
  writeFile     | write(file.ts)            | Write label + diff preview
  write         | write(file.ts)            | Write label + diff preview
  editFile      | edit(file.ts)             | Edit label + diff preview
  edit          | edit(file.ts)             | Edit label + diff preview
  runCommand    | Run(cmd) / Test(cmd)      | Run command label + risk
  spawnSubAgent | subagent role             | (no formatter)
  gitDiff       | (default)                 | Git diff label + preview
```

### File Change Preview Pipeline

```
Tool result with diff content
  │
  ▼
parseFileChangePreview({ toolName, filePath, content })
  (src/core/conversationPresentation/fileChangePreviewParser.ts)
  │
  ├── Find "--- " line → start of diff
  ├── Parse hunks (@@ -old +new @@) → track old/new line numbers
  ├── Build oldRows[] / newRows[] → each with marker, text, tone, lineNumber
  │   " " → context, "-" → removed, "+" → added
  └── Returns FileChangePreview { filePath, action, oldRows, newRows,
                                   oldLines, newLines, added, removed, hunkIndices }

buildFileChangePreviewFrame(input)  (src/core/conversationPresentation/fileChangePreviewFrame.ts)
  │
  ├── getInlineRowsAndMap(oldRows, newRows) → interleaved inline diff
  ├── Viewport capping: pending=12, collapsed=10, focused=all
  ├── Scrollbar calculation for pending state
  └── Returns rendered frame with inlineRows + scroll metadata

createToolDisplayPresentation({ display, status })
  (src/core/conversationPresentation/toolDisplayPresentation.ts)
  │
  ├── Build body: progressStats → summaryLine → detail → preview → completion
  ├── Determine expandable & hasFileChangePreview
  └── Return { expandable, hasFileChangePreview, diffStats, body }
```

---

## 6. Confirmation & Question Flow

```
Write/edit/runCommand tool called
  │
  ├── In plan mode: returns PLAN_MODE_BLOCKED_MESSAGE (isError=true)
  │
  └── In act mode:
        │
        ├── authorizeWrite() / ctx.confirm()
        │   │  (src/tools/fs.ts line 160)
        │   │
        │   └── HarnessStore.requestConfirmation() (src/harness.ts line 418)
        │       │
        │       ├── Create callId + ConfirmRequest
        │       ├── ConfirmationRouter.addConfirmation(request, resolve)
        │       │   (src/ConfirmationRouter.ts)
        │       │
        │       ├── Emit CONFIRMATION_REQUESTED event
        │       ├── Notify → client gets pendingConfirmation in snapshot
        │       │
        │       └── Wait for:
        │             ├── Client: respondToConfirmation(callId, approved)
        │             │   → ConfirmationRouter.resolveConfirmation()
        │             │   → Emit CONFIRMATION_ANSWERED
        │             │
        │             └── Client: approveAllConfirmations()
        │                 → ConfirmationRouter.approveAllConfirmations()
        │
        └── ctx.askQuestion()  → Same pattern via QUESTION_REQUESTED/ANSWERED
```

---

## 7. Cancellation Flow

```
User presses Escape twice
  │
  ▼
handleDoubleEscapeCancel()  (src/core/turnCancelGesture.ts)
  │
  ├── First escape → arms the state, firstEscapeAt = now
  └── Second escape within 1500ms →
        │
        ▼
      HarnessAgentHost.dispatch({ type: "cancel" })
        │
        ▼
      HarnessStore.cancel() (src/harness.ts line 216)
        │
        ├── ActiveRunManager.abort()
        │   → AbortController.abort() → signal fires everywhere
        │   → runModelStep catches AbortError → recorder.cancel()
        │   → runAgentLoop breaks with endedEarly=true
        │
        ├── ConfirmationRouter.cancelAll() → resolves pending confirmations
        │
        ├── finalizeCancelled(run, events, emit, reason)
        │   → findIncompleteEvents() (src/history/runFinalizer.ts)
        │   → emitRunFinalization() → emits MESSAGE_END/TOOL_EXECUTION_END
        │     for any unclosed events to produce valid transcript state
        │
        ├── ActiveRunManager.clear(handle)
        │
        ├── sessionManager.refreshSessions()
        └── notify()
```

---

## 8. Persistence Layer

File: `packages/agent-harness/src/storage.ts`

```
Data directory (default: <project>/data/harness)
  │
  ├── settings.json               → AppSettings (flat JSON)
  ├── workspaces.json             → Workspace[] (flat JSON)
  │
  └── sessions/
        └── <workspaceId>/
              └── <sessionId>.jsonl  → JSONL format:
                  {"kind":"session","session":{...}}
                  {"kind":"event","event":{...}}
                  {"kind":"event","event":{...}}
                  ...

  memory/
    └── <workspaceId>/
          ├── state.json  → ReflectionMemoryState
          ├── memory.md   → Accumulated reflection text
          └── sessions/   → Per-session summaries

  backups/
    └── <workspaceId>/
          └── <sessionId>/
                └── <turnId>/
                      └── <relativeFilePath>  → Pre-edit file copies
```

---

## 9. Skill System Flow

```
On startup:
  SkillCatalog.discover(workspaceRoot, { reader })
  (src/skills/SkillCatalog.ts)
  │
  ├── Looks for docs/agents/ directory
  ├── Scans for .md files with YAML frontmatter:
  │     ---
  │     name: skill_diagnose
  │     description: Disciplined diagnosis loop...
  │     ---
  │     <skill body content>
  │
  └── Returns SkillCatalog with parsed entries

registerSkills(catalog, tools, commands, sendContent)
  (src/skills/register.ts)
  │
  ├── For each skill entry:
  │   ├── Register tool named <entry.toolName> (z.object({}) input)
  │   └── Register command named <entry.commandName> (category: skills)
  │
  └── SkillsList compiled → injected into system prompt as "Available Agent Skills"
```

---

## 10. Reflection System Flow

File: `packages/agent-harness/src/reflection/`

```
Auto-triggered after each turn (if enabled):
  ReflectionRunManager.maybeStartAutoReflection()
  (src/reflection/ReflectionRunManager.ts)
  │
  ├── shouldStartAutoReflection() checks:
  │   ├── autoReflectionEnabled && !currently running
  │   ├── Last reflection > 24h ago
  │   └── >= 5 sessions updated since last reflection
  │
  └── startReflection(trigger):
        │
        ├── Build reflection prompt
        │   (src/reflection/prompt.ts)
        │   │
        │   ├── Collects all session events since last reflection
        │   ├── Summarizes to keep within char limits
        │   └── Returns analysis prompt for AI
        │
        ├── Create reflection-specific tool registry
        │   (src/reflection/tools.ts)
        │   read-only tools + writeMemory tool (writes to memory.md)
        │
        ├── Run agent loop with plan mode
        │
        └── On completion:
              ├── Store summary in memory.md
              ├── Update ReflectionMemoryState
              └── Emit events via EventBus

Memory context injected into subsequent model runs:
  reflectionRun.buildMemoryContext(enabled)
    → If enabled and memory exists → "Reflection memory context: <summary>"
    → If disabled → "Reflection memory context: off. Do not use stored reflection memory for this turn."
```

---

## 11. State Snapshot Composition

File: `packages/agent-harness/src/harness.ts` method `updateSnapshot()` (line 469)

```
projectHarnessState({  (src/projection.ts)
  events: eventStore.events,                // canonical event list
  readModel: projectionCache.project(...),  // projected turns + tasks + aiHistory
  isLoading: activeRun.isActive(),           // live state
  sessions: sessionManager.sessions,         // session list
  currentSessionId: sessionManager.currentSessionId,
  workspace,                                  // workspace info
  llm: { providerName, modelName },           // from provider registry
  mode,                                       // plan/act
  pendingConfirmation: confirmRouter.pendingConfirmation,  // side-channel
  pendingQuestion: confirmRouter.pendingQuestion,          // side-channel
  reflection: reflectionRun.snapshot(),       // reflection status
})
  │
  ▼
AgentClientState  {  (src/core/clientState.ts)
  turns: ProjectedTurn[]
  tasks: ProjectedTask[]
  isLoading: boolean
  sessions: Session[]
  currentSessionId: string | null
  workspace: Workspace
  llm: AgentLlmInfo
  mode: AgentMode
  pendingConfirmation: ConfirmRequest | null
  pendingQuestion: AskQuestionRequest | null
  reflection: ReflectionClientState
}
```

---

## 12. Module Dependency Graph (Detailed)

```
src/core/
  agent.ts              → AgentMode, AgentMessage types
  clientState.ts        → AgentClientState (the big snapshot shape)
  session.ts            → Session, Workspace types
  commands.ts           → CommandDefinition, CommandResult, SendOptions
  confirmation.ts       → ConfirmRequest, ConfirmResponse, DiffAction
  question.ts            → AskQuestionRequest, AskQuestionResponse, AskQuestionOption
  settings.ts           → AppSettings, agentToolLoopSteps normalization
  turnCancelGesture.ts  → Double-escape cancel state machine
  projection.ts         → ProjectedTurn, ProjectedBlock, ProjectedTask, SubAgentViewModel
  conversationPresentation/  → Tool display model, file change preview, display registry
    types.ts              → ToolDisplay, ToolDisplayConfig, FileChangePreview, etc.
    createToolDisplay.ts  → Main factory: args → command → summaryLine → display
    toolDisplayRegistry.ts → Registry mapping tool names → display configs
    fileToolDisplays.ts   → Write/Edit display formatters
    readToolDisplays.ts   → View/Ls/Glob display formatters
    miscToolDisplays.ts   → Subagent/GitDiff display formatters
    runCommandDisplay.ts  → RunCommand formatter + risk classification
    toolDisplayPresentation.ts → Body selection + expandable/diffStats logic
    fileChangePreviewParser.ts → Diff text → structured FileChangePreview
    fileChangePreviewFrame.ts  → Preview → inline diff rows + viewport
    toolArgs.ts           → JSON arg parsing + display summarization
    toolText.ts           → Content normalization + preview
    toolProgress.ts       → Progress stats, write estimation

src/client/
  hostContract.ts       → AgentHost interface, AgentHostIntent union, dispatch types
  hostActions.ts        → AgentHostClient wrapper (convenience methods over dispatch)

src/agent-harness/
  harness.ts            → HarnessStore: main state machine + harness entry point
  types.ts              → AgentHarness interface, ToolExecutionContext, HarnessConfig, etc.
  events.ts             → All event type constants + event data type map + makeHarnessEvent
  EventBus.ts           → Central event emitter, routing, persistence trigger
  EventStore.ts         → In-memory event list + sequence tracking + persist delegation
  storage.ts            → FileHarnessStorage: JSONL files, settings, workspaces, backups
  SessionManager.ts     → Session list management, create/switch/delete/rename
  SettingsStore.ts      → Wraps storage settings with in-memory cache
  ConfirmationRouter.ts → Pending confirmations/questions + resolve routing
  registries.ts         → ProviderRegistry, ToolRegistry, CommandRegistry, ExtensionRegistry
  projection.ts         → ProjectionCache + projectHarnessState (snapshot builder)
  provider.ts           → createDeepSeekProvider (default LLM provider)
  commands.ts           → createBuiltInCommands (help, clear, session, mode, etc.)
  inspector.ts          → copy/replay/format events for debugging
  github.ts             → GitHubReviewService (PR fetch + comment)
  bootstrap/
    HarnessBootstrap.ts   → Factory for all harness subsystems
  context/
    index.ts              → Re-exports all context builders
    runAssembly.ts        → buildRunAssembly: wires run context + tool context + emitter
    contextBuilder.ts     → buildRunContext: messages + system prompt assembly
    systemPrompt.ts       → buildSystemPrompt: OS info, mode rules, skills, instructions
    projectInstructions.ts → loads EXCELSIOR_INSTRUCTIONS.md
    modelMessages.ts      → toModelMessages: AgentMessage → AI SDK messages
    RunEventWriter.ts     → SDK stream parts → harness events
    compaction.ts         → buildCompactionSummary + buildCompactionNotice
  history/
    revert.ts             → revertLastCompletedTurn (event manipulation)
    runFinalizer.ts       → findIncompleteEvents + emitRunFinalization (on cancel)
    turnBackups.ts        → recordTurnBackup + restoreTurnBackups
  lsp/
    LspManager.ts         → LspManager, TypeScriptLspAdapter, LspClient interface
  projector/
    Projector.ts          → Event replay → projection handlers → transcript
    TranscriptProjection.ts → TurnStore + LiveDrafts + AiHistory
    TurnStore.ts          → Finalized turn storage
    LiveDrafts.ts         → In-flight streaming block drafts
    AiHistory.ts          → Model-facing message history
    MessageHandler.ts     → MESSAGE_START/UPDATE/END → blocks + ai history
    ToolHandler.ts        → TOOL_EXECUTION_START/UPDATE/END → tool call blocks
    SubAgentHandler.ts    → SUB_AGENT_EVENT → sub-agent block projection
    LifecycleHandler.ts   → TURN_START/END, compaction, confirmations
    TaskHandler.ts        → TASKS_UPDATED → task list
    types.ts              → ProjectionHandler interface
    utils.ts              → toAgentMessage converter
  reflection/
    ReflectionMemoryStore.ts   → Durable memory state + file I/O
    ReflectionRunManager.ts    → Auto/manual reflection orchestration
    prompt.ts                  → Reflection prompt builder
    tools.ts                   → Read-only + writeMemory tools for reflection
  run/
    RunController.ts           → runAgentLoop: step orchestration
    runModelStep.ts            → Single model invokation via SDK streamText
    RunStepRecorder.ts         → SDK part dispatcher + result builder
    ActiveRunManager.ts        → Active run lifecycle, steering, cancellation
  skills/
    SkillCatalog.ts            → Discover skills from docs/agents/
    SkillsManager.ts           → Skill loading and management
    register.ts                → Register skills as tools + commands
  tools/
    index.ts                   → createBuiltInTools: all 12 tool factory calls
    fs.ts                      → ls, view, glob, ripgrep, write, edit (6 tools)
    system.ts                  → runCommand tool + runProcess helper
    interaction.ts             → askQuestion tool
    subAgent.ts                → spawnSubAgent tool
    tasks.ts                   → updateTasks tool
  subagentProcess.ts           → Child process spawning + output parsing
  subagentChildRunner.ts       → Child agent process (read-only agent loop)

src/agent-host/
  host/
    HarnessAgentHost.ts        → AgentHost implementation wrapping AgentHarness
    defaultHost.ts             → Singleton getDefaultAgentHost() / resetDefaultAgentHost()
```

---

## 13. File-by-File Entry Points for Common Tasks

| Task | Starting Point |
|------|---------------|
| Add a new built-in tool | `packages/agent-harness/src/tools/` + register in `index.ts` |
| Add a new command | `packages/agent-harness/src/commands.ts` |
| Add a new event type | `packages/agent-harness/src/events.ts` (HarnessEventDataMap) |
| Add a new projection handler | `packages/agent-harness/src/projector/` + register in `Projector.ts` |
| Add a new tool display config | `packages/core/src/conversationPresentation/` + register in `toolDisplayRegistry.ts` |
| Change the system prompt | `packages/agent-harness/src/context/systemPrompt.ts` |
| Change how state flows to client | `packages/agent-harness/src/harness.ts` `updateSnapshot()` |
| Change event persistence format | `packages/agent-harness/src/storage.ts` |
| Change cancellation behavior | `packages/agent-harness/src/run/ActiveRunManager.ts` |
| Add provider (OpenAI, Anthropic, etc.) | `packages/agent-harness/src/provider.ts` + register in bootstrap |
| Add extension hook | `packages/agent-harness/src/registries.ts` ExtensionRegistry |
| Change the TUI chat screen | `apps/tui/src/screens/ChatScreen.tsx` |
| Change the TUI block rendering | `apps/tui/src/components/chat/ChatHistory.tsx` |
| Change diff display in TUI | `apps/tui/src/components/chat/ToolMessage.tsx` |
| Add LSP language support | `packages/agent-harness/src/lsp/LspManager.ts` |

---

## 14. Run Model Step — SDK Part Lifecycle

ASCII sequence for a single model step with one tool call:

```
User message
  │
  ▼
streamText() starts
  │
  ├── [text-start]      → RunEventWriter.startMessage("msg_abc_1")
  │                         emit(MESSAGE_START, { message: {...} })
  │
  ├── [text-delta*]     → RunEventWriter.updateMessage("msg_abc_1", delta)
  │                         emit(MESSAGE_UPDATE, { messageId, delta })
  │
  ├── [text-end]        → RunEventWriter.endMessage("msg_abc_1")
  │                         emit(MESSAGE_END, { message: {...} })
  │
  ├── [tool-input-start] → RunEventWriter.startTool("call_1", "view")
  │
  ├── [tool-input-delta*] → RunEventWriter.updateToolInput("call_1", delta)
  │
  ├── [tool-call]       → RunEventWriter.endToolInput("call_1", parsedInput)
  │                         emit(TOOL_EXECUTION_START, { toolCallId, toolName, toolArgs })
  │
  ├── [tool-result]     → RunEventWriter.completeTool("call_1", toolArgs, result, false)
  │                         emit(TOOL_EXECUTION_END, { toolCallId, toolName, toolArgs, result, isError: false })
  │
  └── [tool-output-denied?] → CompleteTool with "Tool output denied" + isError true

(* = zero or more occurrences)
```

---

## 15. Confirmation/Question Side-Channel Lifecycle

```
Tool needs approval
  │
  ├── HarnessStore.requestConfirmation() creates Promise
  │   → Adds to ConfirmationRouter's pending Map
  │   → Emits CONFIRMATION_REQUESTED event
  │   → Notifies → snapshot.pendingConfirmation is set
  │   → Client renders confirmation UI
  │
  └── User approves/denies
      │
      ├── Client calls respondToConfirmation(callId, approved)
      │   → ConfirmationRouter.resolveConfirmation() → resolves Promise
      │   → Emits CONFIRMATION_ANSWERED event
      │   → Notifies → snapshot.pendingConfirmation becomes null
      │   → Tool execution continues with approved/rejected
      │
      └── OR Client calls approveAllConfirmations()
          → ConfirmationRouter.approveAllConfirmations()
          → Resolves all pending confirmations with approved=true
```

---

*This atlas maps the complete dataflow of Excelsior as of the 2026 codebase. Every module boundary, event type, projection handler, and persistence path is documented above. Use it to trace the path of any operation from user input to pixels on screen.*
