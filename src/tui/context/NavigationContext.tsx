import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { Screen } from '../../types.js';

interface NavigationContextType {
  currentScreen: Screen;
  navigate: (screen: Screen) => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider = ({ children }: { children: ReactNode }) => {
  const [history, setHistory] = useState<Screen[]>(['chat']);
  const historyRef = useRef(history);
  historyRef.current = history;

  const currentScreen = history[history.length - 1] || 'chat';

  const navigate = useCallback((screen: Screen) => {
    setHistory(prev => [...prev, screen]);
  }, []);

  const goBack = useCallback(() => {
    setHistory(prev => {
      if (prev.length > 1) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  return (
    <NavigationContext.Provider value={{ currentScreen, navigate, goBack }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
