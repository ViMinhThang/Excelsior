import { Command, CommandContext } from '../../types.js';
import { db } from '../../db/index.js';

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
      db.prepare('DELETE FROM observation').run();
      context.clearMessages();
      context.appendMessage('system', 'Database history reset.');
    },
  },
  {
    name: 'settings',
    description: 'Go to Settings screen',
    execute: async (args, context) => {
      context.navigate('settings');
    },
  },
  {
    name: 'review',
    description: 'Review pull requests targeting the current branch',
    execute: async (args, context) => {
      context.navigate('review');
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
