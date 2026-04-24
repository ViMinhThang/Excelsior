# AI Code Review & Coding Agent (Implementation Plan)

## Overview
Create an advanced AI code review agent that automatically comments on GitHub Pull Requests. It will feature a **hybrid architecture** that allows it to run automatically in CI/CD as a GitHub Action, or interactively on your local machine via a Terminal User Interface (TUI). The core logic uses a multi-agent pattern (Linting, Security, Code Review) coordinated by an Orchestrator, finishing with a **Reflection Pattern** to ensure the highest quality output.

## Project Type
**BACKEND** (Node.js/TypeScript / Hybrid CLI & GitHub Action)

## Success Criteria
- **GitHub Action Mode**: The agent triggers automatically on a PR event via GitHub Actions and posts a comment.
- **TUI Mode**: You can run the agent locally. It opens an interactive terminal session where typing `/pr` lists open PRs, lets you select one, and runs the AI review on your local machine.
- The Orchestrator splits the review task among specialized subagents:
  - **Lint Subagent**: Runs ESLint programmatically and translates results into feedback.
  - **Security Subagent**: Queries a CVE Database (e.g., OSV/npm audit) for newly added dependencies.
  - **Code Review Subagent**: Analyzes semantic logic and PR intent.
- **Reflection Pattern**: After aggregation, a final "Reflection Agent" reviews the combined feedback for contradictions, tone, and accuracy before generating the final cohesive review.
- The LLM provider can be switched via configuration.

## Tech Stack
- **Node.js + TypeScript**: Core runtime and language.
- **@actions/github & @actions/core**: Native GitHub Action toolkits.
- **Inquirer.js / Clack / Readline**: To build the interactive TUI REPL prompt.
- **Vercel AI SDK**: For orchestrating the subagents and handling multiple LLM providers.
- **ESLint API & OSV API**: For linting and vulnerability checking.
- **Zod**: For structured LLM outputs and config validation.

## File Structure
```text
.
├── .github/
│   └── workflows/
│       └── ai-review.yml
├── src/
│   ├── action.ts                # Entry point for the GitHub Action
│   ├── cli.ts                   # Entry point for the interactive TUI
│   ├── core/                    # Shared logic for both Action and CLI
│   │   ├── github-client.ts     # GitHub API interactions (list PRs, get diff, post comment)
│   │   ├── orchestrator.ts      # Aggregates results and triggers Reflection
│   │   └── provider.ts          # AI SDK setup and multi-provider logic
│   ├── subagents/
│   │   ├── code-reviewer.ts     # General code quality & semantic review
│   │   ├── linter.ts            # Stylistic review using ESLint
│   │   ├── security.ts          # Vulnerability checks using CVE DB
│   │   └── reflection.ts        # Final critic/reflection agent
│   ├── tools/
│   │   ├── eslint-runner.ts     # Tool wrapper for ESLint
│   │   ├── cvedb-client.ts      # Tool wrapper for CVE DB lookups
│   │   └── read-file.ts         # Utility tool for deep code context
│   └── config.ts                # Configuration and environment variables
├── package.json
└── tsconfig.json
```

## Task Breakdown

### Task 1: Project Setup [P0]
- **Agent**: `backend-specialist`
- **Skills**: `nodejs-best-practices`
- **INPUT**: None
- **OUTPUT**: Initialize `package.json`, `tsconfig.json`, and build scripts.
- **VERIFY**: `npm run build` works with empty files.

### Task 2: GitHub API Client [P0]
- **Agent**: `backend-specialist`
- **Skills**: `api-patterns`
- **INPUT**: `src/core/github-client.ts`
- **OUTPUT**: Logic to fetch PR diffs, list open PRs, parse `package.json` changes, and post unified comments.
- **VERIFY**: Unit tests parsing mock GitHub data.

### Task 3: Core AI Provider Setup [P1]
- **Agent**: `backend-specialist`
- **Skills**: `clean-code`
- **INPUT**: `src/core/provider.ts`
- **OUTPUT**: Setup Vercel AI SDK factory function to dynamically select providers based on env vars.

### Task 4: Subagent Tool Integrations [P0]
- **Agent**: `backend-specialist`
- **Skills**: `nodejs-best-practices`
- **INPUT**: `src/tools/eslint-runner.ts`, `src/tools/cvedb-client.ts`
- **OUTPUT**: ESLint tool lints changed files. CVE tool queries the OSV DB for newly introduced packages.

### Task 5: Subagents & Orchestrator Logic [P0]
- **Agent**: `backend-specialist`
- **Skills**: `clean-code`, `parallel-agents`
- **INPUT**: `src/subagents/*.ts`, `src/core/orchestrator.ts`
- **OUTPUT**: The Orchestrator dispatches the PR payload to the `linter`, `security`, and `code-reviewer` agents in parallel. Once they return their findings, the Orchestrator passes the aggregated data to the `reflection` agent. The reflection pattern refines the output, resolves contradictions, and ensures a polite, actionable tone before finalizing the PR comment.

### Task 6: GitHub Action Entrypoint & YAML [P0]
- **Agent**: `devops-engineer`
- **Skills**: `bash-linux`
- **INPUT**: `src/action.ts`, `.github/workflows/ai-review.yml`
- **OUTPUT**: Wire the GitHub Action triggers so the Orchestrator fires on `pull_request` events.

### Task 7: Interactive TUI Entrypoint [P1]
- **Agent**: `backend-specialist`
- **Skills**: `nodejs-best-practices`
- **INPUT**: `src/cli.ts`
- **OUTPUT**: An interactive REPL (Read-Eval-Print Loop). It listens for commands like `/pr`. When typed, it fetches open PRs from the repo, prompts the user to select one, runs the Orchestrator locally, and displays the AI review in the terminal.
- **VERIFY**: CLI successfully launches and lists mock PRs.

## Phase X: Verification
- [ ] No purple/violet hex codes
- [ ] No standard template layouts
- [ ] Socratic Gate was respected
- [ ] Security Scan: `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .`
- [ ] Build Success: `npm run build`
