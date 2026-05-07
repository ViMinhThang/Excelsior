import { describe, it, expect, vi } from "vitest";
import { getTextDelta, getToolName, getToolArgs, getToolResult, StreamPart } from "../types.js";

describe("StreamPart type helpers", () => {
  describe("getTextDelta", () => {
    it("extracts text from text-delta part", () => {
      const part: StreamPart = { type: "text-delta", text: "hello world", textDelta: "" };
      expect(getTextDelta(part)).toBe("hello world");
    });

    it("falls back to textDelta when text is missing", () => {
      const part: StreamPart = { type: "text-delta", textDelta: "fallback" };
      expect(getTextDelta(part)).toBe("fallback");
    });

    it("returns empty string for non-text part", () => {
      const part: StreamPart = { type: "tool-call", toolCallId: "abc", toolName: "readFile" };
      expect(getTextDelta(part)).toBe("");
    });
  });

  describe("getToolName", () => {
    it("extracts toolName from tool-call part", () => {
      const part: StreamPart = { type: "tool-call", toolCallId: "abc", toolName: "readFile" };
      expect(getToolName(part)).toBe("readFile");
    });

    it("falls back to name when toolName is missing", () => {
      const part: StreamPart = { type: "tool-call", toolCallId: "abc", name: "writeFile" };
      expect(getToolName(part)).toBe("writeFile");
    });

    it("returns 'unknown' for non-tool part", () => {
      const part: StreamPart = { type: "text-delta", text: "hello" };
      expect(getToolName(part)).toBe("unknown");
    });
  });

  describe("getToolArgs", () => {
    it("extracts input as JSON string", () => {
      const part: StreamPart = { type: "tool-call", toolCallId: "abc", input: { path: "/tmp/test" } };
      expect(getToolArgs(part)).toBe('{"path":"/tmp/test"}');
    });

    it("returns empty JSON for missing input", () => {
      const part: StreamPart = { type: "tool-call", toolCallId: "abc" };
      expect(getToolArgs(part)).toBe("{}");
    });

    it("returns empty JSON for non-tool part", () => {
      const part: StreamPart = { type: "text-delta", text: "" };
      expect(getToolArgs(part)).toBe("{}");
    });
  });

  describe("getToolResult", () => {
    it("extracts text output from tool-result", () => {
      const part: StreamPart = {
        type: "tool-result",
        toolCallId: "abc",
        output: { type: "text", value: "file contents" },
      };
      expect(getToolResult(part)).toBe("file contents");
    });

    it("JSONifies non-text output", () => {
      const part: StreamPart = {
        type: "tool-result",
        toolCallId: "abc",
        output: { type: "json", value: { key: "val" } },
      };
      const result = getToolResult(part);
      expect(result).toBe('{"type":"json","value":{"key":"val"}}');
    });

    it("returns fallback for missing output", () => {
      const part: StreamPart = { type: "tool-result", toolCallId: "abc" };
      expect(getToolResult(part)).toBe("No result returned");
    });

    it("returns empty string for non-tool-result part", () => {
      const part: StreamPart = { type: "text-delta", text: "" };
      expect(getToolResult(part)).toBe("");
    });

    it("returns error message for tool-error part", () => {
      const part: StreamPart = { type: "tool-error", toolCallId: "abc", error: "Connection refused" };
      expect(getToolResult(part)).toBe("[Error] Connection refused");
    });

    it("returns JSON error for tool-error part with object error", () => {
      const part: StreamPart = { type: "tool-error", toolCallId: "abc", error: { code: 500, msg: "timeout" } };
      expect(getToolResult(part)).toBe('[Error] {"code":500,"msg":"timeout"}');
    });
  });
});
