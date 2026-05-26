import { describe, expect, it } from "vitest";
import { getChatModeHint } from "../src/lib/modeHints.js";
import { chatModeRegistry } from "../src/chatModes/index.js";

describe("chat mode hints", () => {
  it("shows Ctrl+O only when commands or sub-agents exist", () => {
    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 0,
      commandCount: 0,
      commandsExpanded: false,
    })).not.toContain("Ctrl+O");
    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 0,
      commandCount: 0,
      commandsExpanded: false,
    })).toContain("Ctrl+K");

    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
      commandCount: 0,
      commandsExpanded: false,
    })).toContain("commands");
  });

  it("uses Ctrl+O for command expansion instead of Ctrl+T", () => {
    const collapsed = getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 0,
      commandCount: 1,
      commandsExpanded: false,
    });

    expect(collapsed).toContain("Ctrl+O commands");
    expect(collapsed).not.toContain("Ctrl+T");

    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 0,
      commandCount: 1,
      commandsExpanded: true,
    })).toContain("Ctrl+O hide commands");
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
    })).toContain("Ctrl+O commands");

    expect(getChatModeHint({
      chatMode: "subagent-detail",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
      commandCount: 1,
      commandsExpanded: true,
    })).toBe("Esc back to list | Ctrl+O hide commands");
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
