import React from 'react';
import { render } from 'ink';
import { initDb, logError } from './db/index.js';
import App from './tui/app.js';

async function main() {
  // Initialize DB before starting UI
  initDb();

  // Render Ink App
  render(React.createElement(App));
}

main().catch((err) => {
  logError(`Bootstrap Error: ${err.message}`, err.stack);
  console.error(err);
});

process.on('uncaughtException', (err) => {
  logError(`Uncaught Exception: ${err.message}`, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError(`Unhandled Rejection: ${String(reason)}`);
  process.exit(1);
});
