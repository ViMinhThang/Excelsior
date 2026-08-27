import type { AgentMode, AppSettings, SendOptions, Session, AskQuestionResponse, CommandResult } from "./value.js";
import type { DeltaScope } from "./deltas.js";

export type AgentCommand =
  | { cmd: "send"; content: string; mode?: AgentMode; options?: SendOptions }
  | { cmd: "cancel" }
  | { cmd: "execute-command"; input: string }
  | { cmd: "session-create"; title?: string }
  | { cmd: "session-switch"; sessionId: string }
  | { cmd: "session-delete"; sessionId: string }
  | { cmd: "session-rename"; sessionId: string; title: string }
  | { cmd: "session-delete-all" }
  | { cmd: "mode-set"; mode: AgentMode }
  | { cmd: "mode-toggle" }
  | { cmd: "settings-save"; patch: Partial<AppSettings> }
  | { cmd: "confirm-respond"; callId: string; approved: boolean }
  | { cmd: "confirm-approve-all" }
  | { cmd: "question-respond"; response: AskQuestionResponse }
  | { cmd: "messages-clear" }
  | { cmd: "sync"; scope: DeltaScope; cursor: number | null };

export type CommandAck =
  | { ok: true; result?: { kind: "command-result"; result: CommandResult } }
  | { ok: true; result?: { kind: "session"; session: Session } }
  | { ok: true; result?: { kind: "mode"; mode: AgentMode } }
  | { ok: true; result?: { kind: "busy" } }
  | { ok: true; result?: { kind: "synced"; scope: DeltaScope; rev: number } }
  | { ok: false; error: string };
