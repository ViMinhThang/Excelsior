# `/review` Command — Implementation Plan

## Overview

A slash command that performs AI-powered code review on GitHub Pull Requests targeting the current working branch. The user interacts through a dedicated TUI screen.

**Core architecture:**

- Main agent = in-process `ToolLoopAgent` (full Excelsior harness)
- Sub-agents = in-process `ToolLoopAgent` instances (same harness, role-specific system prompt)
- No subprocesses, no headless CLI, no temp files
- Sub-agents stream output to TUI in real-time
- Observations share the same `observation` table in SQLite
- Sub-agents persist until user runs `/reset` (removes all observation rows)

---

## Navigation Model

| Action     | Overview                                     | Detail (drill-in)                                          |
| ---------- | -------------------------------------------- | ---------------------------------------------------------- |
| **Ctrl+O** | Select **previous** sub-agent (wraps around) | Switch to **previous** sub-agent's detail                  |
| **Ctrl+P** | Select **next** sub-agent (wraps around)     | Switch to **next** sub-agent's detail                      |
| **Enter**  | Drill into **selected** sub-agent            | (already in detail)                                        |
| **Ctrl+M** | Return focus to main agent output            | Return to overview                                         |
| **ESC**    | —                                            | Back to overview                                           |
| **c**      | Back to chat                                 | Back to chat                                               |
| **↑/↓**    | Scroll active section                        | Scroll output (manual when done, auto-scroll when running) |

**Key design choices:**

- Only sub-agents have drill-in (Enter). Main agent does NOT have drill-in — its output is always visible in the top section of overview.
- Ctrl+M always snaps back to main agent section in overview.
- In detail mode: Ctrl+O/P cycle through sub-agent detail views. Ctrl+M or ESC returns to overview.

---

## TUI Screen Designs

### Mode: `browser` — PR list

```
┌──────────────────────────────────────────────────────────┐
│ Excelsior — Code Review                         base: main│
├──────────────────────────────────────────────────────────┤
│  PRs targeting main:                                     │
│                                                          │
│  ▶ #42  feat(auth)              @huynh    1h ago         │
│    #45  fix(upload)             @dev      3h ago         │
│    #48  docs(readme)            @huynh    1d ago         │
│    #50  chore(deps)             @bot      2d ago         │
│                                                          │
│                                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ ↑↓ select  Enter view diff  r refresh  c back to chat    │
└──────────────────────────────────────────────────────────┘
```

### Mode: `review` — Overview

```
┌──────────────────────────────────────────────────────────┐
│ Excelsior — Review PR #42 feat(auth)    Ctrl+O/P  c chat │
├──────────────────────────────────────────────────────────┤
│  ═══ Main Agent ▓▓▓ (selected) ════════════════════════ │
│                                                          │
│  I'll analyze the auth.ts changes. First, let me spawn    │
│  a Bug Hunter for the SQL injection in auth.ts line 42.   │
│  Then I need a Security Auditor for the jsonwebtoken dep. │
│                                                          │
│                                                          │
│                                                          │
│                                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Sub-agents (Ctrl+O/P to select [▶], Enter to drill in)  │
│                                                          │
│    Bug Hunter      [● running]  auth.ts:42 SQL injection  │
│    Security Aud    [● running]  CVE-2024-3210 in jsonw... │
│  ▶ Code Stylist    [✓ done]     No style issues found     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Ctrl+O prev  Ctrl+P next  Enter drill  Ctrl+M main  c    │
└──────────────────────────────────────────────────────────┘
```

**Notes on overview:**

- Top section: main agent's full streaming output (always visible, scrollable with ↑↓ when selected)
- Bottom section: sub-agent rows. Each row = role + status indicator + latest output line
- `▶` indicates selected sub-agent (highlighted row)
- `▓▓▓` indicator shows which section (main / sub-agent list) is focused
- Ctrl+O/P cycle selection through sub-agents (not main — main has Ctrl+M)
- ↑↓ scrolls the currently focused section

### Mode: `review` — Detail (drill-in)

