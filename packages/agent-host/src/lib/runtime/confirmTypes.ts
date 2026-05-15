import type { DiffAction } from "../diff/unifiedDiff.js";

export type ConfirmRequest = {
  callId: string;
  toolName: string;
  args: string;
  diff?: string;
  filePath?: string;
  action?: DiffAction;
};

export type ConfirmEvents = {
  request: ConfirmRequest;
  response: { callId: string; approved: boolean };
};

export interface ConfirmBus {
  getListenerCount(event: "request"): number;
  on(
    event: "response",
    handler: (resp: { callId: string; approved: boolean }) => void,
  ): () => void;
  emit(
    event: "request",
    data: ConfirmRequest,
  ): void;
}
