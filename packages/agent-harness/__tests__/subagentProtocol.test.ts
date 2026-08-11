import { describe, expect, it, vi } from "vitest";
import type { ChildOutput } from "@excelsior/core";
import { ChildOutputLineReader, parseChildOutputLine } from "../src/subagent/protocol.js";

describe("parseChildOutputLine", () => {
  it("parses a valid text_delta output", () => {
    expect(parseChildOutputLine('{"type":"text_delta","delta":"hi"}')).toEqual({ type: "text_delta", delta: "hi" });
  });

  it("parses a valid tool_start output", () => {
    expect(parseChildOutputLine('{"type":"tool_start","toolCallId":"t1","toolName":"view","toolArgs":"{}"}')).toEqual({
      type: "tool_start",
      toolCallId: "t1",
      toolName: "view",
      toolArgs: "{}",
    });
  });

  it("parses a valid final output", () => {
    expect(parseChildOutputLine('{"type":"final","content":"done"}')).toEqual({ type: "final", content: "done" });
  });

  it("rejects malformed JSON", () => {
    expect(parseChildOutputLine("not json")).toBeNull();
  });

  it("rejects valid JSON that is not an object", () => {
    expect(parseChildOutputLine('"hello"')).toBeNull();
    expect(parseChildOutputLine("42")).toBeNull();
  });

  it("rejects output missing required fields", () => {
    expect(parseChildOutputLine('{"type":"text_delta"}')).toBeNull();
    expect(parseChildOutputLine('{"type":"final","content":123}')).toBeNull();
  });

  it("rejects unknown output types", () => {
    expect(parseChildOutputLine('{"type":"bogus","delta":"x"}')).toBeNull();
  });

  it("returns null for blank lines", () => {
    expect(parseChildOutputLine("")).toBeNull();
    expect(parseChildOutputLine("   ")).toBeNull();
  });
});

describe("ChildOutputLineReader", () => {
  it("emits one output per complete line", () => {
    const onOutput = vi.fn();
    const reader = new ChildOutputLineReader(onOutput);
    reader.push('{"type":"text_delta","delta":"a"}\n{"type":"text_delta","delta":"b"}\n');
    expect(onOutput).toHaveBeenCalledTimes(2);
  });

  it("handles chunks that split a line", () => {
    const onOutput = vi.fn();
    const reader = new ChildOutputLineReader(onOutput);
    reader.push('{"type":"text_delta","d');
    reader.push('elta":"a"}\n{"type":"final","con');
    reader.push('tent":"done"}\n');
    expect(onOutput).toHaveBeenCalledTimes(2);
  });

  it("handles CRLF line endings", () => {
    const onOutput = vi.fn();
    const reader = new ChildOutputLineReader(onOutput);
    reader.push('{"type":"text_delta","delta":"a"}\r\n{"type":"text_delta","delta":"b"}\r\n');
    expect(onOutput).toHaveBeenCalledTimes(2);
  });

  it("flushes a trailing line without a newline", () => {
    const onOutput = vi.fn();
    const reader = new ChildOutputLineReader(onOutput);
    reader.push('{"type":"text_delta","delta":"a"}\n{"type":"final","content":"done"}');
    expect(onOutput).toHaveBeenCalledTimes(1);
    reader.flush();
    expect(onOutput).toHaveBeenCalledTimes(2);
    expect(onOutput).toHaveBeenLastCalledWith({ type: "final", content: "done" });
  });

  it("skips blank and malformed lines", () => {
    const onOutput = vi.fn();
    const reader = new ChildOutputLineReader(onOutput);
    reader.push('\nnot json\n\n{"type":"text_delta","delta":"a"}\n');
    expect(onOutput).toHaveBeenCalledTimes(1);
  });

  it("types emitted outputs as ChildOutput", () => {
    const outputs: ChildOutput[] = [];
    const reader = new ChildOutputLineReader((output) => outputs.push(output));
    reader.push('{"type":"text_delta","delta":"a"}\n');
    reader.flush();
    expect(outputs.length).toBe(1);
  });
});