```
┌──────────────────────────────────────────────────────────┐
│ Bug Hunter — PR #42 feat(auth)        Ctrl+O/P  ESC  c  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ═══ Bug Hunter [● running] ════════════════════════════ │
│                                                          │
│  I'm analyzing auth.ts for potential bugs...              │
│                                                          │
│  src/auth.ts:                                            │
│  ├── Line 42: SQL injection — HIGH                       │
│  │   Template literal interpolates user input into SQL    │
│  │   Fix: Use `?` placeholders with db.prepare()         │
│  │                                                       │
│  ├── Line 67: Unhandled rejection — MEDIUM               │
│  │   async handler without try/catch                      │
│  │   Fix: Wrap in try/catch                               │
│  │                                                       │
│  Analysis complete. 2 issues found.                      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Ctrl+O prev  Ctrl+P next  Ctrl+M main  ESC overview  c   │
└──────────────────────────────────────────────────────────┘
```

**Notes on detail:**

- Full-screen view of one sub-agent's complete output
- If sub-agent is running: auto-scrolls to bottom as new text arrives
- If sub-agent is done: manual scroll (↑↓)
- Ctrl+O/P: switch to prev/next sub-agent's detail view
- ESC or Ctrl+M: back to overview

### Mode: `results` — After main agent finishes

```
┌──────────────────────────────────────────────────────────┐
│ Results — PR #42 feat(auth)                    [c chat]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  🔴 Security     2 CRITICAL   1 HIGH                      │
│  🟠 Bugs         0 CRITICAL   3 HIGH    2 MEDIUM          │
│  🔵 Style        1 MEDIUM     4 LOW                       │
│                                                          │
│  ── CRITICAL ───────────────────────────────────────────│
│  🔴 auth.ts:42 · SQL injection in query string            │
│     Fix: Use db.prepare() with `?` placeholders           │
│  🔴 config.ts:88 · Hardcoded API key in source            │
│     Fix: Move to process.env.DEEPSEEK_API_KEY             │
│                                                          │
│  ── HIGH ───────────────────────────────────────────────│
│  🟠 auth.ts:67 · Unhandled promise rejection              │
│     Fix: Add try-catch around db operations               │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ p post PR comment  d view diff  c chat                    │
└──────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
/review
    │
    ├── 1. ReviewScreen mounts
    │       usePullRequests() → gh pr list --base $(git branch --show-current) --json ...
    │       Store PRs in ReviewContext
    │
    ├── 2. User selects PR (Enter)
    │       usePRDiff() → gh pr diff <number> (reads diff text)
    │       Store diff in ReviewContext
    │
    ├── 3. User presses Enter again → startReview()
    │       useReviewOrchestrator.startReview(diff)
    │       │
    │       ├── Creates main ToolLoopAgent (in-process, full Excelsior harness)
    │       │   - Streams output → MainAgentPane (top section, auto-scroll)
    │       │   - System prompt: review orchestrator
    │       │
    │       ├── Main agent decides to spawn specialists
    │       │   - Calls spawnSubAgent({ role, instruction }) tool
    │       │   - Each call → creates a new ToolLoopAgent (in-process)
    │       │   - Sub-agent added to SubAgentState[...] → TUI row appears
    │       │   - Sub-agent streams output → latestLine updates row in real-time
    │       │   - fullOutput accumulated in background for detail view
    │       │
    │       ├── User can at any time:
    │       │   - Ctrl+O/P to select sub-agents
    │       │   - Enter to drill-in → see full output
    │       │   - Ctrl+M to focus main agent
    │       │
    │       ├── Sub-agent completes
    │       │   - Row shows [✓ done]
    │       │   - Full output still accessible via drill-in
    │       │   - Observations remain in DB (no cleanup)
    │       │   - Main agent receives output as tool result
    │       │   - Main agent continues chain-of-thought
    │       │
    │       └── Main agent finishes
    │           - Reflects on all sub-agent outputs
    │           - Generates PR comment markdown
    │           - Switches to 'results' mode
    │
    ├── 4. User presses 'p' → confirm post
    │       prComment tool → gh pr comment <n> --body-file <tmp>
    │
    └── 5. User presses 'c' → back to chat
           Sub-agent data preserved in ReviewContext + DB
```

---

## `spawnSubAgent` Tool

