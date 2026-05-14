# Excelsior

A terminal-based AI coding assistant powered by DeepSeek, built with [Ink](https://github.com/vadimdemedes/ink).

## Features

- **Interactive chat** - converse with an AI coding assistant directly in your terminal
- **Tool use** - read, write, list, search files, and run shell commands with confirmation for write-like actions
- **PR review** - review pull requests from slash commands with specialist sub-agents
- **Chat persistence** - SQLite stores session metadata and JSONL stores runtime events
- **Settings screen** - configure API keys without leaving the TUI

## Quick Start

```bash
npm install
export DEEPSEEK_API_KEY="your-key-here"
export GITHUB_TOKEN="your-github-token" # optional, for PR review
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `/help` | List all available commands |
| `/clear` | Clear chat messages from the screen |
| `/reset` | Delete all conversation history |
| `/settings` | Open the Settings screen |
| `/review <number>` | Fetch a PR diff and run a multi-agent review |
| `/review-post <number> <body>` | Post a comment to a PR |
| `/session` | Open the selectable session list |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Open Settings |
| `Ctrl+C` | Exit |
| `Ctrl+O` | Toggle sub-agent detail view |
| `Esc` | Cancel running agent / Go back |
| `Up` / `Down` | Navigate message history or suggestions |
| `Tab` | Complete command suggestion or switch Settings fields |

## Architecture

```text
src/
|- agent/          # model setup, prompts, tools, sub-agent tool
|- application/    # AgentManager, ChatService, run wiring
|- features/       # plain feature services such as SessionManager
|- lib/
|  |- github/      # GitHub API integration and repo detection
|  |- persistence/ # SQLite metadata, JSONL event recorder
|  |- projection/  # event-to-display/history read models
|  |- runtime/     # AgentRun, RunOrchestrator, stream handling
|  |- tool/        # ToolContext and capabilities
|  `- utils/       # small shared library helpers
`- tui/            # Ink UI screens, components, hooks, commands
```

See [`docs/architecture.md`](docs/architecture.md) for current runtime boundaries, or open
[`docs/wiki/index.html`](docs/wiki/index.html) for the full HTML architecture wiki.

Slash commands are feature-owned: add commands, panels, and feature-specific helpers under `src/features/<feature>/`, then register the feature in `src/features/index.ts`.

## Development

```bash
npm test
npm run test:watch
npx tsc --noEmit
npm run build
```

## Configuration

Excelsior needs a DeepSeek API key. You can provide it with `DEEPSEEK_API_KEY` or save it in-app via `Ctrl+S` / `/settings`.

For PR review features, configure `GITHUB_TOKEN` with repo access.

See [`.env.example`](.env.example) for available environment variables.

## License

ISC
