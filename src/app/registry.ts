import type { CommandContext, CommandDefinition } from "./commands.js";

export class CommandRegistry {
  constructor(private commands: CommandDefinition[]) {}

  async dispatch(input: string, ctx: CommandContext): Promise<void> {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    for (const cmd of this.commands) {
      const args = cmd.parse(trimmedInput);
      if (args !== null) {
        await cmd.execute(args, ctx);
        return;
      }
    }

    if (trimmedInput.startsWith("/")) {
      ctx.showStatus(`Unknown command: ${trimmedInput}`, 4000);
      return;
    }

    // Fallthrough to standard LLM prompt
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