```typescript
// src/agent/tools/spawnSubAgent/spawnSubAgent.ts

import { tool } from "ai";
import { z } from "zod";
import { createAgent, systemPrompt } from "../../agent.js";

// Registry: allows the tool to push sub-agent updates to the TUI.
// Set by useReviewOrchestrator before starting the review.
export const subAgentRegistry = {
  onSpawned: null as
    | ((args: { toolCallId: string; role: string }) => void)
    | null,
  onOutput: null as
    | ((args: {
        toolCallId: string;
        latestLine: string;
        fullOutput: string;
      }) => void)
    | null,
  onDone: null as
    | ((args: { toolCallId: string; fullOutput: string }) => void)
    | null,
};

export const spawnSubAgentTool = tool({
  description:
    "Spawn a specialist sub-agent to analyze code. The sub-agent runs as an Excelsior instance with a focused role.",
  parameters: z.object({
    role: z
      .string()
      .describe(
        "Role name, e.g. 'Bug Hunter', 'Security Auditor', 'Code Style Reviewer'",
      ),
    instruction: z
      .string()
      .describe("Detailed analysis task with code context for this specialist"),
  }),
  execute: async ({ role, instruction }, { toolCallId }) => {
    subAgentRegistry.onSpawned?.({ toolCallId, role });

    const agent = createAgent(
      systemPrompt +
        `\n\n---\nROLE: ${role}\n---\n` +
        `\nYou are a sub-agent of a larger code review.` +
        `\nDo NOT spawn sub-agents, agents, or tools that delegate to other agents.` +
        `\nComplete your assigned task directly.` +
        `\n---\n\n` +
        instruction,
    );

    let fullOutput = "";
    const stream = await agent.stream({
      messages: [{ role: "user", content: instruction }],
    });

    for await (const part of stream.fullStream) {
      if (part.type === "text-delta") {
        const delta = (part as any).text ?? (part as any).textDelta ?? "";
        fullOutput += delta;
        const lines = fullOutput.split("\n");
        subAgentRegistry.onOutput?.({
          toolCallId,
          latestLine: lines[lines.length - 1] || lines[lines.length - 2] || "",
          fullOutput,
        });
      }
    }

    subAgentRegistry.onDone?.({ toolCallId, fullOutput });
    return fullOutput;
  },
});
```

---

## Sub-agent System Prompt Composition

```
[base Excelsior system prompt]
- Workspace awareness
- Architecture-first
- Plan before execution

---
ROLE: Bug Hunter
---

You are a sub-agent of a larger code review.
Do NOT spawn sub-agents, agents, or tools that delegate to other agents.
Complete your assigned task directly.
---

[instruction from main agent]
```

This ensures:

- ✅ Full Excelsior harness (model, tools, base personality)
- ✅ Focused role definition
- ✅ Guardrail against recursive sub-agent spawning
- ✅ Task is explicit

---

## `useReviewOrchestrator` Hook

```typescript
// src/tui/hooks/useReviewOrchestrator.ts

import { useState, useCallback, useEffect, useRef } from "react";
import { createAgent } from "../../agent/agent.js";
import {
  spawnSubAgentTool,
  subAgentRegistry,
} from "../../agent/tools/spawnSubAgent/spawnSubAgent.js";
import { gitDiffTool } from "../../agent/tools/gitDiff/gitDiff.js";
import { prCommentTool } from "../../agent/tools/prComment/prComment.js";
import { SubAgentState } from "../../types.js";
import { useReviewContext } from "../context/ReviewContext.js";

export function useReviewOrchestrator() {
  const {
    diff,
    subAgents,
    addSubAgent,
    updateSubAgent,
    clearSubAgents,
    setMainOutput,
    setMode,
  } = useReviewContext();

  const abortRef = useRef<AbortController | null>(null);

  // Wire up the subAgentRegistry callbacks once
  useEffect(() => {
    subAgentRegistry.onSpawned = ({ toolCallId, role }) => {
      addSubAgent({
        toolCallId,
        role,
        status: "running",
        latestLine: "",
        fullOutput: "",
      });
    };
    subAgentRegistry.onOutput = ({ toolCallId, latestLine, fullOutput }) => {
      updateSubAgent(toolCallId, { status: "running", latestLine, fullOutput });
    };
    subAgentRegistry.onDone = ({ toolCallId, fullOutput }) => {
      updateSubAgent(toolCallId, {
        status: "done",
        latestLine: fullOutput.split("\n").filter(Boolean).pop() || "",
        fullOutput,
      });
    };
    return () => {
      subAgentRegistry.onSpawned = null;
      subAgentRegistry.onOutput = null;
      subAgentRegistry.onDone = null;
    };
  }, []);

  const startReview = useCallback(async () => {
    if (!diff) return;

    clearSubAgents();
    setMode("review");

    const mainAgent = createAgent(reviewOrchestratorPrompt);

    abortRef.current = new AbortController();
    let fullText = "";
    const captureOutput = (delta: string) => {
      fullText += delta;
      setMainOutput(fullText);
    };

    const stream = await mainAgent.stream({
      tools: {
        gitDiff: gitDiffTool,
        spawnSubAgent: spawnSubAgentTool,
        prComment: prCommentTool,
        readFile: readFileTool,
        runCommand: runCommandTool,
        listFiles: listFilesTool,
        writeFile: writeFileTool,
      },
      messages: [
        {
          role: "user",
          content: `Review this PR diff for a pull request:\n\n\`\`\`diff\n${diff}\n\`\`\``,
        },
      ],
    });

    for await (const part of stream.fullStream) {
      if (abortRef.current?.signal.aborted) break;
      if (part.type === "text-delta") {
        captureOutput((part as any).text ?? (part as any).textDelta ?? "");
      }
    }

    setMode("results");
  }, [diff]);

  const cancelReview = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { startReview, cancelReview };
}
```

---

## ReviewContext

```typescript
// src/tui/context/ReviewContext.tsx

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { PullRequest, SubAgentState, ReviewScreenMode } from "../../types.js";

