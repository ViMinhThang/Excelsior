import { useState, useCallback, useRef } from "react";

export type ToastType = "info" | "success" | "error" | "warning";

export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

const DEFAULT_DURATION = 3000;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextIdRef = useRef(0);

  const showToast = useCallback(
    (text: string, type: ToastType = "info", duration: number = DEFAULT_DURATION) => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev, { id, text, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}
