import type { Agent } from "./agent.js";

const registry = new Map<string, Agent<any>>();

export const AgentRegistry = {
  register(name: string, agent: Agent<any>): void {
    registry.set(name, agent);
  },

  get(name: string): Agent<any> | undefined {
    return registry.get(name);
  },

  list(): string[] {
    return Array.from(registry.keys());
  },

  clear(): void {
    registry.clear();
  },
};
