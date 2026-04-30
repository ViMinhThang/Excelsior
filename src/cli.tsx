import React from "react";
import { render } from "ink";

import { AppContent } from "./App.js";
import { AppProvider } from "./context/AppContext.js";
import { createMemoryManager } from "./mem/memory-manager.js";

const App = ({ memory }: { memory: any }) => (
  <AppProvider memory={memory}>
    <AppContent />
  </AppProvider>
);

export async function startCLI(): Promise<void> {
  console.clear();
  const memory = createMemoryManager(process.cwd());

  const instance = render(<App memory={memory} />);
  await instance.waitUntilExit();
}