interface ReviewContextType {
  // State
  mode: ReviewScreenMode;
  prs: PullRequest[];
  selectedPR: PullRequest | null;
  diff: string | null;
  subAgents: SubAgentState[];
  selectedSubAgentIndex: number;     // -1 = main agent focused, 0..N = sub-agent index
  mainOutput: string;

  // Actions
  setMode: (mode: ReviewScreenMode) => void;
  setPRs: (prs: PullRequest[]) => void;
  selectPR: (pr: PullRequest) => void;
  setDiff: (diff: string | null) => void;
  addSubAgent: (agent: SubAgentState) => void;
  updateSubAgent: (toolCallId: string, updates: Partial<SubAgentState>) => void;
  clearSubAgents: () => void;
  selectPrevSubAgent: () => void;    // Ctrl+O
  selectNextSubAgent: () => void;    // Ctrl+P
  focusMainAgent: () => void;        // Ctrl+M
  selectSubAgent: (index: number) => void;
  setMainOutput: (output: string) => void;
}

const ReviewContext = createContext<ReviewContextType | null>(null);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ReviewScreenMode>("browser");
  const [prs, setPRs] = useState<PullRequest[]>([]);
  const [selectedPR, selectPR] = useState<PullRequest | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgentState[]>([]);
  const [selectedSubAgentIndex, setSelectedSubAgentIndex] = useState(-1);
  const [mainOutput, setMainOutput] = useState("");

  const addSubAgent = useCallback((agent: SubAgentState) => {
    setSubAgents((prev) => [...prev, agent]);
  }, []);

  const updateSubAgent = useCallback((toolCallId: string, updates: Partial<SubAgentState>) => {
    setSubAgents((prev) =>
      prev.map((a) => (a.toolCallId === toolCallId ? { ...a, ...updates } : a)),
    );
  }, []);

  const clearSubAgents = useCallback(() => {
    setSubAgents([]);
    setSelectedSubAgentIndex(-1);
  }, []);

  const selectPrevSubAgent = useCallback(() => {
    setSelectedSubAgentIndex((prev) => {
      if (subAgents.length === 0) return -1;
      if (prev <= 0) return subAgents.length - 1;
      return prev - 1;
    });
  }, [subAgents.length]);

  const selectNextSubAgent = useCallback(() => {
    setSelectedSubAgentIndex((prev) => {
      if (subAgents.length === 0) return -1;
      if (prev >= subAgents.length - 1) return 0;
      return prev + 1;
    });
  }, [subAgents.length]);

  const focusMainAgent = useCallback(() => {
    setSelectedSubAgentIndex(-1);
  }, []);

  return (
    <ReviewContext.Provider
      value={{
        mode, setMode, prs, setPRs, selectedPR, selectPR, diff, setDiff,
        subAgents, selectedSubAgentIndex, mainOutput, setMainOutput,
        addSubAgent, updateSubAgent, clearSubAgents,
        selectPrevSubAgent, selectNextSubAgent, focusMainAgent, selectSubAgent,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}

export const useReviewContext = () => {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error("useReviewContext must be used within ReviewProvider");
  return ctx;
};
```

---

## ReviewScreen — Input Routing

```typescript
// src/tui/screens/ReviewScreen.tsx (keyboard logic snippet)

useInput((input, key) => {
  if (mode === "review") {
    if (subMode === "overview") {
      if (key.ctrl && input === "o") {
        selectPrevSubAgent();
        return;
      }
      if (key.ctrl && input === "p") {
        selectNextSubAgent();
        return;
      }
      if (key.ctrl && input === "m") {
        focusMainAgent();
        return;
      }
      if (input === "\r") {
        // Enter
        if (selectedSubAgentIndex >= 0) setSubMode("detail");
        return;
      }
    } else if (subMode === "detail") {
      if (key.ctrl && input === "o") {
        selectPrevSubAgent();
        return;
      } // detail switches to prev sub
      if (key.ctrl && input === "p") {
        selectNextSubAgent();
        return;
      } // detail switches to next sub
      if (key.ctrl && input === "m") {
        setSubMode("overview");
        focusMainAgent();
        return;
      }
      if (key.escape) {
        setSubMode("overview");
        return;
      }
    }
    if (input === "c") {
      navigate("chat");
      return;
    }
  }
});
```

---

## Types

```typescript
// src/types.ts — Additions

export type Screen = "chat" | "logs" | "settings" | "review";

export type ReviewScreenMode = "browser" | "review" | "results";

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  headRefName: string;
  createdAt: string;
}

export interface SubAgentState {
  toolCallId: string;
  role: string;
  status: "running" | "done";
  latestLine: string;
  fullOutput: string;
}

export interface ReviewFinding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  file: string;
  line: number;
  title: string;
  description: string;
  fix: string;
  subAgent: string;
}
```

---

## Main Agent System Prompt

```typescript
// src/agent/review/reviewPrompt.ts

