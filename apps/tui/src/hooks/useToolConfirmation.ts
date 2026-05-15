import { useCallback } from "react";
import type { ConfirmRequest } from "@excelsior/core";

export function useToolConfirmation(
  pending: ConfirmRequest | null,
  respondToConfirmation: (callId: string, approved: boolean) => void,
  approveAllConfirmations: () => void,
) {
  const approve = useCallback(() => {
    if (pending) {
      respondToConfirmation(pending.callId, true);
    }
  }, [pending, respondToConfirmation]);

  const approveAll = useCallback(() => {
    approveAllConfirmations();
  }, [approveAllConfirmations]);

  const deny = useCallback(() => {
    if (pending) {
      respondToConfirmation(pending.callId, false);
    }
  }, [pending, respondToConfirmation]);

  return { pending, approve, approveAll, deny };
}
