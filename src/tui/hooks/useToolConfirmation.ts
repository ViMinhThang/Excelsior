import { useState, useEffect, useCallback, useRef } from "react";
import { confirmBus } from "../../lib/runtime/confirmBus.js";
import type { ConfirmRequest } from "../../lib/runtime/confirmTypes.js";

export function useToolConfirmation() {
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
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
