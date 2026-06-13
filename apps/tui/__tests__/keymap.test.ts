import { describe, expect, it } from "vitest";
import { parseKeyCombo } from "../src/lib/parseKeyCombo.js";
import { getTuiInputOwner } from "../src/lib/inputOwnership.js";
import { resolveKeyAction, type KeymapEntry } from "../src/lib/keymapRegistry.js";
import { ownsChatInput, ownsModalInput } from "../src/lib/inputOwnership.js";
import {
  type BuildChatModeKeymapContextInput,
  buildChatModeKeymapContext,
} from "../src/hooks/chatScreenViewModel.js";
import {
  getChatModeKeymaps,
} from "../src/chatModes/registry.js";
import { getCommandInputWithSelection } from "../src/chatModes/inputMode.js";
import type {
  ChatMode,
  InputModeKeymapContext,
  ChatModeKeymapContext,
} from "../src/chatModes/types.js";

function makeKeymapContext(
  chatMode: ChatMode,
  overrides: Partial<BuildChatModeKeymapContextInput> = {},
): ChatModeKeymapContext {
  const noop = () => {};
  return buildChatModeKeymapContext({
    chatMode,
    pending: null,
    activePanelId: null,
    isPaletteOpen: false,
    inputFocused: true,
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
    submit: noop,
    setChatMode: noop,
    cancel: noop,
    toggleMode: () => undefined,
    openSubAgent: noop,
    subAgentCount: 0,
    toolCallCount: 0,
    toolsExpanded: false,
    toggleToolsExpanded: noop,
    nextSubAgent: noop,
    prevSubAgent: noop,
    navigateUp: noop,
    navigateDown: noop,
    ...overrides,
  } satisfies BuildChatModeKeymapContextInput);
}

function makeInputKeymapContext(
  overrides: Partial<InputModeKeymapContext> = {},
): InputModeKeymapContext {
  const noop = () => {};
  return {
    chatMode: "input",
    pending: null,
    activePanelId: null,
    isPaletteOpen: false,
    inputFocused: true,
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
    submit: noop,
    cancel: noop,
    toggleMode: () => undefined,
    openSubAgent: noop,
    subAgentCount: 0,
    toolCallCount: 0,
    toolsExpanded: false,
    toggleToolsExpanded: noop,
    navigateUp: noop,
    navigateDown: noop,
    ...overrides,
  };
}

describe("parseKeyCombo logic", () => {
  it("correctly parses simple character keypresses", () => {
    expect(parseKeyCombo("y", { ctrl: false, shift: false })).toBe("y");
  });

  it("correctly normalizes Shift+Letter into case-insensitive single binding", () => {
    // Typicall Ink condition for Capital Y: input is "Y", key.shift is true
    expect(parseKeyCombo("Y", { ctrl: false, shift: true })).toBe("y");
  });

  it("preserves Shift modifier on complex combination commands", () => {
    // Ctrl + Shift + U
    expect(parseKeyCombo("U", { ctrl: true, shift: true })).toBe("ctrl+shift+u");
  });

  it("preserves Shift modifier on arrow keys and other named inputs", () => {
    // Shift + Up Arrow
    expect(parseKeyCombo("", { shift: true, upArrow: true })).toBe("shift+up");
  });

  it("properly combines nested control combinations", () => {
    expect(parseKeyCombo("c", { ctrl: true, meta: true })).toBe("ctrl+meta+c");
  });
});

describe("chat keymap gating", () => {
  it("centralizes active input ownership", () => {
    expect(getTuiInputOwner({
      pending: null,
      activePanelId: null,
      chatMode: "input",
      isPaletteOpen: true,
    })).toBe("command-palette");

    expect(getTuiInputOwner({
      pending: { callId: "confirm_1" },
      activePanelId: null,
      chatMode: "input",
      isPaletteOpen: false,
    })).toBe("pending-prompt");

    expect(getTuiInputOwner({
      pending: null,
      activePanelId: "session.picker",
      chatMode: "input",
      isPaletteOpen: false,
    })).toBe("feature-panel");

    expect(getTuiInputOwner({
      pending: null,
      activePanelId: null,
      chatMode: "subagent-picker",
      isPaletteOpen: false,
    })).toBe("chat-mode");

    expect(getTuiInputOwner({
      pending: null,
      activePanelId: null,
      chatMode: "input",
      isPaletteOpen: false,
      inputFocused: false,
    })).toBe("chat-mode");
  });

  it("disables lower-priority modal keymaps while command palette is open", () => {
    expect(ownsModalInput(true)).toBe(false);
    expect(ownsModalInput(false)).toBe(true);
  });

  it("disables input keymaps while command palette is open", () => {
    expect(ownsChatInput({
      pending: null,
      activePanelId: null,
      chatMode: "input",
      isPaletteOpen: true,
    })).toBe(false);
  });

  it("keeps normal chat input keymaps enabled when no modal owns input", () => {
    expect(ownsChatInput({
      pending: null,
      activePanelId: null,
      chatMode: "input",
      isPaletteOpen: false,
    })).toBe(true);
  });

  it("disables normal chat input keymaps when the transcript owns focus", () => {
    expect(ownsChatInput({
      pending: null,
      activePanelId: null,
      chatMode: "input",
      isPaletteOpen: false,
      inputFocused: false,
    })).toBe(false);
  });

  it("disables normal chat input keymaps while a question is pending", () => {
    expect(ownsChatInput({
      pending: { callId: "question_1" },
      activePanelId: null,
      chatMode: "input",
      isPaletteOpen: false,
    })).toBe(false);
  });
});

