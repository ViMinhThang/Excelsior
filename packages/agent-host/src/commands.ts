import type {
  AgentMode,
  CommandDefinition,
  CommandResult,
  SendOptions,
} from "@excelsior/core";
import { formatAgentMode, SESSION_PICKER_PANEL_ID } from "@excelsior/core";
import { fetchPRDiff } from "./lib/github/github.js";
import { postPRComment } from "./lib/github/ghComment.js";

export interface AgentCommandHost {
  send(content: string, options?: SendOptions): void;
  clearMessages(): void;
  deleteAllSessions(): void | Promise<void>;
  createSession(title?: string): unknown;
  switchSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): void | Promise<void>;
  renameSession(sessionId: string, title: string): void;
  getMode(): AgentMode;
  setMode(mode: AgentMode): void;
}

export interface ReviewCommandServices {
  fetchPRDiff(prNumber: number): Promise<string>;
  postPRComment(prNumber: number, body: string): Promise<string>;
}

export interface AgentCommand {
  definition: CommandDefinition;
  execute(args: string[], host: AgentCommandHost): CommandResult | Promise<CommandResult>;
}

export const defaultReviewCommandServices: ReviewCommandServices = {
  fetchPRDiff,
  postPRComment,
};

export function getHelpText(commands: CommandDefinition[] = commandDefinitions): string {
  const groups = [
    {
      title: "Core",
      commands: commands.filter((command) =>
        ["help", "clear", "reset"].includes(command.name),
      ),
    },
    {
      title: "Mode",
      commands: commands.filter((command) => command.name === "mode"),
    },
    {
      title: "Settings",
      commands: commands.filter((command) => command.name === "settings"),
    },
    {
      title: "Session",
      commands: commands.filter((command) => command.name === "session"),
    },
    {
      title: "Review",
      commands: commands.filter((command) =>
        ["review", "review-post"].includes(command.name),
      ),
    },
  ];

  const body = groups
    .map((group) => {
      const entries = group.commands
        .map((command) => {
          const usage = command.usage ? `\n  usage: ${command.usage}` : "";
          return `/${command.name} - ${command.description}${usage}`;
        })
        .join("\n");
      return `${group.title}\n${entries}`;
    })
    .join("\n\n");

  return `Available commands:\n\n${body}`;
}

export function createAgentCommands(
  services: ReviewCommandServices = defaultReviewCommandServices,
): AgentCommand[] {
  const commands: AgentCommand[] = [
    {
      definition: {
        name: "help",
        description: "List all available commands",
        usage: "/help",
      },
      execute: () => ({
        handled: true,
        message: getHelpText(commands.map((command) => command.definition)),
        clearInput: true,
      }),
    },
    {
      definition: {
        name: "clear",
        description: "Clear chat messages from the screen",
        usage: "/clear",
      },
      execute: (_args, host) => {
        host.clearMessages();
        return {
          handled: true,
          message: "Chat history cleared from UI.",
          clearInput: true,
        };
      },
    },
    {
      definition: {
        name: "reset",
        description: "Delete all conversation history from database",
        usage: "/reset",
      },
      execute: async (_args, host) => {
        await host.deleteAllSessions();
        host.clearMessages();
        return { handled: true, message: "Database history reset.", clearInput: true };
      },
    },
    {
      definition: {
        name: "mode",
        description: "Show or switch Plan/Act mode",
        usage: "/mode | /mode plan | /mode act",
      },
      execute: executeModeCommand,
    },
    {
      definition: {
        name: "settings",
        description: "View or set configuration settings (e.g. apiKey, githubToken)",
        usage: "/settings",
      },
      execute: () => ({ handled: true, navigate: "settings", clearInput: true }),
    },
    {
      definition: {
        name: "session",
        description: "Open the session picker",
        usage:
          "/session | /session new <title> | /session open <id> | /session rename <id> <title> | /session delete <id>",
      },
      execute: executeSessionCommand,
    },
    {
      definition: {
        name: "review",
        description: "Review a pull request by number (e.g. /review 42)",
        usage: "/review <pr-number>",
      },
      execute: (args, host) => executeReviewCommand(args, host, services),
    },
    {
      definition: {
        name: "review-post",
        description: 'Post a comment to a PR (e.g. /review-post 42 "Looks good")',
        usage: "/review-post <pr-number> <comment body>",
      },
      execute: (args) => executeReviewPostCommand(args, services),
    },
  ];
  return commands;
}

export const commandRegistry = createAgentCommands();
export const commandDefinitions: CommandDefinition[] = commandRegistry.map(
  (command) => command.definition,
);

