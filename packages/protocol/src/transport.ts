import { createInterface } from "node:readline";
import { makeEnvelope, isEnvelope, type Envelope } from "./envelope.js";

export interface Transport {
  send(message: Envelope): void;
  onMessage(listener: (message: Envelope) => void): () => void;
  close(): void;
}

function cloneViaJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class InProcessEndpoint implements Transport {
  private peer: InProcessEndpoint | null = null;
  private readonly listeners = new Set<(message: Envelope) => void>();
  private seq = 0;
  private closed = false;

  constructor(peer: InProcessEndpoint | null = null) {
    this.peer = peer;
  }

  send(message: Envelope): void {
    if (this.closed) return;
    this.seq += 1;
    const stamped = cloneViaJson({ ...message, seq: this.seq });
    this.peer?.deliver(stamped);
  }

  deliver(message: Envelope): void {
    for (const listener of this.listeners) listener(message);
  }

  onMessage(listener: (message: Envelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}

export function createInProcessTransport(): { a: Transport; b: Transport } {
  const a = new InProcessEndpoint();
  const b = new InProcessEndpoint(a);
  a["peer"] = b;
  return { a, b };
}

export interface StdioTransportOptions {
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
}

export function createStdioTransport(
  options: StdioTransportOptions = {},
): Transport {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const listeners = new Set<(message: Envelope) => void>();
  let seq = 0;
  let closed = false;

  const readline = createInterface({
    input: stdin as NodeJS.ReadableStream,
    crlfDelay: Infinity,
  });

  readline.on("line", (line) => {
    if (closed) return;
    if (!line.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = undefined;
    }
    if (!isEnvelope(parsed)) {
      seq += 1;
      const errorEnvelope = makeEnvelope(
        "response",
        { ok: false, error: "malformed envelope" },
        seq,
      );
      for (const listener of listeners) listener(errorEnvelope);
      return;
    }
    for (const listener of listeners) listener(parsed);
  });

  return {
    send(message: Envelope): void {
      if (closed) return;
      seq += 1;
      const stamped = { ...message, seq };
      stdout.write(`${JSON.stringify(stamped)}\n`);
    },
    onMessage(listener: (message: Envelope) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close(): void {
      if (closed) return;
      closed = true;
      readline.close();
      listeners.clear();
    },
  };
}
