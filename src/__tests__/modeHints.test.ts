import { describe, expect, it } from "vitest";
import { getChatModeHint } from "../../apps/tui/src/lib/modeHints.js";

describe("chat mode hints", () => {
  it("shows Ctrl+O only when sub-agent blocks exist", () => {
    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 0,
      toolCount: 0,
    })).not.toContain("Ctrl+O");
    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 0,
      toolCount: 0,
    })).toContain("Ctrl+K");

    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
      toolCount: 0,
    })).toContain("Ctrl+O");
  });

  it("shows tool focus hints when tool blocks exist", () => {
    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 0,
      toolCount: 1,
    })).toContain("Ctrl+T tools");

    expect(getChatModeHint({
      chatMode: "tool-focus",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 0,
      toolCount: 1,
    })).toBe("Enter expand/collapse | d detail | Up/Down tools | Ctrl+T/Esc back");
  });

  it("uses panel and sub-agent mode hints", () => {
    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: "session.picker",
      subAgentCount: 0,
      toolCount: 0,
    })).toBe("Up/Down select | Enter open | Esc close");

    expect(getChatModeHint({
      chatMode: "subagent-focus",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
      toolCount: 0,
    })).toBe("Enter detail | Up/Down sub-agents | Ctrl+O/Esc back");

    expect(getChatModeHint({
      chatMode: "subagent-detail",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
      toolCount: 0,
    })).toBe("Ctrl+O/Esc back | Up/Down switch");
  });
});
