import { AgentClient } from "@excelsior/client";
import { setBridge } from "../actions/bridge.js";
import type { Store } from "../store/store.js";
import { setEngineState } from "../actions/status.js";
import { foldCatalog, foldMeta, foldRun, foldSession } from "./foldDeltas.js";
import { startEngine, type EngineHandle } from "./startEngine.js";

export interface EngineConnection {
  client: AgentClient;
  handle: EngineHandle;
}

let current: EngineConnection | null = null;
let boundStore: Store | null = null;

export function getEngineConnection(): EngineConnection | null {
  return current;
}

export function isEngineConnected(): boolean {
  return current !== null && !current.client.isClosed();
}

export function disconnectEngine(): void {
  if (!current) return;
  current.handle.stop();
  current.client.close();
  current = null;
  setBridge(null);
  if (boundStore) setEngineState(boundStore, "connecting");
}

export async function connectEngine(workspaceRoot: string, store: Store): Promise<EngineConnection> {
  boundStore = store;
  disconnectEngine();
  setEngineState(store, "connecting");
  const handle = startEngine(workspaceRoot);
  const client = new AgentClient(handle.transport);
  current = { client, handle };

  setBridge({
    command: (cmd) => client.command(cmd),
    onExit: (cb) => handle.onExit(() => cb()),
    stop: () => handle.stop(),
  });

  handle.onExit((code) => {
    if (current === null || current.client.isClosed()) return;
    const intentional = code === 0 && current.client.isClosed();
    if (!intentional) setEngineState(store, "crashed", `engine exited (code ${code ?? "unknown"})`);
  });

  fold(client, store);
  try {
    await client.connect();
    await ensureActiveSession(client, store);
    setEngineState(store, "connected");
  } catch (error) {
    setEngineState(store, "crashed", String(error));
  }
  return current;
}

export async function ensureActiveSession(client: AgentClient, store: Store): Promise<void> {
  const meta = store.getState().meta;
  if (meta.currentSessionId) return;
  const sessions = meta.sessions;
  if (sessions.length > 0) {
    const mostRecent = sessions[0];
    await client.command({ cmd: "session-switch", sessionId: mostRecent.id });
  } else {
    await client.command({ cmd: "session-create" });
  }
}
export async function restartEngine(store: Store): Promise<void> {
  const meta = store.getState().meta;
  await connectEngine(meta.workspace.rootPath || process.cwd(), store);
  if (current) {
    await current.client.syncAll();
    setEngineState(store, "connected");
  }
}

function fold(client: AgentClient, store: Store): void {
  client.subscribe("meta", (slice) => foldMeta(store, slice));
  client.subscribe("catalog", (slice) => foldCatalog(store, slice));
  client.subscribe("session", (slice) => foldSession(store, slice));
  client.subscribe("run", (slice) => foldRun(store, slice));
}
