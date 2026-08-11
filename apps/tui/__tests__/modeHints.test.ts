import { describe, expect, it } from "vitest";
import { chatModeRegistry } from "../src/chatModes/registry.js";
import type { ChatModeHintContext } from "../src/chatModes/types.js";

function getHint(ctx: ChatModeHintContext): string {
  return chatModeRegistry[ctx.chatMode].getHint(ctx);
}

describe("chat mode hints", () => {
  it("does not advertise the removed Ctrl+K command palette shortcut", () => {
    const hint = getHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      toolCallCount: 1,
      toolsExpanded: false,
    });
    expect(hint).toContain("Ctrl+O expand tools");
    expect(hint).not.toContain("Ctrl+K");
    expect(hint).not.toContain("command palette");
  });

  it("uses panel mode hints", () => {
    expect(getHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: "session.picker",
      toolCallCount: 0,
      toolsExpanded: false,
    })).toBe("Up/Down select | Enter open | Esc close");
  });

  it("shows question answer hints while a question is pending", () => {
    expect(getHint({
      chatMode: "input",
      isLoading: true,
      hasPending: true,
      pendingKind: "question",
      activePanelId: null,
      toolCallCount: 0,
      toolsExpanded: false,
    })).toBe("Enter answer | type option number or custom answer | Esc cancel");
  });

  it("shows double Escape cancellation while a turn is running", () => {
    expect(getHint({
      chatMode: "input",
      isLoading: true,
      hasPending: false,
      activePanelId: null,
      toolCallCount: 0,
      toolsExpanded: false,
    })).toBe("Esc twice cancel");
  });
});
