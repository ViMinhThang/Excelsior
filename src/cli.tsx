import React from "react";
import { render } from "ink";

import { AppContent } from "./App.js";
import { AppProvider } from "./context/AppContext.js";
import { globalMemory } from "./mem/memory-manager.js";

const App = () => (
  <AppProvider>
    <AppContent />
  </AppProvider>
);

export async function startCLI(): Promise<void> {
  console.clear();
  await globalMemory.init();

  const instance = render(<App />);
  await instance.waitUntilExit();
}
