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

    emitRequest(req: ConfirmRequest) {
      listeners.forEach((l) => l.onRequest(req));
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

    _pending: pending,
  };
}

export const confirmBus = createConfirmBus();

export function confirmable(originalTool: any, bus: ReturnType<typeof createConfirmBus>) {
  const originalExecute = originalTool.execute;

  return {
    description: originalTool.description,
    inputSchema: originalTool.inputSchema,
    execute: async (input: any, options?: any) => {
      if (bus.listenerCount === 0) {
        return originalExecute(input, options);
      }

      const callId = randomUUID();
      bus.emitRequest({
        callId,
        toolName: originalTool.description?.split(" ")[0] ?? "tool",
        args: JSON.stringify(input),
      });

      const approved = await new Promise<boolean>((resolve) => {
        bus._pending.set(callId, resolve);
      });

      if (!approved) {
        return "Denied by user.";
      }

      return originalExecute(input, options);
    },
  };
}
