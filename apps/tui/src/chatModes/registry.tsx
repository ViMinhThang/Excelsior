import { Box, Text } from "ink";
import {
  formatAgentMode,
  toSubAgentViewModel,
} from "@excelsior/core";
import ChatHistory from "../components/chat/ChatHistory.js";
import ChatInput from "../components/chat/ChatInput.js";
import SubAgentDetail from "../features/review/components/SubAgentDetail.js";
import SubAgentPickerPanel from "../features/review/components/SubAgentPickerPanel.js";
import ThinkingIndicator from "../components/chat/ThinkingIndicator.js";
import ToolDetailPanel from "../components/chat/ToolDetailPanel.js";
import { completeCommandInput } from "../lib/commandSubmission.js";
import { theme } from "../theme.js";
import type {
  ChatMode,
  ChatModeDefinition,
  ChatModeHintContext,
  ChatModeKeymapContext,
  ChatModeKeymapSpec,
  ChatModeRegistry,
  ChatModeRenderContext,
  ChatModeSelection,
  ChatModeSelectionContextMap,
  ChatModeSelectionSource,
  InputModeKeymapContext,
  InputModeRenderContext,
  SubAgentPickerModeRenderContext,
  ToolDetailModeRenderContext,
  ToolFocusModeRenderContext,
} from "./types.js";

const sep = " | ";

function globalHint(ctx: ChatModeHintContext): string | null {
  if (ctx.hasPending) {
    return `y accept${sep}a accept all${sep}n deny${sep}\u2191\u2193 scroll diff${sep}Tab hunks${sep}Esc cancel`;
  }
  if (ctx.activePanelId) {
    return `Up/Down select${sep}Enter open${sep}Esc close`;
  }
  return null;
}

function inputHint(ctx: ChatModeHintContext): string {
  const override = globalHint(ctx);
  if (override) return override;
  if (ctx.isLoading) {
    return "Esc cancel" + (ctx.subAgentCount > 0 ? `${sep}Ctrl+O sub-agent detail` : "");
  }
  return `Enter send${sep}/ commands`
    + (ctx.subAgentCount > 0 ? `${sep}Ctrl+O sub-agent detail` : "")
    + ((ctx.toolCount ?? 0) > 0 ? `${sep}Ctrl+T tools` : "")
    + `${sep}Ctrl+K command palette`;
}

function modeHint(ctx: ChatModeHintContext, hint: string): string {
  return globalHint(ctx) ?? hint;
}

function emptySelection(): ChatModeSelection {
  return {
    selectedSubAgentId: null,
    selectedToolId: null,
  };
}

function subAgentSelection(
  ctx: ChatModeSelectionContextMap["subagent-picker"],
): ChatModeSelection {
  return {
    selectedSubAgentId: ctx.subAgents[ctx.subAgentIndex]?.id ?? null,
    selectedToolId: null,
  };
}

function toolSelection(
  ctx: ChatModeSelectionContextMap["tool-focus"],
): ChatModeSelection {
  return {
    selectedSubAgentId: null,
    selectedToolId: ctx.selectedToolId,
  };
}

export function shouldEnableModalModeKeymap(isPaletteOpen: boolean): boolean {
  return !isPaletteOpen;
}

export function shouldEnableInputModeKeymap(options: {
  pending: unknown;
  activePanelId: string | null;
  chatMode: ChatMode;
  isPaletteOpen: boolean;
}): boolean {
  return (
    !options.pending &&
    !options.activePanelId &&
    options.chatMode === "input" &&
    !options.isPaletteOpen
  );
}

export interface BuildChatModeKeymapContextInput {
  chatMode: ChatMode;
  pending: unknown;
  activePanelId: string | null;
  isPaletteOpen: boolean;
  isLoading: boolean;
  suggestion: InputModeKeymapContext["suggestion"];
  setInput: (value: string) => void;
  setChatMode: (mode: ChatMode) => void;
  cancel: () => void;
  toggleMode: () => "plan" | "act" | undefined;
  openSubAgent: () => void;
  nextSubAgent: () => void;
  prevSubAgent: () => void;
  openToolFocus: () => void;
  openToolDetail: () => void;
  nextTool: () => void;
  prevTool: () => void;
  toggleSelectedTool: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  openPalette?: () => void;
}

