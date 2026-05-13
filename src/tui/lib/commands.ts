import { Command, CommandContext } from '../../types.js';
import { fetchPRDiff } from '../../utils/github.js';

export const commands: Command[] = [
  {
    name: 'help',
    description: 'List all available commands',
    execute: async (args, context) => {
      const helpText = commands
        .map((cmd) => `/${cmd.name} - ${cmd.description}`)
        .join('\n');
      context.appendMessage('system', `Available commands:\n${helpText}`);
    },
  },
  {
    name: 'clear',
    description: 'Clear chat messages from the screen',
    execute: async (args, context) => {
      context.clearMessages();
      context.appendMessage('system', 'Chat history cleared from UI.');
    },
  },
  {
    name: 'reset',
    description: 'Delete all conversation history from database',
    execute: async (args, context) => {
      context.deleteAllSessions();
      context.clearMessages();
      context.appendMessage('system', 'Database history reset.');
    },
  },
  {
    name: 'settings',
    description: 'View or set configuration settings (e.g. apiKey, githubToken)',
    execute: async (args, context) => {
      context.navigate('settings');
    },
  },
  {
    name: 'review',
    description: 'Review a pull request by number (e.g. /review 42)',
    execute: async (args, context) => {
      const prNumber = parseInt(args[0], 10);
      if (isNaN(prNumber)) {
        context.appendMessage('system', 'Usage: /review <pr-number>\nAfter review completes, run /review-post <pr-number> to publish the result as a PR comment.');
        return;
      }

      context.appendMessage('system', `Fetching PR #${prNumber} diff...`);

      try {
        const diff = await fetchPRDiff(prNumber);

        context.appendMessage('system', `Running code review on PR #${prNumber}...`);

        const reviewInstruction =
          `Review PR #${prNumber}\n\n` +
          `I need you to perform a comprehensive code review of this PR diff. ` +
          `Spawn specialist sub-agents for different analysis categories ` +
          `(bug hunting, security, code style, infrastructure, readability) ` +
          `and synthesize their findings.\n\n` +
          `\`\`\`diff\n${diff}\n\`\`\``;

        context.send(reviewInstruction);
      } catch (err: unknown) {
        context.appendMessage('system', `Error fetching PR #${prNumber}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  {
    name: 'session',
    description: 'Manage sessions (list, new, open, rename, delete)',
    execute: async (args, context) => {
      const sub = args[0]?.toLowerCase();
      switch (sub) {
        case 'new': {
          const title = args.slice(1).join(' ') || 'Untitled';
          context.createSession(title);
          context.appendMessage('system', `Created session: "${title}".`);
          break;
        }
        case 'open': {
          const id = args[1];
          if (!id) {
            context.appendMessage('system', 'Usage: /session open <session-id>');
            break;
          }
          context.switchSession(id);
          context.appendMessage('system', `Switched to session ${id.slice(0, 8)}….`);
          break;
        }
        case 'rename': {
          const id = args[1];
          const title = args.slice(2).join(' ');
          if (!id || !title) {
            context.appendMessage('system', 'Usage: /session rename <session-id> <title>');
            break;
          }
          context.renameSession(id, title);
          context.appendMessage('system', `Renamed session to "${title}".`);
          break;
        }
        case 'delete': {
          const id = args[1];
          if (!id) {
            context.appendMessage('system', 'Usage: /session delete <session-id>');
            break;
          }
          context.deleteSession(id);
          context.appendMessage('system', `Deleted session ${id.slice(0, 8)}….`);
          break;
        }
        default: {
          const sessions = context.listSessions();
          const currentId = context.currentSessionId;
          if (sessions.length === 0) {
            context.appendMessage('system', 'No sessions in this workspace.');
          } else {
            const lines = sessions.map((s) => {
              const isCurrent = s.id === currentId;
              const prefix = isCurrent ? ` ${"*"} ` : "   ";
              const shortId = s.id.slice(0, 8);
              const label = s.title || "untitled";
              return `${prefix}${shortId}…  ${label}`;
            });
            context.appendMessage('system', `Sessions:\n${lines.join("\n")}\n\nUsage: /session new <title> | /session open <id> | /session rename <id> <title> | /session delete <id>`);
          }
        }
      }
    },
  },
  {
    name: 'review-post',
    description: 'Post a comment to a PR (e.g. /review-post 42 "Looks good")',
    execute: async (args, context) => {
      const prNumber = parseInt(args[0], 10);
      if (isNaN(prNumber) || args.length < 2) {
        context.appendMessage('system', 'Usage: /review-post <pr-number> <comment body>');
        return;
      }
      const body = args.slice(1).join(' ');
      context.appendMessage('system', `Posting comment to PR #${prNumber}...`);
      const result = await context.postComment(prNumber, body);
      context.appendMessage('system', result);
    },
  },
];

export async function handleCommand(input: string, context: CommandContext): Promise<boolean> {
  if (!input.startsWith('/')) return false;

  const parts = input.slice(1).split(' ');
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const command = commands.find((c) => c.name === commandName);
  if (command) {
    await command.execute(args, context);
  } else {
    context.appendMessage('system', `Unknown command: /${commandName}. Type /help for a list of commands.`);
  }

  return true;
}
