import type { CommandDeps } from "./contexts.js";

export interface CommandDefinition<T extends Record<string, any> = {}> {
  name: string;
  syntax: string;
  description: string;
  parse(args: string): T | null;
  execute(args: T, deps: CommandDeps): Promise<void>;
}
