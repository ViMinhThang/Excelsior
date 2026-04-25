# Excelsior

Excelsior is a terminal pull request review assistant for GitHub repositories. It lists open pull requests for the current workspace, fetches a selected diff, and produces a structured review that combines:

- Model-assisted code review when a Gemini or Anthropic API key is configured
- Local lint/style checks against workspace files
- Static security pattern scanning on changed lines

`.agents/` is kept as reference material only. It is not part of the runtime architecture.

## Runtime Architecture

The shipped application is organized around a small set of concrete layers:

- `src/App.tsx`, `src/components/`, `src/hooks/useAppController.ts`
  The Ink UI and controller layer. Views are mostly presentational; the controller owns keybindings and user actions.
- `src/services/review-service.ts`
  Workspace-level orchestration for listing pull requests and reviewing a selected PR.
- `src/core/github-client.ts`
  GitHub API access and repository detection.
- `src/core/orchestrator.ts`
  Review pipeline orchestration.
- `src/review/`
  Diff parsing, runtime review passes, report formatting, and review types.
- `src/subagents/`
  Comment-only reference files for subagent roles. They are not imported at runtime.
- `src/config.ts`
  Global configuration stored in `~/.excelsior/.env`.

## Configuration

Excelsior stores user-level settings in `~/.excelsior/.env`.

Supported settings:

- `LLM_PROVIDER=google|anthropic`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `GITHUB_TOKEN`

If no LLM API key is configured, reviews still run with deterministic lint and security checks plus heuristic code-review findings.

## Commands

- `/pr`
  List open pull requests for the current repository.
- `/review`
  List pull requests and choose one to review.
- `/review <number>`
  Review a pull request directly.
- `/settings`
  Open provider and token settings.
- `/help`
  Show the supported commands.

Keybindings:

- `Tab`
  Switch focus between the command input and the settings shortcut.
- `Ctrl+P`
  Toggle between `ACT` and `PLAN` review modes.
- `Ctrl+S`
  Open settings.
- `Ctrl+Q`
  Quit the application.

## Development

Install dependencies:

```bash
npm install
```

Run the CLI in development:

```bash
npm run dev
```

Quality checks:

```bash
npm run check
npm run lint
npm run test
npm run build
```

## Notes

- The review pipeline is real and emitted in the build artifact.
- The package `main` entry now points to an actual compiled `dist/index.js`.
- ESLint uses flat config and ignores `.agents/` because it is reference-only.
