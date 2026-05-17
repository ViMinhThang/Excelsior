import { createElement } from "react";
import { render } from "ink";
import {
  initializeAgentHostRuntime,
  logAgentHostError,
} from "@excelsior/agent-host";
import App from "./app.js";

async function main() {
  initializeAgentHostRuntime();
  render(createElement(App));
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
