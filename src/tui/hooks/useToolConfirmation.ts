import { useState, useEffect, useCallback, useRef } from "react";
import { confirmBus } from "../../lib/runtime/confirmBus.js";

type PendingRequest = {
  callId: string;
  toolName: string;
  args: string;
};

export function useToolConfirmation() {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [isAutoApproved, setIsAutoApproved] = useState(false);
  const isAutoApprovedRef = useRef(isAutoApproved);
  isAutoApprovedRef.current = isAutoApproved;

  useEffect(() => {
    return confirmBus.on("request", (req) => {
      if (isAutoApprovedRef.current) {
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
    setIsAutoApproved(true);
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
