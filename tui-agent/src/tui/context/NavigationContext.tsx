import React, { createContext, useContext, useState, ReactNode } from 'react';

type Screen = 'chat' | 'logs' | 'settings';

interface NavigationContextType {
  currentScreen: Screen;
  navigate: (screen: Screen) => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider = ({ children }: { children: ReactNode }) => {
  const [history, setHistory] = useState<Screen[]>(['chat']);
  
  const currentScreen = history[history.length - 1] || 'chat';

  const navigate = (screen: Screen) => {
    setHistory(prev => [...prev, screen]);
  };

  const goBack = () => {
    if (history.length > 1) {
      setHistory(prev => prev.slice(0, -1));
    }
  };

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
