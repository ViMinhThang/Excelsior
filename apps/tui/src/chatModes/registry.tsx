import { Box, Text } from "ink";
import {
  formatAgentMode,
  toSubAgentViewModel,
} from "@excelsior/core";
import ChatHistory from "../components/chat/ChatHistory.js";
import ChatInput from "../components/chat/ChatInput.js";
import SubAgentDetail from "../components/review/SubAgentDetail.js";
import SubAgentPickerPanel from "../components/review/SubAgentPickerPanel.js";
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
  ChatModeRenderContext,
  ChatModeSelection,
  ChatModeSelectionContext,
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

function subAgentSelection(ctx: ChatModeSelectionContext): ChatModeSelection {
  return {
    selectedSubAgentId: ctx.subAgents[ctx.subAgentIndex]?.id ?? null,
    selectedToolId: null,
  };
}

function toolSelection(ctx: ChatModeSelectionContext): ChatModeSelection {
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

export function getCommandInputWithSelection(
  ctx: ChatModeKeymapContext,
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

function hasCommandSuggestions(ctx: ChatModeKeymapContext): boolean {
  return (
    !ctx.activePanelId &&
    ctx.suggestion.show &&
    ctx.suggestion.filtered.length > 0
  );
}

function inputKeymaps(ctx: ChatModeKeymapContext): ChatModeKeymapSpec[] {
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
  ctx: ChatModeKeymapContext,
  map: ChatModeKeymapSpec["map"],
): ChatModeKeymapSpec[] {
  return [
    {
      map,
      enabled: shouldEnableModalModeKeymap(ctx.isPaletteOpen),
      priority: 80,
    },
  ];
}

function renderConversation(
  ctx: ChatModeRenderContext,
  options: {
    showSubAgentPicker?: boolean;
    disableBlockHiding?: boolean;
    showCommandResult?: boolean;
  } = {},
) {
  const ActiveFeaturePanel = ctx.panel.active?.component;

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

      {options.showSubAgentPicker ? (
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

const inputMode: ChatModeDefinition = {
  render: (ctx) => renderConversation(ctx, { showCommandResult: true }),
  getHint: inputHint,
  getSelection: emptySelection,
  getKeymaps: inputKeymaps,
};

const subAgentPickerMode: ChatModeDefinition = {
  render: (ctx) => renderConversation(ctx, { showSubAgentPicker: true }),
  getHint: (ctx) => modeHint(ctx, `Enter view detail${sep}\u2191\u2193 navigate${sep}Esc close`),
  getSelection: subAgentSelection,
  getKeymaps: (ctx) => modalKeymap(ctx, {
    up: () => ctx.prevSubAgent(),
    down: () => ctx.nextSubAgent(),
    return: () => ctx.setChatMode("subagent-detail"),
    escape: () => ctx.setChatMode("input"),
  }),
};

const subAgentDetailMode: ChatModeDefinition = {
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
  getKeymaps: (ctx) => modalKeymap(ctx, {
    escape: () => ctx.setChatMode("subagent-picker"),
    "ctrl+o": () => ctx.setChatMode("subagent-picker"),
  }),
};

const toolFocusMode: ChatModeDefinition = {
  render: (ctx) => renderConversation(ctx, { disableBlockHiding: true }),
  getHint: (ctx) => modeHint(ctx, `Enter expand/collapse${sep}d detail${sep}Up/Down tools${sep}Ctrl+T/Esc back`),
  getSelection: toolSelection,
  getKeymaps: (ctx) => modalKeymap(ctx, {
    up: () => ctx.prevTool(),
    down: () => ctx.nextTool(),
    return: () => ctx.toggleSelectedTool(),
    d: () => ctx.openToolDetail(),
    escape: () => ctx.setChatMode("input"),
    "ctrl+t": () => ctx.setChatMode("input"),
  }),
};

const toolDetailMode: ChatModeDefinition = {
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
  getKeymaps: (ctx) => modalKeymap(ctx, {
    escape: () => ctx.setChatMode("tool-focus"),
    "ctrl+t": () => ctx.setChatMode("input"),
  }),
};

export const chatModeRegistry: Record<ChatMode, ChatModeDefinition> = {
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
  return <>{chatModeRegistry[context.chatMode].render(context)}</>;
}

export function getChatModeHint(ctx: ChatModeHintContext): string {
  return chatModeRegistry[ctx.chatMode].getHint(ctx);
}

export function getChatModeSelection(
  chatMode: ChatMode,
  ctx: ChatModeSelectionContext,
): ChatModeSelection {
  return chatModeRegistry[chatMode].getSelection(ctx);
}

export function getChatModeKeymaps(
  ctx: ChatModeKeymapContext,
): ChatModeKeymapSpec[] {
  return chatModeRegistry[ctx.chatMode].getKeymaps(ctx);
}
