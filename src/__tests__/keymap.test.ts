import { describe, expect, it } from "vitest";
import { parseKeyCombo } from "../../apps/tui/src/lib/parseKeyCombo.js";
import {
  shouldEnableInputKeymap,
  shouldEnableModalKeymap,
} from "../../apps/tui/src/hooks/useChatKeymaps.js";
import {
  getChatModeKeymaps,
  getCommandInputWithSelection,
  type ChatMode,
  type ChatModeKeymapContext,
} from "../../apps/tui/src/chatModes/index.js";

function makeKeymapContext(
  chatMode: ChatMode,
  overrides: Partial<ChatModeKeymapContext> = {},
): ChatModeKeymapContext {
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
      maxVisibleCount: 0,
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
  it("disables lower-priority modal keymaps while command palette is open", () => {
    expect(shouldEnableModalKeymap(true)).toBe(false);
    expect(shouldEnableModalKeymap(false)).toBe(true);
  });

  it("disables input keymaps while command palette is open", () => {
    expect(shouldEnableInputKeymap({
      pending: null,
      activePanelId: null,
      chatMode: "input",
      isPaletteOpen: true,
    })).toBe(false);
  });

  it("keeps normal chat input keymaps enabled when no modal owns input", () => {
    expect(shouldEnableInputKeymap({
      pending: null,
      activePanelId: null,
      chatMode: "input",
      isPaletteOpen: false,
    })).toBe(true);
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
  });

  it("disables active mode keymaps while the command palette is open", () => {
    const modes: ChatMode[] = [
      "input",
      "subagent-picker",
      "subagent-detail",
      "tool-focus",
      "tool-detail",
    ];

    for (const mode of modes) {
      expect(getChatModeKeymaps(makeKeymapContext(mode, {
        isPaletteOpen: true,
      }))[0]?.enabled).toBe(false);
    }
  });

  it("exposes one focused keymap per non-input mode", () => {
    expect(Object.keys(getChatModeKeymaps(makeKeymapContext("subagent-picker"))[0]!.map).sort())
      .toEqual(["down", "escape", "return", "up"]);
    expect(Object.keys(getChatModeKeymaps(makeKeymapContext("subagent-detail"))[0]!.map).sort())
      .toEqual(["ctrl+o", "escape"]);
    expect(Object.keys(getChatModeKeymaps(makeKeymapContext("tool-focus"))[0]!.map).sort())
      .toEqual(["ctrl+t", "d", "down", "escape", "return", "up"]);
    expect(Object.keys(getChatModeKeymaps(makeKeymapContext("tool-detail"))[0]!.map).sort())
      .toEqual(["ctrl+t", "escape"]);
  });

  it("routes input navigation to command suggestions while suggestions are visible", () => {
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

    map.up();

    expect(suggestionPrevCount).toBe(1);
    expect(historyUpCount).toBe(0);
  });

  it("fills the selected command suggestion on enter", () => {
    let input = "/";
    const map = getChatModeKeymaps(makeKeymapContext("input", {
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
      setInput: (value) => {
        input = value;
      },
    }))[0]!.map;

    map.return();

    expect(input).toBe("/settings");
  });

  it("resolves the selected command for one-enter execution", () => {
    expect(getCommandInputWithSelection(makeKeymapContext("input", {
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
});
