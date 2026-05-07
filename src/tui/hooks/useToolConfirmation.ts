import { useState, useEffect, useCallback } from "react";
import { confirmBus } from "../../agent/tools/confirm.js";

type PendingRequest = {
  callId: string;
  toolName: string;
  args: string;
};

export function useToolConfirmation() {
  const [pending, setPending] = useState<PendingRequest | null>(null);

  useEffect(() => {
    return confirmBus.subscribe({
      onRequest: (req) => setPending(req),
    });
  }, []);

  const approve = useCallback(() => {
    if (pending) {
      confirmBus.respond(pending.callId, true);
      setPending(null);
    }
  }, [pending]);

  const deny = useCallback(() => {
    if (pending) {
      confirmBus.respond(pending.callId, false);
      setPending(null);
    }
  }, [pending]);

  return { pending, approve, deny };
}
