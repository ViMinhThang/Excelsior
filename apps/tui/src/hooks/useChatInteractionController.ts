import { useMemo } from "react";
import { checkAgentsMetadataLoaded } from "../platform/workspace.js";
import {
  buildModeViewContext,
  buildPaletteModel,
  buildPendingActionModel,
  buildPendingQuestionModel,
  buildSuggestionsModel,
  buildThemeModalModel,
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
  const commands = agent.getCommands();
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
    commands,
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
  const contextLabel = useMemo(() => {
    const memory = settings.reflectionMemoryEnabled ? "memory on" : "memory off";
    const agents = checkAgentsMetadataLoaded(workspace.rootPath) ? "AGENTS.md loaded" : "no AGENTS.md";
    const skillCount = commands.filter((command) => command.category === "skills").length;
    const skills = `${skillCount} skill${skillCount === 1 ? "" : "s"}`;
    return `${memory} · ${agents} · ${skills} · ${(totalTokens / 1000).toFixed(1)}k transcript`;
  }, [commands, settings.reflectionMemoryEnabled, totalTokens, workspace.rootPath]);

  return {
    header: {
      workspaceName: workspace.name,
      branchName,
      modelLabel: `${llm.providerName} · ${llm.modelName}`,
      contextLabel,
    },
    modeView: buildModeViewContext({
      workspace,
      sessionId: currentSessionId,
      chatMode: "input",
      turns: runtime.derivedTurns,
      tasks: tasks ?? [],
      inputValue: runtime.inputHistory.input,
      setInput: runtime.inputHistory.setInput,
      inputFocused: runtime.inputFocused,
      setInputFocused: runtime.setInputFocused,
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
    suggestions: buildSuggestionsModel(
      runtime.suggestion,
      runtime.palette.isOpen || runtime.themeModal.isOpen,
    ),
    palette: buildPaletteModel(runtime.palette),
    themeModal: buildThemeModalModel(runtime.themeModal.isOpen, {
      selectedIndex: runtime.themeModal.selectedIndex,
      activeThemeName: runtime.themeModal.activeThemeName,
      onNext: runtime.themeModal.next,
      onPrev: runtime.themeModal.prev,
      onApply: runtime.themeModal.apply,
      onClose: runtime.themeModal.close,
    }),
    footer: {
      ...runtime.interactionState.footer,
      reflection,
      totalTokens,
      autoApproveWorkspaceEdits: settings.autoApproveWorkspaceEdits ?? false,
    },
  };
}
