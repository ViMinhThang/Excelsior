import { Box, Text } from "ink";
import { formatAgentMode } from "@excelsior/core";
import ChatHistory from "../components/chat/ChatHistory.js";
import ChatInput from "../components/chat/ChatInput.js";
import SubAgentPickerPanel from "../features/review/components/SubAgentPickerPanel.js";
import ThinkingIndicator from "../components/chat/ThinkingIndicator.js";
import { theme } from "../theme.js";
import type {
  InputModeRenderContext,
  SubAgentPickerModeRenderContext,
} from "./types.js";

type ConversationModeContext =
  | InputModeRenderContext
  | SubAgentPickerModeRenderContext;

export function renderConversation(
  ctx: ConversationModeContext,
  options: {
    showSubAgentPicker?: boolean;
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
          commandsExpanded={ctx.transcript.commandsExpanded}
        />
      </Box>

      {showSubAgentPicker ? (
        <SubAgentPickerPanel
          subAgents={ctx.subAgents.blocks}
          selectedIndex={ctx.subAgents.selectedIndex}
          showToolCalls={ctx.transcript.commandsExpanded}
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