export function buildChatModeKeymapContext(
  input: BuildChatModeKeymapContextInput,
): ChatModeKeymapContext {
  switch (input.chatMode) {
    case "input":
      return {
        chatMode: "input",
        pending: input.pending,
        activePanelId: input.activePanelId,
        isPaletteOpen: input.isPaletteOpen,
        isLoading: input.isLoading,
        suggestion: input.suggestion,
        setInput: input.setInput,
        cancel: input.cancel,
        toggleMode: input.toggleMode,
        openSubAgent: input.openSubAgent,
        openToolFocus: input.openToolFocus,
        navigateUp: input.navigateUp,
        navigateDown: input.navigateDown,
        openPalette: input.openPalette,
      };
    case "subagent-picker":
      return {
        chatMode: "subagent-picker",
        isPaletteOpen: input.isPaletteOpen,
        setChatMode: input.setChatMode,
        nextSubAgent: input.nextSubAgent,
        prevSubAgent: input.prevSubAgent,
      };
    case "subagent-detail":
      return {
        chatMode: "subagent-detail",
        isPaletteOpen: input.isPaletteOpen,
        setChatMode: input.setChatMode,
      };
    case "tool-focus":
      return {
        chatMode: "tool-focus",
        isPaletteOpen: input.isPaletteOpen,
        setChatMode: input.setChatMode,
        openToolDetail: input.openToolDetail,
        nextTool: input.nextTool,
        prevTool: input.prevTool,
        toggleSelectedTool: input.toggleSelectedTool,
      };
    case "tool-detail":
      return {
        chatMode: "tool-detail",
        isPaletteOpen: input.isPaletteOpen,
        setChatMode: input.setChatMode,
      };
  }
}

export function getCommandInputWithSelection(
  ctx: InputModeKeymapContext,
  inputValue = "",
): string | null {
  if (!hasCommandSuggestions(ctx)) return null;
  if (hasCommandArguments(inputValue)) return inputValue;
  const selected = ctx.suggestion.filtered[ctx.suggestion.selectedIndex];
  if (!selected) return null;
  return `/${selected.name}`;
}

function hasCommandArguments(inputValue: string): boolean {
  const commandText = inputValue.trimStart();
  if (!commandText.startsWith("/")) return false;
  return /\s+\S/.test(commandText.slice(1));
}

function hasCommandSuggestions(ctx: InputModeKeymapContext): boolean {
  return (
    !ctx.activePanelId &&
    ctx.suggestion.show &&
    ctx.suggestion.filtered.length > 0
  );
}

function inputKeymaps(ctx: InputModeKeymapContext): ChatModeKeymapSpec[] {
  const hasSuggestions = hasCommandSuggestions(ctx);
  return [
    {
      enabled: shouldEnableInputModeKeymap(ctx),
      priority: 10,
      map: {
        escape: () => {
          if (ctx.isLoading) ctx.cancel();
        },
        "ctrl+k": () => {
          ctx.openPalette?.();
        },
        "shift+tab": () => {
          ctx.toggleMode();
        },
        "ctrl+m": () => {
          ctx.toggleMode();
        },
        "ctrl+o": () => {
          ctx.openSubAgent();
        },
        "ctrl+t": () => {
          ctx.openToolFocus();
        },
        up: () => {
          if (hasSuggestions) ctx.suggestion.prev();
          else ctx.navigateUp();
        },
        down: () => {
          if (hasSuggestions) ctx.suggestion.next();
          else ctx.navigateDown();
        },
        tab: () => {
          if (!hasSuggestions) return;
          const completed = completeCommandInput(
            ctx.suggestion.filtered,
            ctx.suggestion.selectedIndex,
          );
          if (completed) ctx.setInput(completed);
        },
        return: () => {
          const selectedCommand = getCommandInputWithSelection(ctx);
          if (selectedCommand) ctx.setInput(selectedCommand);
        },
      },
    },
  ];
}

function modalKeymap(
  isPaletteOpen: boolean,
  map: ChatModeKeymapSpec["map"],
): ChatModeKeymapSpec[] {
  return [
    {
      map,
      enabled: shouldEnableModalModeKeymap(isPaletteOpen),
      priority: 80,
    },
  ];
}

type ConversationModeContext =
  | InputModeRenderContext
  | SubAgentPickerModeRenderContext
  | ToolFocusModeRenderContext
  | ToolDetailModeRenderContext;

