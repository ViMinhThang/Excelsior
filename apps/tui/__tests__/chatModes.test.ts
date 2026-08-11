import { describe, expect, it } from "vitest";
import {
  chatModeRegistry,
  getChatModeKeymaps,
} from "../src/chatModes/registry.js";
import {
  chatModeIds,
  type ChatMode,
  type ChatModeKeymapContext,
  type ChatModeRenderContext,
} from "../src/chatModes/types.js";
import {
  buildChatModeKeymapContext,
  buildModeViewContext,
  type BuildChatModeKeymapContextInput,
} from "../src/hooks/chatScreenViewModel.js";

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
    setInputFocused: noop,
    submit: noop,
    cancel: noop,
    toggleMode: () => undefined,
    toolCallCount: 0,
    toolsExpanded: false,
    toggleToolsExpanded: noop,
    navigateUp: noop,
    navigateDown: noop,
    inputFocused: false,
  } satisfies BuildChatModeKeymapContextInput);
}

function makeRenderContext(chatMode: ChatMode): ChatModeRenderContext {
  const noop = () => {};
  return buildModeViewContext({
    workspace: { id: "ws", name: "Workspace", rootPath: "C:/repo" },
    sessionId: "ses",
    chatMode,
    turns: [],
    tasks: [],
    inputValue: "",
    setInput: noop,
    inputFocused: false,
    setInputFocused: noop,
    handleSubmit: noop,
    isLoading: false,
    pending: null,
    paletteOpen: false,
    commandResult: null,
    agentMode: "act",
    settings: {
      deepseekApiKey: "",
      githubToken: "",
      agentToolLoopSteps: "unlimited",
      autoReflectionEnabled: false,
      autoApproveWorkspaceEdits: false,
    },
    activePanel: undefined,
    featureContext: {
      sessions: [],
      currentSessionId: null,
      switchSession: noop,
      deleteSession: noop,
      closePanel: noop,
    },
    toolsExpanded: false,
    viewportKey: "none:0",
  });
}

describe("chat mode registry", () => {
  it("defines every chat mode exactly once", () => {
    expect(Object.keys(chatModeRegistry).sort()).toEqual([...chatModeIds].sort());
  });

  it("provides render, hint, and keymap behavior for the input mode", () => {
    const chatMode = "input";
    const context = makeRenderContext(chatMode);
    const rendered = chatModeRegistry[chatMode].render(context as any);
    const hint = chatModeRegistry[chatMode].getHint({
      chatMode,
      isLoading: false,
      hasPending: false,
      activePanelId: null,
      toolCallCount: 0,
      toolsExpanded: false,
    });
    const keymaps = getChatModeKeymaps(makeKeymapContext(chatMode));

    expect(rendered).toBeTruthy();
    expect(hint.length).toBeGreaterThan(0);
    expect(keymaps.length).toBeGreaterThan(0);
    expect(keymaps[0]?.map).toBeTruthy();
  });
});
