# Excelsior — Feature Roadmap

## What You Already Have

| Layer | Capabilities |
|---|---|
| **Tools** | `readFile`, `writeFile` (confirmable), `runCommand` (confirmable), `listFiles`, `gitDiff` (unused in main agent) |
| **Agent** | DeepSeek v4-flash, streaming, tool loop, sub-agent spawning |
| **UI** | Chat, Settings, PR Review, tool confirmation, markdown rendering, command autocomplete |
| **Data** | SQLite persistence, chat history, API key storage |
| **GitHub** | Octokit integration, PR listing, diff fetching, PR commenting |

---

## Prioritized Next Steps

### Tier 1 — High Impact, Low-Medium Effort

#### 1. 🔍 `searchFiles` / `grepTool`
**Why:** Right now the agent can only `listFiles` + `readFile`. For any real codebase, it needs to *search* — find where a function is defined, locate imports, find usages. Without this, the agent reads files blindly.

**What:** A `grep`/`ripgrep` tool that searches file contents with regex support, file type filtering, and result limiting.

**Effort:** Low — shell out to `grep -rn` or `ripgrep`, parse output.

---

#### 2. ✏️ `editFile` tool (patch-based, not full rewrite)
**Why:** `writeFile` currently **overwrites the entire file**. For large files, this wastes tokens and risks clobbering unrelated code. A surgical edit tool (search-and-replace or line-range patch) is essential.

**What:** A tool that takes `{ file, search, replace }` or `{ file, startLine, endLine, newContent }` — edits a specific section without rewriting the whole file.

**Effort:** Medium — need to handle edge cases (multiple matches, encoding, line endings).

---

#### 3. 🎨 Syntax Highlighting in Code Blocks
**Why:** The MarkdownRenderer currently renders code blocks as monochrome `#cdd6f4` text on `#1e1e2e`. For a coding agent, this is the most-viewed content — it deserves highlighting.

**What:** Use a library like [`cli-highlight`](https://www.npmjs.com/package/cli-highlight) or [`ansi-colors`](https://www.npmjs.com/package/ansi-colors) to tokenize code by language and apply colors. The `code.lang` is already parsed from the markdown.

**Effort:** Low — pipe `code.text` through a highlighter, render the ANSI output.

---

#### 4. 📋 Context Window Management
**Why:** Long conversations will exceed the model's context window. Currently there's no truncation strategy — the agent just sends the full message history until it errors.

**What:**
- Token counting (approximate: ~4 chars per token for English/code)
- Sliding window: keep system prompt + last N messages that fit
- Summarize older messages into a compact context block

**Effort:** Medium

---

### Tier 2 — High Impact, Higher Effort

#### 5. 🌳 `findDefinition` / `findReferences` via LSP
**Why:** True code intelligence — jump to definition, find all references, get diagnostics. This makes the agent *understand* code structure, not just text.

**What:** Spin up a language server (TypeScript: `typescript-language-server`, Python: `pyright`) and expose LSP queries as tools.

**Effort:** High — LSP lifecycle management, project initialization, request/response mapping. Consider starting with TypeScript only since that's your stack.

**Alternative:** A simpler `treeSitter` approach — use tree-sitter to parse ASTs and extract symbols/scopes. Much lighter than full LSP, gives you definition lookup and symbol search.

---

#### 6. 📂 File Diff Preview Before Write
**Why:** When the agent proposes a `writeFile`, the user sees `⚠ writeFile [y/N]` with raw args. Showing a colored diff of what's about to change would massively improve trust and review speed.

**What:** On `writeFile` confirmation, compute `diff(existingContent, newContent)` and render it in the confirmation UI using your existing `DiffViewer`.

**Effort:** Medium — need a diff library (or shell out to `diff`), integrate with the confirmation flow.

---

#### 7. 🔄 Undo / Checkpoint System
**Why:** If the agent makes a bad edit, there's no way to roll back without git. A lightweight checkpoint system gives safety nets.

**What:** Before each `writeFile`, snapshot the original to a `.excelsior/checkpoints/` dir. Add `/undo` command to restore.

**Effort:** Low-Medium

---

### Tier 3 — Polish & Differentiation

#### 8. 📊 Token/Cost Tracking
**Why:** DeepSeek charges per token. Users should see how much a conversation costs.

**What:** Track input/output tokens per request (available from the AI SDK response), display in the footer or `/stats` command.

**Effort:** Low

---

#### 9. 🔌 Multi-Provider Support
**Why:** You're locked to DeepSeek. Supporting OpenAI, Anthropic, Ollama (local) would make Excelsior more flexible.

**What:** Abstract the model creation behind a provider config. The Vercel AI SDK already supports all of these.

**Effort:** Medium (you already have the AI SDK abstraction, just need provider switching UI)

---

#### 10. 📝 Project Context File (`.excelsior`)
**Why:** Let users define project-specific context — tech stack, conventions, important files — that gets injected into the system prompt automatically.

**What:** Read a `.excelsior` or `.excelsior.md` file from the project root, prepend to system prompt.

**Effort:** Very Low — 10 lines of code.

---

## Recommended Order

```
1. searchFiles/grep     ← agent can't find anything without this
2. editFile (patch)     ← surgical edits, not full rewrites
3. syntax highlighting  ← biggest UX win for code display
4. .excelsior context   ← trivial but high value
5. diff preview on write← trust & review
6. context management   ← needed before long sessions
7. undo/checkpoints     ← safety net
8. token tracking       ← visibility
9. multi-provider       ← flexibility
10. LSP                 ← the big one, do last
```

> [!TIP]
> Items 1-4 can all be done in a single session. They're independent and each one meaningfully levels up the agent.

Which ones do you want to tackle?
