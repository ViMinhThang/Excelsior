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
    })).not.toContain("Ctrl+O");

    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
    })).toContain("Ctrl+O");
  });

  it("uses panel and sub-agent detail mode hints", () => {
    expect(getChatModeHint({
      chatMode: "input",
      isLoading: false,
      hasPending: false,
      activePanelId: "session.picker",
      subAgentCount: 0,
    })).toBe("Up/Down select · Enter open · Esc close");

    expect(getChatModeHint({
      chatMode: "subagent-detail",
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      subAgentCount: 1,
    })).toBe("Ctrl+O/Esc back · Up/Down switch");
  });
});
