import type { CommandDeps } from "./contexts.js";
import type { CommandDefinition } from "./commands.js";

export class CommandRegistry {
  constructor(private commands: CommandDefinition[]) {}

  async dispatch(input: string, deps: CommandDeps): Promise<void> {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    const [commandPart, ...rest] = trimmedInput.split(/\s+/);
    const argsString = rest.join(" ");

    const cmd = this.commands.find(
      (c) => c.syntax.split(/\s+/)[0] === commandPart,
    );

    if (cmd) {
      const args = cmd.parse(argsString);
      if (args !== null) {
        await cmd.execute(args, deps);
        return;
      }
    }

    if (trimmedInput.startsWith("/")) {
      deps.ui.notify(`Unknown command: ${trimmedInput}`, "error");
      return;
    }

    await deps.actions.handlePrompt(trimmedInput);
  }

  helpText(): string {
    const lines = ["Commands:"];
    for (const cmd of this.commands) {
      lines.push(`${cmd.syntax} - ${cmd.description}`);
    }
    return lines.join("\n");
  }
}
