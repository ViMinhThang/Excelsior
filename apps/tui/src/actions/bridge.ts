import type { AgentCommand, CommandAck } from "@excelsior/protocol";

export interface ClientBridge {
  command(cmd: AgentCommand): Promise<CommandAck>;
  onExit(cb: () => void): () => void;
  stop(): void;
}

let bridge: ClientBridge | null = null;

export function setBridge(next: ClientBridge | null): void {
  bridge = next;
}

export function getBridge(): ClientBridge | null {
  return bridge;
}