export async function executeAgentCommand(
  input: string,
  host: AgentCommandHost,
  commands: AgentCommand[] = commandRegistry,
): Promise<CommandResult> {
  if (!input.startsWith("/")) return { handled: false };

  const parts = input.slice(1).split(" ");
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);
  const command = commands.find((candidate) => candidate.definition.name === commandName);

  if (!command) {
    return {
      handled: true,
      message: `Unknown command: /${commandName}. Type /help for a list of commands.`,
      clearInput: true,
    };
  }

  return command.execute(args, host);
}

function executeModeCommand(args: string[], host: AgentCommandHost): CommandResult {
  const next = args[0]?.toLowerCase();
  if (!next) {
    return {
      handled: true,
      message: `Current mode: ${formatAgentMode(host.getMode())}. Usage: /mode plan | /mode act`,
      clearInput: true,
    };
  }

  if (next !== "plan" && next !== "act") {
    return {
      handled: true,
      message: "Usage: /mode | /mode plan | /mode act",
      clearInput: true,
    };
  }

  host.setMode(next);
  return {
    handled: true,
    message: `Mode switched to ${formatAgentMode(next)}.`,
    clearInput: true,
  };
}

async function executeSessionCommand(
  args: string[],
  host: AgentCommandHost,
): Promise<CommandResult> {
  const sub = args[0]?.toLowerCase();
  switch (sub) {
    case undefined:
    case "":
    case "list":
      return {
        handled: true,
        openPanelId: SESSION_PICKER_PANEL_ID,
        clearInput: true,
      };

    case "new": {
      const title = args.slice(1).join(" ") || "Untitled";
      host.createSession(title);
      return {
        handled: true,
        message: `Created session: "${title}".`,
        clearInput: true,
      };
    }

    case "open": {
      const id = args[1];
      if (!id) {
        return {
          handled: true,
          message: "Usage: /session open <session-id>",
          clearInput: true,
        };
      }
      await host.switchSession(id);
      return {
        handled: true,
        message: `Switched to session ${id.slice(0, 8)}...`,
        clearInput: true,
      };
    }

    case "rename": {
      const id = args[1];
      const title = args.slice(2).join(" ");
      if (!id || !title) {
        return {
          handled: true,
          message: "Usage: /session rename <session-id> <title>",
          clearInput: true,
        };
      }
      host.renameSession(id, title);
      return {
        handled: true,
        message: `Renamed session to "${title}".`,
        clearInput: true,
      };
    }

    case "delete": {
      const id = args[1];
      if (!id) {
        return {
          handled: true,
          message: "Usage: /session delete <session-id>",
          clearInput: true,
        };
      }
      await host.deleteSession(id);
      return {
        handled: true,
        message: `Deleted session ${id.slice(0, 8)}...`,
        clearInput: true,
      };
    }

    default:
      return {
        handled: true,
        message:
          "Usage: /session | /session new <title> | /session open <id> | /session rename <id> <title> | /session delete <id>",
        clearInput: true,
      };
  }
}

async function executeReviewCommand(
  args: string[],
  host: AgentCommandHost,
  services: ReviewCommandServices,
): Promise<CommandResult> {
  const prNumber = Number.parseInt(args[0], 10);
  if (Number.isNaN(prNumber)) {
    return {
      handled: true,
      message:
        "Usage: /review <pr-number>\nAfter review completes, run /review-post <pr-number> to publish the result as a PR comment.",
      clearInput: true,
    };
  }

  try {
    const diff = await services.fetchPRDiff(prNumber);
    host.send(
      `### NEW CODE REVIEW: PR #${prNumber} ###\n\n` +
        `IMPORTANT: This is a fresh review request for PR #${prNumber}. ` +
        `Please ignore any previous PR reviews or sub-agent findings in the chat history. ` +
        `Perform a comprehensive code review of the diff provided below. ` +
        `Spawn specialist sub-agents for different analysis categories ` +
        `(bug hunting, security, code style, infrastructure, readability) ` +
        `and synthesize their findings into a single final report. ` +
        `IMPORTANT: Do not checkout other branches or modify the local git repository. ` +
        `Avoid spawning multiple sub-agents for the same category.\n\n` +
        `\`\`\`diff\n${diff}\n\`\`\``,
      { displayContent: `Reviewing PR #${prNumber}` },
    );
    return {
      handled: true,
      message: `Running code review on PR #${prNumber}...`,
      clearInput: true,
    };
  } catch (err: unknown) {
    return {
      handled: true,
      message: `Error fetching PR #${prNumber}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      clearInput: true,
    };
  }
}

async function executeReviewPostCommand(
  args: string[],
  services: ReviewCommandServices,
): Promise<CommandResult> {
  const prNumber = Number.parseInt(args[0], 10);
  if (Number.isNaN(prNumber) || args.length < 2) {
    return {
      handled: true,
      message: "Usage: /review-post <pr-number> <comment body>",
      clearInput: true,
    };
  }

  const body = args.slice(1).join(" ");
  const result = await services.postPRComment(prNumber, body);
  return { handled: true, message: result, clearInput: true };
}
