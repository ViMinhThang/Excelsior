import type { ChatModeRenderContext } from "../../chatModes/types.js";
import type { BuildModeViewContextInput } from "./types.js";

export function buildModeViewContext({
  workspace,
  sessionId,
  chatMode,
  turns,
  tasks,
  inputValue,
  setInput,
  inputFocused,
  setInputFocused,
  handleSubmit,
  shouldSubmit,
  isLoading,
  pending,
  paletteOpen,
  commandResult,
  agentMode,
  settings,
  activePanel,
  featureContext,
  subAgents,
  subAgentIndex,
  toolsExpanded,
  viewportKey,
}: BuildModeViewContextInput): ChatModeRenderContext {
  const conversation = {
    workspace,
    sessionId,
    input: {
      value: inputValue,
      setValue: setInput,
      submit: handleSubmit,
      shouldSubmit,
      focused: inputFocused,
      setFocused: setInputFocused,
    },
    runtime: {
      isLoading,
      pending,
      paletteOpen,
      commandResult,
      agentMode,
      settings,
    },
    transcript: {
      turns,
      tasks,
      toolsExpanded,
      viewportKey,
    },
    panel: {
      active: activePanel,
      context: featureContext,
    },
  };

  switch (chatMode) {
    case "input":
      return {
        chatMode,
        ...conversation,
      };
    case "subagent-picker":
      return {
        chatMode,
        ...conversation,
        subAgents: {
          blocks: subAgents,
          selectedIndex: subAgentIndex,
        },
      };
    case "subagent-detail":
      return {
        chatMode,
        toolsExpanded,
        subAgents: {
          blocks: subAgents,
          selectedIndex: subAgentIndex,
        },
      };
  }
}
