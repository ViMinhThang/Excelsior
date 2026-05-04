import React from "react";
import { render } from "ink";

import { AppContent } from "./App.js";
import { ConfigProvider } from "./context/ConfigContext.js";
import { UIProviders } from "./context/index.js";
import { ReviewProvider } from "./context/ReviewContext.js";
import { createMemoryManager } from "./mem/memory-manager.js";
import { initRegistry } from "./core/llm/registry/registry.js";


initRegistry();


const App = ({ memory }: { memory: any }) => (
  <ConfigProvider memory={memory}>
    <UIProviders>
      <ReviewProvider>
        <AppContent />
      </ReviewProvider>
    </UIProviders>
  </ConfigProvider>
);

export async function startCLI(): Promise<void> {
  console.clear();
  const memory = createMemoryManager(process.cwd());

  const instance = render(<App memory={memory} />);
  await instance.waitUntilExit();
}
