import { CommandBuilder } from "./commandBuilder.js";
import type { AgentCommand } from "./types.js";

export function createRevertCommand(): AgentCommand {
  return new CommandBuilder("revert")
    .category("core")
    .description("Revert the latest turn's write/edit file changes")
    .default((_args, application) => application.revertLastTurn())
    .build();
}
