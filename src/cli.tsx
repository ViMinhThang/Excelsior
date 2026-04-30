import React from "react";
import { render } from "ink";

import { AppContent } from "./App.js";
import { ConfigProvider } from "./context/ConfigContext.js";
import { UIProvider } from "./context/UIContext.js";
import { ReviewProvider } from "./context/ReviewContext.js";
import { createMemoryManager } from "./mem/memory-manager.js";

const App = ({ memory }: { memory: any }) => (
  <ConfigProvider memory={memory}>
    <UIProvider>
      <ReviewProvider>
        <AppContent />
      </ReviewProvider>
    </UIProvider>
  </ConfigProvider>
);

export async function startCLI(): Promise<void> {
  console.clear();
  const memory = createMemoryManager(process.cwd());

  const instance = render(<App memory={memory} />);
  await instance.waitUntilExit();
}
