import { useCallback, useEffect, useRef } from "react";
import {
  createDoubleEscapeCancelState,
  handleDoubleEscapeCancel,
  resetDoubleEscapeCancel,
} from "@excelsior/core";

export function useDoubleEscapeCancel(isLoading: boolean, cancel: () => void) {
  const escapeCancelState = useRef(createDoubleEscapeCancelState());

  const requestTurnCancel = useCallback(() => {
    handleDoubleEscapeCancel({
      state: escapeCancelState.current,
      isLoading,
      now: Date.now(),
      cancel,
    });
  }, [cancel, isLoading]);

  useEffect(() => {
    if (!isLoading) resetDoubleEscapeCancel(escapeCancelState.current);
  }, [isLoading]);

  return {
    requestTurnCancel,
  };
}
