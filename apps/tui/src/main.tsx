import { basename, resolve } from "node:path";
import { createElement } from "react";
import { createRoot } from "@opentui/react";
import { createCliRenderer } from "@opentui/core";
import { App } from "./app.js";
import { StoreProvider, createStore } from "./store/store.js";
import { createInitialState } from "./store/types.js";
import { connectEngine } from "./engine/connection.js";

async function main(): Promise<void> {
  const workspaceRoot = resolve(process.argv[2] ?? process.cwd());
  const store = createStore(
    createInitialState({
      id: basename(workspaceRoot),
      name: basename(workspaceRoot),
      rootPath: workspaceRoot,
    }),
  );

  await connectEngine(workspaceRoot, store);

  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  const root = createRoot(renderer);
  root.render(
    createElement(StoreProvider, { store }, createElement(App)),
  );
}

main().catch((error) => {
  console.error(`[excelsior-tui] bootstrap error: ${String(error)}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[excelsior-tui] unhandledRejection: ${String(reason)}`);
});
