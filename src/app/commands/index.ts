import { listPrsCommand } from "./list-prs.js";
import { reviewCommand } from "./review.js";
import { settingsCommand } from "./settings.js";
import { helpCommand } from "./help.js";
import { modeCommand } from "./mode.js";
import { forgetCommand } from "./forget.js";
import type { CommandDefinition } from "../commands.js";
import { CommandRegistry } from "../registry.js";

export const defaultCommands: CommandDefinition[] = [
  listPrsCommand,
  reviewCommand,
  settingsCommand,
  helpCommand,
  modeCommand,
  forgetCommand,
];

export const registry = new CommandRegistry(defaultCommands);