function renderConversation(
  ctx: ConversationModeContext,
  options: {
    showSubAgentPicker?: boolean;
    disableBlockHiding?: boolean;
    showCommandResult?: boolean;
  } = {},
) {
  const ActiveFeaturePanel = ctx.panel.active?.component;
  const showSubAgentPicker = options.showSubAgentPicker && "subAgents" in ctx;

  return (
    <>
      <Box flexDirection="column">
        <ChatHistory
          blocks={ctx.transcript.blocks}
          selectedToolId={ctx.transcript.selectedToolId}
          selectedSubAgentId={ctx.transcript.selectedSubAgentId}
          expandedToolIds={ctx.transcript.expandedToolIds}
          disableBlockHiding={options.disableBlockHiding}
        />
      </Box>

      {showSubAgentPicker ? (
        <SubAgentPickerPanel
          subAgents={ctx.subAgents.blocks}
          selectedIndex={ctx.subAgents.selectedIndex}
        />
      ) : null}

      {ctx.runtime.isLoading && (
        <Box marginTop={1}>
          <ThinkingIndicator />
        </Box>
      )}

      {ActiveFeaturePanel ? (
        <ActiveFeaturePanel context={ctx.panel.context} />
      ) : (
        <>
          <ChatInput
            value={ctx.input.value}
            onChange={ctx.input.setValue}
            onSubmit={ctx.input.submit}
            shouldSubmit={ctx.input.shouldSubmit}
            placeholder="Type your coding task here..."
            isLoading={ctx.runtime.isLoading}
            focus={ctx.chatMode === "input" && !ctx.runtime.pending && !ctx.runtime.paletteOpen}
          />
          <Box paddingLeft={1}>
            <Text color={theme.colors.highlightEmphasis} bold>(Shift + Tab)</Text>
            <Text color={theme.colors.muted} dimColor> {formatAgentMode(ctx.runtime.agentMode)}</Text>
          </Box>
        </>
      )}

      {!ActiveFeaturePanel && options.showCommandResult && ctx.runtime.commandResult && (
        <Box marginTop={1} paddingLeft={1} flexDirection="column">
          <Text color={theme.colors.secondary}>{ctx.runtime.commandResult}</Text>
        </Box>
      )}
    </>
  );
}

const inputMode: ChatModeDefinition<"input"> = {
  render: (ctx) => renderConversation(ctx, { showCommandResult: true }),
  getHint: inputHint,
  getSelection: emptySelection,
  getKeymaps: inputKeymaps,
};

const subAgentPickerMode: ChatModeDefinition<"subagent-picker"> = {
  render: (ctx) => renderConversation(ctx, { showSubAgentPicker: true }),
  getHint: (ctx) => modeHint(ctx, `Enter view detail${sep}\u2191\u2193 navigate${sep}Esc close`),
  getSelection: subAgentSelection,
  getKeymaps: (ctx) => modalKeymap(ctx.isPaletteOpen, {
    up: () => ctx.prevSubAgent(),
    down: () => ctx.nextSubAgent(),
    return: () => ctx.setChatMode("subagent-detail"),
    escape: () => ctx.setChatMode("input"),
  }),
};

const subAgentDetailMode: ChatModeDefinition<"subagent-detail"> = {
  render: (ctx) => {
    const selectedSubAgent = ctx.subAgents.blocks[ctx.subAgents.selectedIndex];
    if (!selectedSubAgent) {
      return (
        <Box marginTop={1} paddingLeft={1}>
          <Text color={theme.colors.muted}>No sub-agent detail is available yet.</Text>
        </Box>
      );
    }

    return (
      <SubAgentDetail
        agent={toSubAgentViewModel(
          selectedSubAgent.state,
          selectedSubAgent.id,
          selectedSubAgent.role,
        )}
      />
    );
  },
  getHint: (ctx) => modeHint(ctx, `Esc back to list${sep}Ctrl+O close`),
  getSelection: subAgentSelection,
  getKeymaps: (ctx) => modalKeymap(ctx.isPaletteOpen, {
    escape: () => ctx.setChatMode("subagent-picker"),
    "ctrl+o": () => ctx.setChatMode("subagent-picker"),
  }),
};

