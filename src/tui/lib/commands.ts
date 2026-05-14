import { appFeatureRegistry } from "../../features/index.js";
import type { FeatureRegistry } from "../../features/featureRegistry.js";
import type { FeatureRuntimeContext } from "../../features/featureTypes.js";

export const commands = appFeatureRegistry.getCommands();

export async function handleCommand(
  input: string,
  context: FeatureRuntimeContext,
  registry: FeatureRegistry = appFeatureRegistry,
): Promise<boolean> {
  if (!input.startsWith('/')) return false;

  const parts = input.slice(1).split(' ');
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const command = registry.findCommand(commandName);
  if (command) {
    await command.execute(args, context);
  } else {
    context.appendMessage('system', `Unknown command: /${commandName}. Type /help for a list of commands.`);
  }

  return true;
}
