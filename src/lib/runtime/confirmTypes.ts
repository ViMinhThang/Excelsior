export type ConfirmEvents = {
  request: { callId: string; toolName: string; args: string };
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
    data: { callId: string; toolName: string; args: string },
  ): void;
}
