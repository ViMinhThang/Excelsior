import type {
  AgentCommand,
  AgentDelta,
  AgentResponse,
  CommandAck,
  Envelope,
  Transport,
} from "@excelsior/protocol";
import { makeEnvelope } from "@excelsior/protocol";
import { applyDelta, INITIAL_READ_MODEL, type ReadModel, type SliceKey } from "./readModel.js";

type SliceListener = (slice: never) => void;

export class AgentClient {
  private readonly transport: Transport;
  private readonly model: ReadModel;
  private readonly listeners = new Map<SliceKey, Set<SliceListener>>();
  private readonly sessionChangedListeners = new Set<(sessionId: string | null) => void>();
  private readonly errorListeners = new Set<(message: string) => void>();
  private readonly commandQueue: Array<(ack: CommandAck) => void> = [];
  private readonly requestQueue: Array<(response: AgentResponse) => void> = [];
  private syncedSessionId: string | null = null;
  private closed = false;
  private readonly unsubscribeTransport: () => void;

  constructor(transport: Transport) {
    this.transport = transport;
    this.model = structuredClone(INITIAL_READ_MODEL);
    this.unsubscribeTransport = transport.onMessage((message) => this.onMessage(message));
  }

  connect(): Promise<void> {
    return this.syncAll();
  }

  async syncAll(): Promise<void> {
    if (this.closed) return;
    await this.command({ cmd: "sync", scope: { kind: "meta" }, cursor: null });
    await this.requestCatalog();
    await this.syncSessionScopes();
  }

  subscribe<S extends SliceKey>(key: S, listener: (slice: ReadModel[S]) => void): () => void {
    const set = this.listeners.get(key) ?? new Set<SliceListener>();
    set.add(listener as SliceListener);
    this.listeners.set(key, set);
    return () => {
      set.delete(listener as SliceListener);
    };
  }

  getSlice<S extends SliceKey>(key: S): ReadModel[S] {
    return this.model[key];
  }

  command(cmd: AgentCommand): Promise<CommandAck> {
    if (this.closed) return Promise.resolve({ ok: false, error: "client closed" });
    return new Promise<CommandAck>((resolve) => {
      this.commandQueue.push(resolve);
      this.transport.send(makeEnvelope("command", cmd, 0));
    }).then((ack) => {
      if (cmd.cmd === "settings-save" && ack.ok) {
        return this.requestCatalog().then(() => ack);
      }
      return ack;
    });
  }

  onSessionChanged(cb: (sessionId: string | null) => void): () => void {
    this.sessionChangedListeners.add(cb);
    return () => this.sessionChangedListeners.delete(cb);
  }

  onError(cb: (message: string) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeTransport();
    for (const resolve of this.commandQueue.splice(0)) {
      resolve({ ok: false, error: "client closed" });
    }
    for (const resolve of this.requestQueue.splice(0)) {
      resolve({ ok: false, error: "client closed" });
    }
    this.listeners.clear();
    this.sessionChangedListeners.clear();
    this.errorListeners.clear();
    this.transport.close();
  }

  private onMessage(message: Envelope): void {
    if (this.closed) return;
    switch (message.type) {
      case "delta":
        this.onDelta(message.payload as AgentDelta);
        return;
      case "response":
        this.onResponse(message.payload as CommandAck | AgentResponse);
        return;
      default:
        return;
    }
  }

  private onDelta(wire: AgentDelta): void {
    if (wire.delta.kind === "error") {
      for (const listener of this.errorListeners) listener(wire.delta.message);
      return;
    }
    if (
      wire.scope.kind !== "meta" &&
      wire.scope.sessionId !== this.model.meta.currentSessionId
    ) {
      return;
    }
    const result = applyDelta(this.model, wire);
    if (result === "refresh-meta") {
      void this.command({ cmd: "sync", scope: { kind: "meta" }, cursor: null });
      void this.requestCatalog();
      return;
    }
    if (result) {
      this.fire(result);
      if (result === "meta") this.checkSessionChange();
    }
  }

  private onResponse(payload: CommandAck | AgentResponse): void {
    if ("req" in payload) {
      const resolve = this.requestQueue.shift();
      if (resolve) resolve(payload);
    } else {
      const resolve = this.commandQueue.shift();
      if (resolve) resolve(payload);
    }
  }

  private checkSessionChange(): void {
    const id = this.model.meta.currentSessionId;
    if (id === this.syncedSessionId) return;
    this.syncedSessionId = id;
    this.model.session = null;
    this.model.run = null;
    this.fire("session");
    this.fire("run");
    for (const listener of this.sessionChangedListeners) listener(id);
    if (id) void this.syncSessionScopes();
  }

  private async syncSessionScopes(): Promise<void> {
    const id = this.model.meta.currentSessionId;
    if (!id) return;
    await this.command({ cmd: "sync", scope: { kind: "session", sessionId: id }, cursor: null });
    await this.command({ cmd: "sync", scope: { kind: "run", sessionId: id }, cursor: null });
  }

  private async requestCatalog(): Promise<void> {
    if (this.closed) return;
    const response = await new Promise<AgentResponse>((resolve) => {
      this.requestQueue.push(resolve);
      this.transport.send(makeEnvelope("request", { req: "catalog" }, 0));
    });
    if (response.ok && response.req === "catalog") {
      this.model.catalog = {
        commands: response.data.commands,
        settings: response.data.settings,
      };
      this.fire("catalog");
    }
  }

  private fire(key: SliceKey): void {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const listener of set) listener(this.model[key] as never);
  }
}
