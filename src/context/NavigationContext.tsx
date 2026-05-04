import React, { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import type { View, NavigationFacade } from "./ui-types.js";

const NavigationContext = createContext<NavigationFacade | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("MAIN");

  const value = useMemo<NavigationFacade>(
    () => ({
      view,
      setView,
    }),
    [view, setView]
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationFacade {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return context;
}