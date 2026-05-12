import { useState, useEffect, useCallback } from "react";
import { confirmBus } from "../lib/confirmBus.js";

type PendingRequest = {
  callId: string;
  toolName: string;
  args: string;
};

let isSessionAutoApproved = false;

export function useToolConfirmation() {
  const [pending, setPending] = useState<PendingRequest | null>(null);

  useEffect(() => {
    return confirmBus.on("request", (req) => {
      if (isSessionAutoApproved) {
        confirmBus.emit("response", { callId: req.callId, approved: true });
        return;
      }
      setPending(req);
    });
  }, []);

  const approve = useCallback(() => {
    if (pending) {
      confirmBus.emit("response", { callId: pending.callId, approved: true });
      setPending(null);
    }
  }, [pending]);

  const approveAll = useCallback(() => {
    isSessionAutoApproved = true;
    if (pending) {
      confirmBus.emit("response", { callId: pending.callId, approved: true });
      setPending(null);
    }
  }, [pending]);

  const deny = useCallback(() => {
    if (pending) {
      confirmBus.emit("response", { callId: pending.callId, approved: false });
      setPending(null);
    }
  }, [pending]);

  return { pending, approve, approveAll, deny };
}
