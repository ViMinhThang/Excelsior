import type { CommandContext, CommandDefinition } from "./commands.js";

export class CommandRegistry {
  constructor(private commands: CommandDefinition[]) {}

  async dispatch(input: string, ctx: CommandContext): Promise<void> {
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
        await cmd.execute(args, ctx);
        return;
      }
    }

    if (trimmedInput.startsWith("/")) {
      ctx.notify(`Unknown command: ${trimmedInput}`, "error");
      return;
    }

    await ctx.handlePrompt(trimmedInput);
  }

  helpText(): string {
    const lines = ["Commands:"];
    for (const cmd of this.commands) {
      lines.push(`${cmd.syntax} - ${cmd.description}`);
    }
    return lines.join("\n");
  }
}
