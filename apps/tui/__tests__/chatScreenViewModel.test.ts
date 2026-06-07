import { describe, expect, it } from "vitest";
import type {
  AskQuestionRequest,
  CommandDefinition,
  ConfirmRequest,
  ProjectedBlock,
} from "@excelsior/core";
import {
  buildChatInteractionState,
  buildFooterModel,
  buildModeViewContext,
  buildPaletteModel,
  buildPendingActionModel,
  buildPendingQuestionModel,
  buildSuggestionsModel,
  countToolCalls,
  getChatPendingState,
} from "../src/hooks/chatScreenViewModel.js";

const noop = () => {};

function toolBlock(id = "tool_1"): ProjectedBlock & { type: "tool-call" } {
  return {
    type: "tool-call",
    id,
    toolName: "view",
    toolArgs: "{\"filePath\":\"README.md\"}",
    status: "completed",
    content: "README",
    timestamp: "2026-05-18T00:00:00.000Z",
  };
}

function subAgentBlock(id = "sub_1"): ProjectedBlock & { type: "sub-agent" } {
  return {
    type: "sub-agent",
    id,
    role: "reviewer",
    timestamp: "2026-05-18T00:00:00.000Z",
    state: {
      status: "running",
      latestLine: "checking",
      fullOutput: "checking",
      toolCalls: [],
      parts: [],
    },
  };
}

function command(name = "settings"): CommandDefinition {
  return {
    name,
    description: `Run ${name}`,
  };
}

function pendingRequest(): ConfirmRequest {
  return {
    callId: "confirm_1",
    toolName: "writeFile",
    args: "{\"filePath\":\"README.md\"}",
  };
}

function subAgentBlockWithTool(id = "sub_tool"): ProjectedBlock & { type: "sub-agent" } {
  const block = subAgentBlock(id);
  block.state.toolCalls = [{
    toolName: "runCommand",
    toolArgs: "{\"command\":\"npm test\"}",
    toolCallId: "tool_sub_1",
    status: "completed",
  }];
  return block;
}

function pendingFileChangeRequest(): ConfirmRequest {
  return {
    callId: "confirm_2",
    toolName: "editFile",
    args: "{\"filePath\":\"demo.ts\"}",
    filePath: "demo.ts",
    diff: [
      "--- demo.ts",
      "+++ demo.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n"),
  };
}

function pendingQuestion(): AskQuestionRequest {
  return {
    callId: "question_1",
    question: "Which surface?",
    options: [{ id: "both", label: "Desktop + TUI", description: "Use both clients." }],
    allowManual: true,
  };
}

