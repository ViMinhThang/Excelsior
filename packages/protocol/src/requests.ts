import type { CommandDefinition, AppSettings } from "./value.js";
import type { DeltaScope } from "./deltas.js";

export type AgentRequest =
  | { req: "catalog" }
  | { req: "sync"; scope: DeltaScope; cursor: number | null };

export type AgentResponse =
  | { req: "catalog"; ok: true; data: { commands: CommandDefinition[]; settings: AppSettings } }
  | { req: "sync"; ok: true; scope: DeltaScope; rev: number; snapshot: unknown }
  | { ok: false; error: string };
