import { randomUUID } from "crypto";

type ConfirmRequest = {
  callId: string;
  toolName: string;
  args: string;
};

type ConfirmListener = {
  onRequest: (req: ConfirmRequest) => void;
};

export function createConfirmBus() {
  const listeners = new Set<ConfirmListener>();
  const pending = new Map<string, (approved: boolean) => void>();

  return {
    subscribe(listener: ConfirmListener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    requestConfirmation(req: ConfirmRequest): Promise<boolean> {
      const callId = req.callId || randomUUID();
      listeners.forEach((l) => l.onRequest({ ...req, callId }));
      return new Promise<boolean>((resolve) => {
        pending.set(callId, resolve);
      });
    },

    respond(callId: string, approved: boolean) {
      const resolve = pending.get(callId);
      if (resolve) {
        pending.delete(callId);
        resolve(approved);
      }
    },

    get listenerCount() {
      return listeners.size;
    },
  };
}

export const confirmBus = createConfirmBus();

