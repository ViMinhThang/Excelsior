# AI Code Review & Coding Agent

This project is an advanced AI Code Review Agent designed with a **hybrid architecture**. It can run automatically as a GitHub Action whenever a Pull Request is opened, or interactively as a local Terminal User Interface (TUI).

The agent uses a **multi-agent orchestration pattern**, delegating tasks to specialized subagents (Linter, Security, Code Review) before using a Reflection pattern to polish the final PR comment.

---

## 📂 Folder Structure

```text
.
├── .github/workflows/   # CI/CD pipelines (e.g., ai-review.yml)
├── src/                 
│   ├── action.ts        # Entry point for the GitHub Action (triggered by CI)
│   ├── cli.ts           # Entry point for the local TUI REPL
│   ├── core/            # Shared logic between Action and CLI modes
│   │   ├── github-client.ts # Abstraction for GitHub API calls
│   │   ├── orchestrator.ts  # Main logic that dispatches work to subagents
│   │   └── provider.ts      # Vercel AI SDK LLM initialization
│   ├── subagents/       # The specialized AI workers
│   │   ├── code-reviewer.ts # Reviews code semantics and intent
│   │   ├── linter.ts        # Uses ESLint for style checks
│   │   ├── security.ts      # Uses CVE DB for vulnerability checks
│   │   └── reflection.ts    # Final critic that polishes aggregated output
│   ├── tools/           # Concrete implementations of external tools
│   │   ├── eslint-runner.ts # Programmatic wrapper around ESLint
│   │   ├── cvedb-client.ts  # OSV/GitHub Advisory API client
│   │   └── read-file.ts     # Utility for the AI to read full files locally
│   └── config.ts        # Environment variables and config validation
├── package.json
└── tsconfig.json
```

---

## 📦 NPM Packages Used

### Core Dependencies
- **`@actions/core` & `@actions/github`**: Native GitHub SDKs used in `src/action.ts` and `src/core/github-client.ts` to get PR diffs and post comments securely inside GitHub Actions.
- **`ai` (Vercel AI SDK)**: Used in `src/core/provider.ts` and subagents to provide a unified API to swap between different LLM providers (OpenAI, Anthropic, etc.) without rewriting code.
- **`zod`**: Used across the project to guarantee that the LLM returns properly structured JSON and to validate environment variables (`src/config.ts`).
- **`@clack/prompts`**: Used in `src/cli.ts` to build the interactive, visually pleasing Terminal UI REPL.

### Development Dependencies
- **`typescript` & `@types/node`**: For strongly typed development.
- **`ts-node`**: Used to execute the `src/cli.ts` file locally without needing a build step.
- **`@vercel/ncc`**: Used to compile the entire project (including `node_modules`) into a single file for the GitHub Action deployment.
- **`eslint` & plugins**: The linter used both for our own code quality, and invoked programmatically by `src/tools/eslint-runner.ts`.

---

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Local TUI**
   ```bash
   npm run start:cli
   ```
   *Note: Ensure you have `GITHUB_TOKEN` and your LLM API keys set in your environment variables.*

3. **Build GitHub Action**
   ```bash
   npm run build
   ```
