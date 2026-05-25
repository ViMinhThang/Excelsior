import { describe, expect, it } from "vitest";
import type { CommandDefinition, ConfirmRequest, ProjectedBlock } from "@excelsior/core";
import {
  buildFooterModel,
  buildModeViewContext,
  buildPaletteModel,
  buildPendingActionModel,
  buildSuggestionsModel,
} from "../src/hooks/useChatScreenModel.js";

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

describe("chat screen model builders", () => {
  it("builds no pending action when there is no pending confirmation", () => {
    expect(buildPendingActionModel(null)).toBeNull();
  });

  it("builds pending action props with display data", () => {
    const pending = pendingRequest();
    const model = buildPendingActionModel(pending);

    expect(model?.pending).toBe(pending);
    expect(model?.display.label).toBeTruthy();
    expect(model?.display.summary).toBeTruthy();
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

  it("exposes palette props unchanged", () => {
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

  it("builds footer props from mode, pending, panel, workspace, and counts", () => {
    expect(buildFooterModel({
      chatMode: "tool-focus",
      isLoading: true,
      pending: pendingRequest(),
      activePanelId: "session.picker",
      subAgentCount: 2,
      toolCount: 3,
      workspaceRootPath: "C:/repo",
    })).toEqual({
      chatMode: "tool-focus",
      isLoading: true,
      hasPending: true,
      activePanelId: "session.picker",
      subAgentCount: 2,
      toolCount: 3,
      workspaceRootPath: "C:/repo",
    });
  });

  it("builds nested mode view context with selected agent and tool state", () => {
    const selectedTool = toolBlock("tool_selected");
    const otherTool = toolBlock("tool_other");
    const selectedSubAgent = subAgentBlock("sub_selected");
    const displayBlocks: ProjectedBlock[] = [selectedSubAgent, selectedTool, otherTool];
    const expandedToolIds = new Set(["tool_selected"]);
    const context = buildModeViewContext({
      chatMode: "tool-detail",
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
      toolBlocks: [otherTool, selectedTool],
      selectedSubAgentId: selectedSubAgent.id,
      selectedToolId: selectedTool.id,
      expandedToolIds,
    });

    expect(context.input.value).toBe("/review ");
    expect(context.runtime.commandResult).toBe("done");
    expect(context.transcript.blocks).toBe(displayBlocks);
    expect(context.transcript.selectedSubAgentId).toBe(selectedSubAgent.id);
    expect(context.transcript.expandedToolIds).toBe(expandedToolIds);
    expect(context.subAgents.blocks).toEqual([selectedSubAgent]);
    expect(context.tools.blocks).toEqual([otherTool, selectedTool]);
    expect(context.tools.selectedId).toBe(selectedTool.id);
    expect(context.tools.selectedBlock).toBe(selectedTool);
  });
});
