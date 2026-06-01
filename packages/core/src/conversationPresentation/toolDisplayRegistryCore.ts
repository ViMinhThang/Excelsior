import type { ToolDisplayConfig } from "./types.js";

export class ToolDisplayRegistry {
  private readonly configs = new Map<string, ToolDisplayConfig>();

  on(name: string, config: ToolDisplayConfig): this {
    this.configs.set(name, config);
    return this;
  }

  get(name: string): ToolDisplayConfig | undefined {
    return this.configs.get(name);
  }
}
