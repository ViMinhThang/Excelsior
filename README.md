# ░▒▓ EXCELSIOR ▓▒░

### AI Code Review & Coding Agent

Excelsior is an advanced AI Code Review Agent designed with a **hybrid architecture**. It can run automatically as a GitHub Action or interactively as a high-performance.

---

## ⚡ Key Features

- **Ink-Powered TUI**: A beautiful, React-based terminal interface with smooth animations and layout management.
- **Global Portability**: Configuration is stored globally at `~/.excelsior`, allowing you to use the tool across any repository without re-authenticating.
- **Command Intelligence**: Interactive command bar with real-time suggestions and arrow-key navigation (e.g., `/pr`, `/review`).
- **Workspace Awareness**: Automatically detects your current git repository, owner, and open Pull Requests.
- **Modular Architecture**: Built using React Context API and custom hooks for highly maintainable and performant code.

---

## 📂 Folder Structure

```text
src/
├── components/          # React (Ink) TUI components
│   ├── MainView/        # Header, CommandBar, WorkspaceInfo
│   ├── LoadingBox.tsx   # Animated spinner component
│   └── PRListView.tsx   # Interactive PR selection list
├── context/             # Global state (AppContext)
├── hooks/               # Custom logic (useCommandInput, useSpinner)
├── core/                # Shared logic (GitHub Client, Orchestrator)
├── utils/               # Git detection and helper utilities
├── constants.ts         # Centralized command and UI definitions
├── config.ts            # Global configuration management
└── cli.tsx              # TUI Entry point
```

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

   _Note: On first run, go to Settings to set your Gemini API Key. It will be saved globally._

3. **Commands**
   - Type `/pr` to list open Pull Requests for the current repo.
   - Use `Tab` to switch focus between the command input and the settings menu.
   - Use `Ctrl+S` as a shortcut to jump to Settings from anywhere.

---

## 📦 Core Technology Stack

- **[Ink](https://github.com/vadimdemedes/ink)**: React for Interactive Command-line Apps.
- **[tsx](https://github.com/privatenumber/tsx)**: Fast TypeScript execution (ESM support).
- **[Zod](https://github.com/colinhacks/zod)**: Schema validation for global configuration.
- **GitHub API**: Public and authenticated access to repository data.

---

## 🛠️ Development

Excelsior is built with **Clean Code** and **React Best Practices**:

- **SRP**: Every component has a single responsibility.
- **Hooks**: UI logic is extracted into testable custom hooks.
- **Context**: State management eliminates prop drilling.
- **Performance**: Memoized components to ensure smooth 60fps terminal interactions.
