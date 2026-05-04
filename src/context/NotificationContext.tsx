import React, { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import type { Notification, NotificationFacade, NotificationType } from "./ui-types.js";

const NotificationContext = createContext<NotificationFacade | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<Notification | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearNotification = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setNotification(null);
  }, []);

  const notify = useCallback(
    (message: string, type: NotificationType = "info", duration?: number) => {
      clearNotification();
      setNotification({ message, type });

      const actualDuration = duration ?? (type === "error" ? 0 : 5000);

      if (actualDuration > 0) {
        timeoutRef.current = setTimeout(() => {
          setNotification(null);
        }, actualDuration);
      }
    },
    [clearNotification]
  );

  const value = useMemo<NotificationFacade>(
    () => ({
      notification,
      notify,
      clearNotification,
    }),
    [notification, notify, clearNotification]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationFacade {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
}