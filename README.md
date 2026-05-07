# Excelsior

A terminal-based AI coding assistant powered by DeepSeek, built with [Ink](https://github.com/vadimdemedes/ink) (React for CLIs).

## Features

- **Interactive chat** — converse with an AI coding assistant directly in your terminal
- **Tool use** — the agent can read, write, list files and run shell commands (with user confirmation)
- **PR review** — browse open pull requests, orchestrate multi-agent code reviews, and post results back to GitHub
- **Chat persistence** — conversation history is stored locally in SQLite
- **Settings screen** — configure API keys without leaving the TUI

## Quick Start

```bash
# Install dependencies
npm install

# Set up your API key (or configure it in-app via /settings)
export DEEPSEEK_API_KEY="your-key-here"

# Optional: for PR review features
export GITHUB_TOKEN="your-github-token"

# Run
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `/help` | List all available commands |
| `/clear` | Clear chat messages from the screen |
| `/reset` | Delete all conversation history from database |
| `/settings` | Open the Settings screen |
| `/review` | Open the PR review screen |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Open Settings |
| `Ctrl+C` | Exit |
| `Ctrl+U` | Load older messages |
| `Ctrl+O` | Toggle sub-agent detail view |
| `ESC` | Cancel running agent / Go back |
| `↑ / ↓` | Navigate message history |
| `Tab` | (Settings) Switch between input fields |

## Architecture

```
src/
├── agent/          # AI agent: model setup, prompts, tools, commands
│   ├── review/     # Multi-agent PR review orchestrator
│   ├── tools/      # File I/O, shell, git diff tools
│   └── commands/   # Slash command registry
├── tui/            # Terminal UI (Ink/React)
│   ├── screens/    # ChatScreen, ReviewScreen, SettingsScreen
│   ├── components/ # Reusable UI components
│   ├── hooks/      # React hooks for state management
│   ├── context/    # React contexts (Navigation, PR, Review, SubAgent)
│   └── lib/        # Agent streaming, chat persistence
├── db/             # SQLite database layer
└── utils/          # GitHub API, exec helpers
```

## Development

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Type check
npx tsc --noEmit

# Build
npm run build
```

## Configuration

Excelsior needs a DeepSeek API key to function. You can provide it via:

1. **Environment variable**: `export DEEPSEEK_API_KEY="..."`
2. **In-app settings**: Press `Ctrl+S` or type `/settings`

For PR review features, also configure a GitHub token with `repo` scope.

See [`.env.example`](.env.example) for all available environment variables.

## License

ISC
