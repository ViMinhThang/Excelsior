import { useMemo } from "react";
import {
  buildModeViewContext,
  buildPaletteModel,
  buildPendingActionModel,
  buildPendingQuestionModel,
  buildSuggestionsModel,
  type ChatScreenViewModel,
} from "./chatScreenViewModel.js";
import { useNavigation } from "../context/NavigationContext.js";
import { useAgentHostClient } from "./useAgentHostClient.js";
import { useToolConfirmation } from "./useToolConfirmation.js";
import { useQuestionResponse } from "./useQuestionResponse.js";
import { useChatRuntimeInteraction } from "./useChatRuntimeInteraction.js";
import { estimateTranscriptTokens } from "../lib/tokenEstimate.js";
import { useGitBranch } from "./useGitBranch.js";

export function useChatInteractionController(): ChatScreenViewModel {
  const { navigate } = useNavigation();
  const agent = useAgentHostClient();
  const {
    turns,
    tasks,
    isLoading,
    sessions,
    currentSessionId,
    workspace,
    llm,
    mode,
    pendingConfirmation,
    pendingQuestion,
    reflection,
  } = agent.state;
  const settings = agent.getSettings();
  const branchName = useGitBranch(workspace.rootPath);

  const confirmation = useToolConfirmation(
    pendingConfirmation,
    agent.respondToConfirmation,
    agent.approveAllConfirmations,
  );
  const question = useQuestionResponse(
    pendingQuestion,
    agent.respondToQuestion,
  );

  const runtime = useChatRuntimeInteraction({
    turns,
    isLoading,
    currentSessionId,
    mode,
    sessions,
    commands: agent.getCommands(),
    confirmation,
    question,
    switchSession: agent.switchSession,
    deleteSession: agent.deleteSession,
    send: agent.send,
    executeCommand: agent.executeCommand,
    cancel: agent.cancel,
    toggleMode: agent.toggleMode,
    navigate,
  });

  const totalTokens = useMemo(
    () => estimateTranscriptTokens(runtime.derivedTurns.flatMap((t) => t.blocks)),
    [runtime.derivedTurns],
  );

  return {
    header: {
      workspaceName: workspace.name,
      branchName,
      modelLabel: `${llm.providerName} · ${llm.modelName}`,
    },
    modeView: buildModeViewContext({
      workspace,
      sessionId: currentSessionId,
      chatMode: runtime.subAgentNav.chatMode,
      turns: runtime.derivedTurns,
      tasks: tasks ?? [],
      inputValue: runtime.inputHistory.input,
      setInput: runtime.inputHistory.setInput,
      handleSubmit: runtime.handleSubmit,
      shouldSubmit: runtime.shouldSubmit,
      isLoading,
      pending: runtime.interactionState.pending,
      paletteOpen: runtime.palette.isOpen,
      commandResult: runtime.command.commandResult,
      agentMode: runtime.mode,
      settings,
      activePanel: runtime.panel.activePanel,
      featureContext: runtime.panel.panelContext,
      subAgents: runtime.subAgentNav.subAgentBlocks,
      subAgentIndex: runtime.subAgentNav.subAgentIndex,
      toolsExpanded: runtime.toolsExpanded,
      viewportKey: runtime.viewportKey,
    }),
    pendingAction: buildPendingActionModel(
      confirmation.pending,
      confirmation.scrollOffset,
      confirmation.activeHunkIndex,
      confirmation.hunkCount,
    ),
    pendingQuestion: buildPendingQuestionModel({
      pending: question.pending,
      answerInput: question.input,
      setAnswerInput: question.setInput,
      submitAnswer: question.submit,
      shouldSubmitAnswer: question.shouldSubmit,
    }),
    suggestions: buildSuggestionsModel(runtime.suggestion, runtime.palette.isOpen),
    palette: buildPaletteModel(runtime.palette),
    footer: {
      ...runtime.interactionState.footer,
      reflection,
      totalTokens,
      autoApproveWorkspaceEdits: settings.autoApproveWorkspaceEdits ?? false,
    },
  };
}