describe("chat screen model builders", () => {
  it("builds no pending action when there is no pending confirmation", () => {
    expect(buildPendingActionModel(null)).toBeNull();
  });

  it("builds pending action props with display data", () => {
    const pending = pendingRequest();
    const model = buildPendingActionModel(pending);

    expect(model?.display.label).toBeTruthy();
    expect(model?.display.summary).toBeTruthy();
  });

  it("keeps pending file change preview behind the tool display model", () => {
    const model = buildPendingActionModel(pendingFileChangeRequest());

    expect(model?.display.command).toBe("edit(demo.ts)");
    expect(model?.display.fileChangePreview).toMatchObject({
      filePath: "demo.ts",
      action: "edit",
      added: 1,
      removed: 1,
    });
  });

  it("builds pending question props with input handlers", () => {
    const pending = pendingQuestion();
    const model = buildPendingQuestionModel({
      pending,
      answerInput: "both",
      setAnswerInput: noop,
      submitAnswer: noop,
      shouldSubmitAnswer: () => true,
    });

    expect(model?.pending).toBe(pending);
    expect(model?.input).toBe("both");
    expect(model?.shouldSubmit("both")).toBe(true);
  });

  it("hides command suggestions while the palette is open", () => {
    const model = buildSuggestionsModel({
      show: true,
      filtered: [command()],
      selectedIndex: 0,
      maxVisibleCount: 1,
      next: noop,
      prev: noop,
    }, true);

    expect(model.visible).toBe(false);
    expect(model.props.commands).toHaveLength(1);
  });

  it("shows palette when open", () => {
    const filtered = [command("settings"), command("session")];
    const model = buildPaletteModel({
      isOpen: true,
      search: "set",
      setSearch: noop,
      selectedIndex: 1,
      filtered,
      total: 2,
      open: noop,
      close: noop,
      toggle: noop,
      next: noop,
      prev: noop,
      insertCommand: noop,
    });

    expect(model.visible).toBe(true);
    expect(model.props.search).toBe("set");
    expect(model.props.filtered).toBe(filtered);
    expect(model.props.total).toBe(2);
    expect(model.props.selectedIndex).toBe(1);
  });

  it("builds footer props from mode, pending, panel, and counts", () => {
    expect(buildFooterModel({
      chatMode: "input",
      isLoading: true,
      pending: pendingRequest(),
      activePanelId: "session.picker",
      subAgentCount: 2,
      toolCallCount: 3,
      toolsExpanded: true,
    })).toEqual({
      chatMode: "input",
      isLoading: true,
      hasPending: true,
      activePanelId: "session.picker",
      subAgentCount: 2,
      toolCallCount: 3,
      toolsExpanded: true,
      totalTokens: undefined,
    });
  });

  it("marks footer pending state as a question when provided", () => {
    expect(buildFooterModel({
      chatMode: "input",
      isLoading: true,
      pending: pendingQuestion(),
      pendingKind: "question",
      activePanelId: null,
      subAgentCount: 0,
      toolCallCount: 0,
      toolsExpanded: false,
    })).toMatchObject({
      hasPending: true,
      pendingKind: "question",
    });
  });

  it("builds chat control plane state from one input", () => {
    const selectedSubAgent = subAgentBlockWithTool("sub_selected");
    const suggestion = {
      show: false,
      filtered: [],
      selectedIndex: 0,
      maxVisibleCount: 0,
      next: noop,
      prev: noop,
    };

    const plane = buildChatInteractionState({
      displayBlocks: [toolBlock("tool_root"), selectedSubAgent],
      chatMode: "input",
      isLoading: false,
      pendingConfirmation: null,
      pendingQuestion: pendingQuestion(),
      activePanelId: null,
      isPaletteOpen: false,
      suggestion,
      setInput: noop,
      submit: noop,
      cancel: noop,
      toggleMode: () => undefined,
      openSubAgent: noop,
      subAgentBlocks: [selectedSubAgent],
      toolsExpanded: true,
      toggleToolsExpanded: noop,
      navigateUp: noop,
      navigateDown: noop,
      setChatMode: noop,
      nextSubAgent: noop,
      prevSubAgent: noop,
    });

    expect(plane.pendingKind).toBe("question");
    expect(plane.toolCallCount).toBe(2);
    expect(plane.inputModeKeymap.toolCallCount).toBe(2);
    expect(plane.footer).toMatchObject({
      hasPending: true,
      pendingKind: "question",
      toolCallCount: 2,
      subAgentCount: 1,
      toolsExpanded: true,
    });
  });

  it("keeps chat control plane derivations local", () => {
    expect(countToolCalls([
      toolBlock("tool_root"),
      subAgentBlockWithTool("sub_tool"),
    ])).toBe(2);
    expect(getChatPendingState({
      pendingConfirmation: pendingRequest(),
      pendingQuestion: null,
    }).pendingKind).toBe("confirmation");
  });

  it("builds sub-agent picker context with command expansion state", () => {
    const selectedTool = toolBlock("tool_selected");
    const otherTool = toolBlock("tool_other");
    const selectedSubAgent = subAgentBlock("sub_selected");
    const displayBlocks: ProjectedBlock[] = [selectedSubAgent, selectedTool, otherTool];
    const context = buildModeViewContext({
      chatMode: "subagent-picker",
      displayBlocks,
      inputValue: "/review ",
      setInput: noop,
      handleSubmit: noop,
      isLoading: false,
      pending: null,
      paletteOpen: false,
      commandResult: "done",
      agentMode: "act",
      activePanel: undefined,
      featureContext: {
        sessions: [],
        currentSessionId: null,
        switchSession: noop,
        deleteSession: noop,
        closePanel: noop,
      },
      subAgents: [selectedSubAgent],
      subAgentIndex: 0,
      toolsExpanded: true,
      viewportKey: "none:0",
    });

    expect(context.chatMode).toBe("subagent-picker");
    if (context.chatMode !== "subagent-picker") throw new Error("expected sub-agent picker context");
    expect(context.input.value).toBe("/review ");
    expect(context.runtime.commandResult).toBe("done");
    expect(context.transcript.blocks).toBe(displayBlocks);
    expect(context.transcript.toolsExpanded).toBe(true);
    expect(context.subAgents.blocks).toEqual([selectedSubAgent]);
    expect("tools" in context).toBe(false);
  });

  it("builds sub-agent detail context with only owned mode state", () => {
    const selectedSubAgent = subAgentBlock("sub_selected");
    const context = buildModeViewContext({
      chatMode: "subagent-detail",
      displayBlocks: [selectedSubAgent],
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
      subAgents: [selectedSubAgent],
      subAgentIndex: 0,
      toolsExpanded: true,
      viewportKey: "none:0",
    });

    expect(context.chatMode).toBe("subagent-detail");
    if (context.chatMode !== "subagent-detail") throw new Error("expected sub-agent detail context");
    expect(context.subAgents.blocks).toEqual([selectedSubAgent]);
    expect(context.toolsExpanded).toBe(true);
    expect("transcript" in context).toBe(false);
    expect("tools" in context).toBe(false);
  });
});
