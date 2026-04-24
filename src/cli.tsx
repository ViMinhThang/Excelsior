import React from "react";
import { render } from "ink";
import { AppProvider } from "./context/AppContext.js";
import { AppContent } from "./App.js";
import { globalMemory } from "./mem/memory-manager.js";



const App = () => (
  <AppProvider>
    <AppContent />
  </AppProvider>
);

export async function startCLI() {
  console.clear();
  
  try {
    // Initialize long-term memory (SQLite)
    await globalMemory.init();
    
    // Render the TUI
    render(<App />);
  } catch (error) {
    console.error("Failed to start Excelsior CLI:", error);
    process.exit(1);
  }
}

// Start the application
startCLI();
