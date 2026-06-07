import { describe, expect, it } from "vitest";
import {
  buildChatModeKeymapContext,
  ChatModeView,
  chatModeRegistry,
  getChatModeHint,
  getChatModeKeymaps,
  getChatModeSelection,
  type BuildChatModeKeymapContextInput,
} from "../src/chatModes/registry.js";
import {
  chatModeIds,
  type ChatMode,
  type ChatModeKeymapContext,
  type ChatModeRenderContext,
} from "../src/chatModes/types.js";
import { buildModeViewContext } from "../src/hooks/chatScreenModelBuilders.js";

function makeKeymapContext(chatMode: ChatMode): ChatModeKeymapContext {
  const noop = () => {};
  return buildChatModeKeymapContext({
    chatMode,
    pending: null,
    activePanelId: null,
    isPaletteOpen: false,
    isLoading: false,
    suggestion: {
      show: false,
      filtered: [],
      selectedIndex: 0,
      maxVisibleCount: 0,
      next: noop,
      prev: noop,
    },
    setInput: noop,
    setChatMode: noop,
    cancel: noop,
    toggleMode: () => undefined,
    openSubAgent: noop,
    subAgentCount: 0,
    commandCount: 0,
    commandsExpanded: false,
    toggleCommandsExpanded: noop,
    nextSubAgent: noop,
    prevSubAgent: noop,
    navigateUp: noop,
    navigateDown: noop,
  } satisfies BuildChatModeKeymapContextInput);
}

function makeRenderContext(chatMode: ChatMode): ChatModeRenderContext {
  const noop = () => {};
  return buildModeViewContext({
    chatMode,
    displayBlocks: [],
    inputValue: "",
    setInput: noop,
    handleSubmit: noop,
    isLoading: false,
    pending: null,
    paletteOpen: false,
    commandResult: null,
    agentMode: "act",
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
    commandsExpanded: false,
    historyResetKey: 0,
  });
}

function makeLegacyWideRenderContext(chatMode: ChatMode) {
  const noop = () => {};
  return {
    chatMode,
    input: {
      value: "",
      setValue: noop,
      submit: noop,
    },
    runtime: {
      isLoading: false,
      pending: null,
      paletteOpen: false,
      commandResult: null,
      agentMode: "act",
    },
    transcript: {
      blocks: [],
      commandsExpanded: false,
    },
    subAgents: {
      blocks: [],
      selectedIndex: 0,
    },
    tools: {
      blocks: [],
      selectedId: null,
      selectedBlock: undefined,
    },
    panel: {
      active: undefined,
      context: {
        sessions: [],
        currentSessionId: null,
        switchSession: noop,
        deleteSession: noop,
        closePanel: noop,
      },
    },
  };
}

describe("chat mode registry", () => {
  it("defines every chat mode exactly once", () => {
    expect(Object.keys(chatModeRegistry).sort()).toEqual([...chatModeIds].sort());
  });

  it("provides render, hint, selection, and keymap behavior for every mode", () => {
    for (const chatMode of chatModeIds) {
      const rendered = ChatModeView({ context: makeRenderContext(chatMode) });
      const hint = getChatModeHint({
        chatMode,
        isLoading: false,
        hasPending: false,
        activePanelId: null,
        subAgentCount: 0,
        commandCount: 0,
        commandsExpanded: false,
      });
      const selection = getChatModeSelection(chatMode, {
        subAgents: [],
        subAgentIndex: 0,
      });
      const keymaps = getChatModeKeymaps(makeKeymapContext(chatMode));

      expect(rendered).toBeTruthy();
      expect(hint.length).toBeGreaterThan(0);
      expect(Object.keys(selection).sort()).toEqual(["selectedSubAgentId"]);
      expect(keymaps.length).toBeGreaterThan(0);
      expect(keymaps[0]?.map).toBeTruthy();
    }
  });

  it("rejects the old all-state render shape at the mode seam", () => {
    const context = makeRenderContext("subagent-detail");
    const legacy = makeLegacyWideRenderContext("subagent-detail");

    expect("subAgents" in context).toBe(true);
    expect("transcript" in context).toBe(false);
    expect("tools" in context).toBe(false);
    expect("subAgents" in legacy).toBe(true);
  });
});
