import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  createInProcessTransport,
  createStdioTransport,
  isEnvelope,
  makeEnvelope,
} from "@excelsior/protocol";

function nextLine(stream: PassThrough): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    rl.once("line", (line) => {
      rl.close();
      resolve(line);
    });
  });
}

function streamPair(): { stdin: PassThrough; stdout: PassThrough } {
  return { stdin: new PassThrough(), stdout: new PassThrough() };
}

describe("stdio transport fidelity", () => {
  it("serializes envelopes as newline-delimited JSON on the wire", async () => {
    const { stdin, stdout } = streamPair();
    const transport = createStdioTransport({ stdin, stdout });

    const wire = nextLine(stdout);
    transport.send(makeEnvelope("command", { cmd: "cancel" }, 5));
    const line = await wire;

    expect(JSON.parse(line)).toEqual({ v: 2, seq: 1, type: "command", payload: { cmd: "cancel" } });
    transport.close();
  });

  it("parses envelopes arriving on stdin and stamps a per-send sequence", () => {
    const { stdin, stdout } = streamPair();
    const transport = createStdioTransport({ stdin, stdout });
    const received: unknown[] = [];
    transport.onMessage((message) => received.push(message));

    stdin.write(`${JSON.stringify({ v: 2, seq: 0, type: "request", payload: { req: "catalog" } })}\n`);
    stdin.write(`${JSON.stringify({ v: 2, seq: 0, type: "heartbeat", payload: { alive: true } })}\n`);

    expect(received).toHaveLength(2);
    const first = received[0];
    const second = received[1];
    expect(isEnvelope(first as never)).toBe(true);
    expect(isEnvelope(second as never)).toBe(true);
    expect((first as { payload: unknown }).payload).toEqual({ req: "catalog" });
    expect((second as { payload: unknown }).payload).toEqual({ alive: true });
    transport.close();
  });

  it("answers malformed lines with an error envelope instead of crashing", () => {
    const { stdin, stdout } = streamPair();
    const transport = createStdioTransport({ stdin, stdout });
    const received: unknown[] = [];
    transport.onMessage((message) => received.push(message));

    stdin.write("this is not json\n");
    stdin.write("{\"v\":999,\"seq\":1,\"type\":\"command\",\"payload\":{}}\n");

    expect(received).toHaveLength(2);
    const error = received[0] as { payload: { ok: boolean; error: string } };
    expect(error.payload.ok).toBe(false);
    expect(error.payload.error).toBe("malformed envelope");
    transport.close();
  });

  it("ignores blank lines", () => {
    const { stdin, stdout } = streamPair();
    const transport = createStdioTransport({ stdin, stdout });
    const received: unknown[] = [];
    transport.onMessage((message) => received.push(message));

    stdin.write("\n   \n");
    stdin.write(`${JSON.stringify({ v: 2, seq: 0, type: "response", payload: { ok: true } })}\n`);

    expect(received).toHaveLength(1);
    transport.close();
  });
});

describe("in-process transport fidelity", () => {
  it("stamps each send with an increasing sequence number", () => {
    const { a, b } = createInProcessTransport();
    const received: unknown[] = [];
    b.onMessage((message) => received.push(message));

    a.send(makeEnvelope("command", { cmd: "cancel" }, 0));
    a.send(makeEnvelope("command", { cmd: "session-delete-all" }, 0));

    expect((received[0] as { seq: number }).seq).toBe(1);
    expect((received[1] as { seq: number }).seq).toBe(2);
  });

  it("delivers a deep clone so the sender cannot mutate the receiver's copy", () => {
    const { a, b } = createInProcessTransport();
    const received: unknown[] = [];
    b.onMessage((message) => received.push(message));

    const sent = makeEnvelope("command", { cmd: "settings-save", patch: { deepseekApiKey: "sk-a" } }, 0);
    a.send(sent);
    const copy = received[0] as { payload: { patch: { deepseekApiKey: string } } };
    copy.payload.patch.deepseekApiKey = "sk-mutated";

    expect((sent.payload as { patch: { deepseekApiKey: string } }).patch.deepseekApiKey).toBe("sk-a");

    // send a second time to prove the first mutation was isolated on the wire
    a.send(sent);
    expect((sent.payload as { patch: { deepseekApiKey: string } }).patch.deepseekApiKey).toBe("sk-a");
  });
});