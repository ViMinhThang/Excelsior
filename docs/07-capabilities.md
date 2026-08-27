# 07 — Capability Layer (tools + engine-owned permission policy)

## Goal

Turn tools into a **capability layer**: tools receive a `CapabilityContext`
(workspace, settings, permission policy handle) instead of
reach-into-the-harness closures, and **permission decisions move into the
engine** — tools ask "may I?", the engine's policy answers via
`InteractionManager` (spec 05). No tool calls `confirm()` or
`askQuestion()` directly anymore.

## Motivation

Today tools receive a `ToolExecutionContext` stuffed with closures
(`runAssembly.ts`): `confirm`, `askQuestion`, `sendSubAgent`, `emit`, lsp,
backupDir. Tools both *ask* for permission and *emit* their own events —
the tool is coupled to the harness plumbing. Splitting the "request" from the
"decision" makes tools testable in isolation and makes policy replaceable
(auto-approve, plan mode).

## Scope

- `CapabilityContext` type in `@excelsior/engine` (exported via a clean
  surface; tools import `@excelsior/engine/capabilities`, never internals).
- `PermissionPolicy` interface + the two built-in policies (act, plan) with
  existing risk rules (blocked/write-like/safe from
  `tools/system.ts` `classifyCommandRisk`).
- Rewire the 8 built-in tools (`tools/fs.ts`, `system.ts`, `interaction.ts`)
  onto the context.
- Delete the old `ToolExecutionContext` shape and the closure assembly in
  `runAssembly.ts`.

**Non-goals:** sandboxing/process isolation of tools (future work, the seam is
here), changing tool names/schemas (model-visible contract stays).
`askQuestion` is a tool but not a capability — it *is* the policy asking
(spec 05).

## Design

### CapabilityContext

```ts
interface CapabilityContext {
  workspace: Workspace;
  settings: SettingsView;                 // read-only view for the tool
  permission: PermissionPolicy;           // decide before acting
  logger: { notice(message: string): void }; // system-message notices
}
```

- No `emit`, no `confirm`, no `askQuestion`, no LSP, no backups, no subagent
  spawn, no tasks — those are cut or move behind the policy.
- `SettingsView` is a frozen snapshot (or a versioned reader), so tools cannot
  mutate settings.

### PermissionPolicy

```ts
interface PermissionDecision {
  allow: boolean;
  reason: "allowed" | "blocked" | "needs-approval" | "plan-blocked";
}

interface PermissionPolicy {
  decide(act: ToolAction): PermissionDecision;
  confirm(act: ToolAction): Promise<boolean>;  // used when decision = needs-approval
  ask(question: AskQuestionRequest): Promise<AskQuestionResponse>; // policy-owned
}
```

```ts
type ToolAction =
  | { kind: "write-file"; filePath: string; mode: AgentMode }
  | { kind: "edit-file"; filePath: string; mode: AgentMode }
  | { kind: "run-command"; command: string; mode: AgentMode }
  | { kind: "read-file" } | { kind: "list" } | { kind: "search" };
```

- `ActPolicy`: write/edit/run-command → `needs-approval` (routes through
  `InteractionManager`); reads → `allowed`.
- `PlanPolicy`: write/edit/write-like-commands → `plan-blocked` (the existing
  `PLAN_MODE_BLOCKED_MESSAGE`); reads → `allowed`; `ask` → denied with reason.
- The `confirm`/`ask` implementations are the only callers of
  `InteractionManager`, and the only place a tool gets a blocking human
  response. Tools therefore become fully synchronously testable: stub the
  policy.
- Future sandboxing: an engine-internal `sandboxed` policy or a remote
  executor slot in — `ToolAction` is the serialization boundary.

### Tool wiring

`ToolRegistry.toToolSet` (`registries/registries.ts`) stops building per-run
closures; it builds once per engine with a `CapabilityContextFactory` that
snaps the current policy + settings per execution. `runAssembly` shrinks to
nothing: context assembly (spec 04's `buildAiHistory` + system prompt) no
longer fabricates tool closures.

## Steps

1. Add `CapabilityContext`, `ToolAction`, `PermissionPolicy`, `ActPolicy`,
   `PlanPolicy`; unit-test decision tables (port `classifyCommandRisk` cases).
2. Refactor each tool to `(input, cap: CapabilityContext, options)`; update
   `ToolRegistry` to wrap with the policy.
3. Delete `ToolExecutionContext` and the closure-building in `runAssembly`;
   `askQuestion` tool and plan-mode blocking now flow through the policy.
4. Keep tool schemas and descriptions byte-identical (model contract).
5. Update `tools.test.ts`/confirmation tests to stub policies; add a test
   that no tool calls `confirm`/`askQuestion` directly (import guard).

## Acceptance Criteria

- Tools import only `@excelsior/engine/capabilities`; nothing in `tools/`
  imports `harness/`, `run/`, or `InteractionManager`.
- Plan-mode blocking, approval flow, approve-all, and denied-tool behavior are
  identical to today (behavior tests unchanged).
- The tool set is testable with a fake policy — no engine, no sessions, no
  run loop — and a test proves it.
- `npm run check` passes.
