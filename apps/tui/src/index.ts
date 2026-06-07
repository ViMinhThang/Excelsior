import { createElement } from "react";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import {
  initializeAgentHostRuntime,
  logAgentHostError,
} from "@excelsior/agent-host";
import App from "./app.js";

async function main() {
  initializeAgentHostRuntime();
  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  createRoot(renderer).render(createElement(App));
}

main().catch((err) => {
  logAgentHostError(`Bootstrap Error: ${err.message}`, err.stack);
  console.error(err);
});

process.on("uncaughtException", (err) => {
  logAgentHostError(`Uncaught Exception: ${err.message}`, err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logAgentHostError(`Unhandled Rejection: ${String(reason)}`);
  process.exit(1);
});