describe("keymap precedence", () => {
  it("resolves the highest-priority enabled owner for a key", () => {
    let called = "";
    const low: KeymapEntry = {
      priority: 10,
      enabled: true,
      getMap: () => ({
        escape: () => {
          called = "low";
        },
      }),
    };
    const high: KeymapEntry = {
      priority: 100,
      enabled: true,
      getMap: () => ({
        escape: () => {
          called = "high";
        },
      }),
    };

    const winner = resolveKeyAction([low, high], "escape");
    winner?.action();

    expect(winner?.entry).toBe(high);
    expect(called).toBe("high");
  });

  it("skips disabled owners while resolving keys", () => {
    const disabled: KeymapEntry = {
      priority: 100,
      enabled: false,
      getMap: () => ({
        escape: () => {},
      }),
    };
    const enabled: KeymapEntry = {
      priority: 10,
      enabled: true,
      getMap: () => ({
        escape: () => {},
      }),
    };

    expect(resolveKeyAction([disabled, enabled], "escape")?.entry).toBe(enabled);
  });
});

describe("chat mode keymap registry", () => {
  it("enables input mode keymaps only when input owns focus", () => {
    expect(getChatModeKeymaps(makeKeymapContext("input"))[0]?.enabled).toBe(true);
    expect(getChatModeKeymaps(makeKeymapContext("input", {
      pending: { id: "pending" },
    }))[0]?.enabled).toBe(false);
    expect(getChatModeKeymaps(makeKeymapContext("input", {
      activePanelId: "session.picker",
    }))[0]?.enabled).toBe(false);
    expect(getChatModeKeymaps(makeKeymapContext("input", {
      inputFocused: false,
    }))[0]?.enabled).toBe(false);
  });

  it("disables active mode keymaps while the command palette is open", () => {
    const modes: ChatMode[] = [
      "input",
      "subagent-picker",
      "subagent-detail",
    ];

    for (const mode of modes) {
      expect(getChatModeKeymaps(makeKeymapContext(mode, {
        isPaletteOpen: true,
      }))[0]?.enabled).toBe(false);
    }
  });

  it("exposes one focused keymap per non-input mode", () => {
    expect(Object.keys(getChatModeKeymaps(makeKeymapContext("subagent-picker"))[0]!.map).sort())
      .toEqual(["ctrl+o", "down", "escape", "return", "up"]);
    expect(Object.keys(getChatModeKeymaps(makeKeymapContext("subagent-detail"))[0]!.map).sort())
      .toEqual(["ctrl+o", "escape"]);
  });

  it("always routes Ctrl+O to toggleToolsExpanded regardless of sub-agents existence", () => {
    let openedSubAgent = false;
    let toggledCommands = false;

    getChatModeKeymaps(makeKeymapContext("input", {
      subAgentCount: 1,
      toolCallCount: 2,
      openSubAgent: () => {
        openedSubAgent = true;
      },
      toggleToolsExpanded: () => {
        toggledCommands = true;
      },
    }))[0]!.map["ctrl+o"]!();

    expect(openedSubAgent).toBe(false);
    expect(toggledCommands).toBe(true);

    toggledCommands = false;
    getChatModeKeymaps(makeKeymapContext("input", {
      subAgentCount: 0,
      toolCallCount: 1,
      openSubAgent: () => {
        openedSubAgent = true;
      },
      toggleToolsExpanded: () => {
        toggledCommands = true;
      },
    }))[0]!.map["ctrl+o"]!();

    expect(openedSubAgent).toBe(false);
    expect(toggledCommands).toBe(true);
  });

  it("routes input navigation to command suggestions when slash menu is open", () => {
    let suggestionPrevCount = 0;
    let historyUpCount = 0;
    const map = getChatModeKeymaps(makeKeymapContext("input", {
      suggestion: {
        show: true,
        filtered: [{ name: "settings", description: "Open settings" }],
        selectedIndex: 0,
        maxVisibleCount: 1,
        next: () => {},
        prev: () => {
          suggestionPrevCount += 1;
        },
      },
      navigateUp: () => {
        historyUpCount += 1;
      },
    }))[0]!.map;

    map.up!();

    expect(suggestionPrevCount).toBe(1);
    expect(historyUpCount).toBe(0);
  });

  it("submits slash commands on enter when the suggestion menu is open", () => {
    let submitted = false;
    const map = getChatModeKeymaps(makeKeymapContext("input", {
      suggestion: {
        show: true,
        filtered: [
          { name: "help", description: "List commands" },
          { name: "write-a-skill", description: "Create a new skill" },
        ],
        selectedIndex: 1,
        maxVisibleCount: 2,
        next: () => {},
        prev: () => {},
      },
      submit: () => {
        submitted = true;
      },
    }))[0]!.map;

    map.return!();

    expect(submitted).toBe(true);
  });

  it("resolves selected commands from slash suggestions", () => {
    expect(getCommandInputWithSelection(makeInputKeymapContext({
      suggestion: {
        show: true,
        filtered: [
          { name: "help", description: "List commands" },
          { name: "settings", description: "Open settings" },
        ],
        selectedIndex: 1,
        maxVisibleCount: 2,
        next: () => {},
        prev: () => {},
      },
    }))).toBe("/settings");
  });

  it("preserves typed command arguments when slash suggestions are open", () => {
    expect(getCommandInputWithSelection(makeInputKeymapContext({
      suggestion: {
        show: true,
        filtered: [
          { name: "review", description: "Review a pull request" },
          { name: "review-post", description: "Post a review comment" },
        ],
        selectedIndex: 0,
        maxVisibleCount: 2,
        next: () => {},
        prev: () => {},
      },
    }), "/review 20")).toBe("/review 20");
  });
});
