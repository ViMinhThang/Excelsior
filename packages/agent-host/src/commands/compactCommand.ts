import { CommandBuilder } from "./commandBuilder.js";
import type { AgentCommand } from "./types.js";

export function createCompactCommand(): AgentCommand {
  return new CommandBuilder("compact")
    .category("core")
    .description("Manually summarize and compact the conversation history to free up context")
    .default(async (_args, application) => {
      try {
        await application.compactCurrentSession("manual");
        return {
          handled: true,
          message: "Conversation history successfully compacted.",
          clearInput: true,
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          handled: true,
          message: `Failed to compact conversation: ${msg}`,
          clearInput: true,
        };
      }
    })
    .build();
}
