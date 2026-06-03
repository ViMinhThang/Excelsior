import { describe, expect, it } from "vitest";
import {
  chatModeRegistry,
  getChatModeHint,
} from "../src/chatModes/registry.js";

describe("chat mode hints", () => {
  it("shows Ctrl+K for command palette and never Ctrl+O", () => {
    const hint = getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
      commandCount: 1,
      commandsExpanded: false,
    });
    expect(hint).toContain("Ctrl+K");
    expect(hint).not.toContain("Ctrl+O");
  });

  it("uses panel and sub-agent mode hints", () => {
    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: "session.picker",
      subAgentCount: 0,
      commandCount: 0,
      commandsExpanded: false,
    })).toBe("Up/Down select | Enter open | Esc close");

    expect(getChatModeHint({
      chatMode: "subagent-picker",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
      commandCount: 1,
      commandsExpanded: false,
    })).toBe("Enter view detail | \u2191\u2193 navigate | Esc close");

    expect(getChatModeHint({
      chatMode: "subagent-detail",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
      commandCount: 1,
      commandsExpanded: true,
    })).toBe("Esc back to list");
  });

  it("delegates mode-specific hints through the chat mode registry", () => {
    const input = {
      chatMode: "subagent-detail" as const,
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
      commandCount: 1,
      commandsExpanded: true,
    };

    expect(getChatModeHint(input)).toBe(chatModeRegistry["subagent-detail"].getHint(input));
  });

  it("shows question answer hints while a question is pending", () => {
    expect(getChatModeHint({
      chatMode: "input",
      isLoading: true,
      hasPending: true,
      pendingKind: "question",
      activePanelId: null,
      subAgentCount: 0,
      commandCount: 0,
      commandsExpanded: false,
    })).toBe("Enter answer | type option number or custom answer | Esc cancel");
  });
});