export const reviewOrchestratorPrompt = `
You are a code review orchestrator operating in a TUI.

Your job:
1. Analyze the git diff for a pull request.
2. Decide what specialist reviews are needed based on the files changed.
3. Craft a specific prompt instruction for each of them.
5. After all specialists report back, synthesize their findings.
6. Assign appropriate severity levels (CRITICAL/HIGH/MEDIUM/LOW).
7. Generate a markdown PR comment summarizing all findings.

When to spawn a sub-agent:
- If code logic changes: spawn a "Bug Hunter" to find logic errors
- If dependencies or auth/crypto code changes: spawn a "Security Auditor"
- If any code changes: spawn a "Code Style Reviewer"
- If infrastructure/CI changes: spawn an "Infrastructure Reviewer"
- You may invent other roles as needed based on the diff

Each spawnSubAgent call requires:
- role: descriptive name (will be displayed in the TUI as a sub-agent row)
- instruction: what to analyze, with the specific code context

You should spawn sub-agents proactively as you identify areas needing review.
You can spawn multiple sub-agents for different aspects of the same code.
Wait for all spawned sub-agents to complete before combining their findings.

After all sub-agents finish:
- Deduplicate overlapping issues
- Rank by severity: CRITICAL > HIGH > MEDIUM > LOW
- Remove false positives
- For each finding, include a suggested fix
- Format as a markdown PR comment
`;
```

---

## File Manifest

### MODIFY (4 files)

| File                                       | Change                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `src/types.ts`                             | Add `PullRequest`, `SubAgentState`, `ReviewScreenMode`, `ReviewFinding` |
| `src/agent/agent.ts`                       | Accept optional `instructions` parameter in `createAgent()`             |
| `src/agent/commands/registry.ts`           | Add `/review` command → `navigate("review")`                            |
| `src/tui/components/navigation/Router.tsx` | Add `ReviewScreen` import + `case "review"` route                       |
| `src/tui/hooks/useDatabase.ts`             | Add `getGithubToken()`, `saveGithubToken()`                             |
| `src/tui/screens/SettingsScreen.tsx`       | Add GitHub token input field                                            |

### CREATE (15 files)

#### Agent — Review (2 files)

| File                                | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `src/agent/review/reviewPrompt.ts`  | Main agent system prompt                  |
| `src/agent/review/spawnSubAgent.ts` | `spawnSubAgent` tool + `subAgentRegistry` |

#### Agent — Tools (3 files with types)

| File                                     | Purpose                                             |
| ---------------------------------------- | --------------------------------------------------- |
| `src/agent/tools/gitDiff/gitDiff.ts`     | Vercel AI SDK tool: `gh pr diff <n>`                |
| `src/agent/tools/gitDiff/type.ts`        | Zod schema                                          |
| `src/agent/tools/prComment/prComment.ts` | Vercel AI SDK tool: `gh pr comment <n> --body-file` |
| `src/agent/tools/prComment/type.ts`      | Zod schema                                          |

#### TUI — Screen (1 file)

| File                               | Purpose                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| `src/tui/screens/ReviewScreen.tsx` | Main review screen: overview/detail modes, keyboard routing |

#### TUI — Context (1 file)

| File                                | Purpose                               |
| ----------------------------------- | ------------------------------------- |
| `src/tui/context/ReviewContext.tsx` | All review state + navigation actions |

#### TUI — Hooks (3 files)

| File                                     | Purpose                                                         |
| ---------------------------------------- | --------------------------------------------------------------- |
| `src/tui/hooks/usePullRequests.ts`       | `gh pr list --base <branch> --json ...`                         |
| `src/tui/hooks/usePRDiff.ts`             | `gh pr diff <number>`                                           |
| `src/tui/hooks/useReviewOrchestrator.ts` | Creates main agent, wires `subAgentRegistry`, manages lifecycle |

#### TUI — Components (6 files)

| File                                           | Purpose                                             |
| ---------------------------------------------- | --------------------------------------------------- |
| `src/tui/components/review/PRList.tsx`         | Arrow-key navigable PR list                         |
| `src/tui/components/review/DiffViewer.tsx`     | Syntax-highlighted diff                             |
| `src/tui/components/review/ReviewOverview.tsx` | Split layout: main agent output + sub-agent rows    |
| `src/tui/components/review/SubAgentRow.tsx`    | Single sub-agent compact row                        |
| `src/tui/components/review/SubAgentDetail.tsx` | Full sub-agent output with auto-scroll when running |
| `src/tui/components/review/ReviewResults.tsx`  | Results grouped by severity                         |
| `src/tui/components/review/ReviewFooter.tsx`   | Context-sensitive keybinding bar                    |

---

## Dependencies

Zero new npm packages. Everything uses built-in modules or existing `gh` CLI:

| Need                    | Solution                                             |
| ----------------------- | ---------------------------------------------------- |
| **In-process agents**   | Vercel AI SDK `ToolLoopAgent` (existing)             |
| **LLM**                 | DeepSeek via `@ai-sdk/deepseek` (existing)           |
| **Model + API key**     | `createAgent()` factory (existing)                   |
| **GitHub PR API**       | `gh` CLI (system tool, respects `GH_TOKEN`)          |
| **Code analysis**       | Sub-agents use `readFile` + `runCommand` tools       |
| **Sub-agent guardrail** | System prompt instruction: "Do NOT spawn sub-agents" |

---

## Implementation Order

### Phase 1: Foundation

1. Extend `src/types.ts`
2. Refactor `src/agent/agent.ts` — `createAgent(instructions?)`
3. GitHub token: `useDatabase.ts` + `SettingsScreen.tsx`
4. `/review` command in `registry.ts` + router

### Phase 2: Data Fetching

5. `src/tui/hooks/usePullRequests.ts`
6. `src/tui/hooks/usePRDiff.ts`
7. `src/tui/components/review/PRList.tsx`
8. `src/tui/components/review/DiffViewer.tsx`

### Phase 3: Context + Review Screen

9. `src/tui/context/ReviewContext.tsx`
10. `src/tui/screens/ReviewScreen.tsx` (input routing + overview/detail modes)
11. `src/tui/components/review/ReviewOverview.tsx` (split layout)
12. `src/tui/components/review/SubAgentRow.tsx`
13. `src/tui/components/review/SubAgentDetail.tsx`
14. `src/tui/components/review/ReviewFooter.tsx`

### Phase 4: Agent Layer

15. `src/agent/review/reviewPrompt.ts`
16. `src/agent/review/spawnSubAgent.ts` (tool + `subAgentRegistry`)
17. `src/agent/tools/gitDiff/gitDiff.ts` + `type.ts`
18. `src/agent/tools/prComment/prComment.ts` + `type.ts`

### Phase 5: Orchestrator Hook

19. `src/tui/hooks/useReviewOrchestrator.ts`

### Phase 6: Results + Polish

20. `src/tui/components/review/ReviewResults.tsx`
21. Wire post-comment flow (confirm → `gh pr comment`)
22. Error handling: no PRs, no token, sub-agent exception
23. End-to-end testing with real PR
