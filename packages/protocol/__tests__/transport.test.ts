import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import {
  createInProcessTransport,
  createStdioTransport,
  type Transport,
  type Envelope,
} from "@excelsior/protocol";

function collectMessages(transport: Transport): Envelope[] {
  const received: Envelope[] = [];
  transport.onMessage((message) => received.push(message));
  return received;
}

describe("in-process transport", () => {
  it("delivers messages between ends with monotonically increasing seq", () => {
    const { a, b } = createInProcessTransport();
    const fromA = collectMessages(b);
    const fromB = collectMessages(a);

    a.send({ v: 2, seq: 0, type: "command", payload: { cmd: "cancel" } });
    a.send({ v: 2, seq: 0, type: "command", payload: { cmd: "mode-toggle" } });
    b.send({ v: 2, seq: 0, type: "request", payload: { req: "catalog" } });

    expect(fromA.map((message) => message.payload)).toEqual([
      { cmd: "cancel" },
      { cmd: "mode-toggle" },
    ]);
    expect(fromB.map((message) => message.payload)).toEqual([
      { req: "catalog" },
    ]);
    expect(fromA.map((message) => message.seq)).toEqual([1, 2]);
  });

  it("deep-clones payloads (serializability proof)", () => {
    const { a, b } = createInProcessTransport();
    const received = collectMessages(b);

    const payload = { nested: { list: [1, 2, 3], flag: true } };
    a.send({ v: 2, seq: 0, type: "command", payload });
    payload.nested.list.push(4);

    expect(received[0].payload).toEqual({ nested: { list: [1, 2, 3], flag: true } });
  });

  it("stops delivering after close and unsubscribes cleanly", () => {
    const { a, b } = createInProcessTransport();
    const received = collectMessages(b);

    const unsubscribe = b.onMessage(() => {
      throw new Error("unsubscribed listener must not be called");
    });
    unsubscribe();
    a.send({ v: 2, seq: 0, type: "delta", payload: {} });
    expect(received).toHaveLength(1);

    b.close();
    a.send({ v: 2, seq: 0, type: "delta", payload: {} });
    expect(received).toHaveLength(1);
  });
});

describe("stdio transport", () => {
  function paired(): { a: Transport; b: Transport } {
    const aToB = new PassThrough();
    const bToA = new PassThrough();
    const a = createStdioTransport({ stdin: bToA, stdout: aToB });
    const b = createStdioTransport({ stdin: aToB, stdout: bToA });
    return { a, b };
  }

  it("delivers newline-delimited JSON between paired streams", async () => {
    const { a, b } = paired();
    const fromA = collectMessages(b);

    a.send({ v: 2, seq: 0, type: "command", payload: { cmd: "cancel" } });
    a.send({ v: 2, seq: 0, type: "request", payload: { req: "catalog" } });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fromA.map((message) => message.payload)).toEqual([
      { cmd: "cancel" },
      { req: "catalog" },
    ]);
    expect(fromA.map((message) => message.seq)).toEqual([1, 2]);
  });

  it("emits an error envelope for malformed lines", async () => {
    const source = new PassThrough();
    const transport = createStdioTransport({
      stdin: source,
      stdout: new PassThrough(),
    });
    const received = collectMessages(transport);

    source.write("not-json\n");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("response");
    expect(received[0].payload).toEqual({ ok: false, error: "malformed envelope" });
    expect(received[0].seq).toBe(1);
  });

  it("parses malformed input into an error response envelope", async () => {
    const source = new PassThrough();
    const transport = createStdioTransport({
      stdin: source,
      stdout: new PassThrough(),
    });
    const received = collectMessages(transport);

    source.write("not-json\n");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("response");
    expect(received[0].payload).toEqual({ ok: false, error: "malformed envelope" });
    expect(received[0].seq).toBe(1);
  });

  it("accepts only valid envelopes", async () => {
    const source = new PassThrough();
    const transport = createStdioTransport({
      stdin: source,
      stdout: new PassThrough(),
    });
    const received = collectMessages(transport);

    source.write(`${JSON.stringify({ v: 2, seq: 1, type: "delta", payload: {} })}\n`);
    source.write(`${JSON.stringify({ v: 9, seq: 1, type: "delta", payload: {} })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe("delta");
    expect(received[1].type).toBe("response");
  });
});