const toolFocusMode: ChatModeDefinition<"tool-focus"> = {
  render: (ctx) => renderConversation(ctx, { disableBlockHiding: true }),
  getHint: (ctx) => modeHint(ctx, `Enter expand/collapse${sep}d detail${sep}Up/Down tools${sep}Ctrl+T/Esc back`),
  getSelection: toolSelection,
  getKeymaps: (ctx) => modalKeymap(ctx.isPaletteOpen, {
    up: () => ctx.prevTool(),
    down: () => ctx.nextTool(),
    return: () => ctx.toggleSelectedTool(),
    d: () => ctx.openToolDetail(),
    escape: () => ctx.setChatMode("input"),
    "ctrl+t": () => ctx.setChatMode("input"),
  }),
};

const toolDetailMode: ChatModeDefinition<"tool-detail"> = {
  render: (ctx) => {
    if (!ctx.tools.selectedBlock) return renderConversation(ctx);

    return (
      <Box flexDirection="row" gap={1}>
        <Box flexDirection="column" flexGrow={1}>
          <ChatHistory
            blocks={ctx.transcript.blocks}
            selectedToolId={ctx.transcript.selectedToolId}
            selectedSubAgentId={ctx.transcript.selectedSubAgentId}
            expandedToolIds={ctx.transcript.expandedToolIds}
            disableBlockHiding
          />
        </Box>
        <Box>
          <Text color={theme.colors.border}>{theme.glyphs.output}</Text>
        </Box>
        <ToolDetailPanel block={ctx.tools.selectedBlock} />
      </Box>
    );
  },
  getHint: (ctx) => modeHint(ctx, `Esc back to tools${sep}Ctrl+T close`),
  getSelection: toolSelection,
  getKeymaps: (ctx) => modalKeymap(ctx.isPaletteOpen, {
    escape: () => ctx.setChatMode("tool-focus"),
    "ctrl+t": () => ctx.setChatMode("input"),
  }),
};

export const chatModeRegistry: ChatModeRegistry = {
  input: inputMode,
  "subagent-picker": subAgentPickerMode,
  "subagent-detail": subAgentDetailMode,
  "tool-focus": toolFocusMode,
  "tool-detail": toolDetailMode,
};

export function ChatModeView({
  context,
}: {
  context: ChatModeRenderContext;
}) {
  switch (context.chatMode) {
    case "input":
      return <>{chatModeRegistry.input.render(context)}</>;
    case "subagent-picker":
      return <>{chatModeRegistry["subagent-picker"].render(context)}</>;
    case "subagent-detail":
      return <>{chatModeRegistry["subagent-detail"].render(context)}</>;
    case "tool-focus":
      return <>{chatModeRegistry["tool-focus"].render(context)}</>;
    case "tool-detail":
      return <>{chatModeRegistry["tool-detail"].render(context)}</>;
  }
}

export function getChatModeHint(ctx: ChatModeHintContext): string {
  return chatModeRegistry[ctx.chatMode].getHint(ctx);
}

export function getChatModeSelection(
  chatMode: ChatMode,
  ctx: ChatModeSelectionSource,
): ChatModeSelection {
  switch (chatMode) {
    case "input":
      return chatModeRegistry.input.getSelection({});
    case "subagent-picker":
      return chatModeRegistry["subagent-picker"].getSelection({
        subAgents: ctx.subAgents,
        subAgentIndex: ctx.subAgentIndex,
      });
    case "subagent-detail":
      return chatModeRegistry["subagent-detail"].getSelection({
        subAgents: ctx.subAgents,
        subAgentIndex: ctx.subAgentIndex,
      });
    case "tool-focus":
      return chatModeRegistry["tool-focus"].getSelection({
        selectedToolId: ctx.selectedToolId,
      });
    case "tool-detail":
      return chatModeRegistry["tool-detail"].getSelection({
        selectedToolId: ctx.selectedToolId,
      });
  }
}

export function getChatModeKeymaps(
  ctx: ChatModeKeymapContext,
): ChatModeKeymapSpec[] {
  switch (ctx.chatMode) {
    case "input":
      return chatModeRegistry.input.getKeymaps(ctx);
    case "subagent-picker":
      return chatModeRegistry["subagent-picker"].getKeymaps(ctx);
    case "subagent-detail":
      return chatModeRegistry["subagent-detail"].getKeymaps(ctx);
    case "tool-focus":
      return chatModeRegistry["tool-focus"].getKeymaps(ctx);
    case "tool-detail":
      return chatModeRegistry["tool-detail"].getKeymaps(ctx);
  }
}
