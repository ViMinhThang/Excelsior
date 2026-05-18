import { describe, expect, it } from "vitest";
import {
  chatModeIds,
  chatModeRegistry,
  getChatModeHint,
  getChatModeKeymaps,
  getChatModeSelection,
  type ChatMode,
  type ChatModeKeymapContext,
  type ChatModeRenderContext,
} from "../../apps/tui/src/chatModes/index.js";

function makeKeymapContext(chatMode: ChatMode): ChatModeKeymapContext {
  const noop = () => {};
  return {
    chatMode,
    pending: null,
    activePanelId: null,
    isPaletteOpen: false,
    isLoading: false,
    suggestion: {
      show: false,
      filtered: [],
      selectedIndex: 0,
      next: noop,
      prev: noop,
    },
    setInput: noop,
    setChatMode: noop,
    cancel: noop,
    toggleMode: () => undefined,
    openSubAgent: noop,
    nextSubAgent: noop,
    prevSubAgent: noop,
    openToolFocus: noop,
    openToolDetail: noop,
    nextTool: noop,
    prevTool: noop,
    toggleSelectedTool: noop,
    navigateUp: noop,
    navigateDown: noop,
  };
}

function makeRenderContext(chatMode: ChatMode): ChatModeRenderContext {
  const noop = () => {};
  return {
    chatMode,
    displayBlocks: [],
    input: "",
    setInput: noop,
    handleSubmit: noop,
    isLoading: false,
    pending: null,
    paletteOpen: false,
    commandResult: null,
    mode: "act",
    activePanel: undefined,
    featureContext: {
      sessions: [],
      currentSessionId: null,
      switchSession: noop,
      deleteSession: noop,
      closePanel: noop,
    },
    subAgents: [],
    subAgentIndex: 0,
    toolBlocks: [],
    selectedSubAgentId: null,
    selectedToolId: null,
    selectedToolBlock: undefined,
    expandedToolIds: new Set(),
  };
}

describe("chat mode registry", () => {
  it("defines every chat mode exactly once", () => {
    expect(Object.keys(chatModeRegistry).sort()).toEqual([...chatModeIds].sort());
  });

  it("provides render, hint, selection, and keymap behavior for every mode", () => {
    for (const chatMode of chatModeIds) {
      const definition = chatModeRegistry[chatMode];
      const rendered = definition.render(makeRenderContext(chatMode));
      const hint = getChatModeHint({
        chatMode,
        isLoading: false,
        hasPending: false,
        activePanelId: null,
        subAgentCount: 0,
        toolCount: 0,
      });
      const selection = getChatModeSelection(chatMode, {
        subAgents: [],
        subAgentIndex: 0,
        selectedToolId: null,
      });
      const keymaps = getChatModeKeymaps(makeKeymapContext(chatMode));

      expect(rendered).toBeTruthy();
      expect(hint.length).toBeGreaterThan(0);
      expect(Object.keys(selection).sort()).toEqual([
        "selectedSubAgentId",
        "selectedToolId",
      ]);
      expect(keymaps.length).toBeGreaterThan(0);
      expect(keymaps[0]?.map).toBeTruthy();
    }
  });
});
