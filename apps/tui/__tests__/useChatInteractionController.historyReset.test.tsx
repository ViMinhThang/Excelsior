import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentClientState, AgentHost } from "@excelsior/client";
import type { ProjectedBlock, ProjectedTurn } from "@excelsior/core";
import { AgentHostProvider } from "../src/context/AgentHostContext.js";
import { NavigationProvider } from "../src/context/NavigationContext.js";
import { useChatInteractionController } from "../src/hooks/useChatInteractionController.js";
import { rendererMocks } from "../src/testing/rendererMocks.js";
import { renderTui } from "../src/platform/opentui/testing/renderTui.js";

const timestamp = "2026-05-18T00:00:00.000Z";

class MutableHost implements AgentHost {
  private state: AgentClientState;
  private readonly listeners = new Set<() => void>();

  constructor(initialBlocks: ProjectedBlock[]) {
    this.state = {
      turns: [{ id: "turn_1", status: "completed", blocks: initialBlocks }],
      isLoading: false,
      sessions: [],
      currentSessionId: "ses_1",
      workspace: {
        id: "ws_1",
        name: "Workspace",
        rootPath: "C:/workspace",
      },
      llm: {
        providerName: "DeepSeek",
        modelName: "deepseek-v4-flash",
      },
      mode: "act",
      pendingConfirmation: null,
      pendingQuestion: null,
    };
  }

  getState(): AgentClientState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getCatalog() {
    return {
      commands: [],
      settings: {
        deepseekApiKey: "",
        githubToken: "",
        agentToolLoopSteps: "unlimited",
      },
    };
  }

  async dispatch() {
    return { type: "none" as const };
  }

  dispose(): void {}

  setState(next: Partial<AgentClientState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
}

function userBlock(id: string, content = id): ProjectedBlock {
  return {
    type: "user",
    id,
    content,
    timestamp,
  };
}

function assistantBlock(id: string, content = id): ProjectedBlock {
  return {
    type: "assistant",
    id,
    content,
    timestamp,
  };
}

function Probe() {
  const screen = useChatInteractionController();
  return <text>{screen.modeView.chatMode}</text>;
}

async function renderController(host: AgentHost) {
  return renderTui(
    <AgentHostProvider host={host}>
      <NavigationProvider>
        <Probe />
      </NavigationProvider>
    </AgentHostProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useChatInteractionController history reset", () => {
  it("does not refresh the viewport when same-session submit appends static history", async () => {
    const host = new MutableHost([
      userBlock("user_1"),
      assistantBlock("assistant_1"),
    ]);
    const screen = await renderController(host);

    rendererMocks.requestRender.mockClear();
    rendererMocks.resize.mockClear();
    await act(async () => {
      host.setState({
        turns: [{
          id: "turn_1",
          status: "completed",
          blocks: [
            userBlock("user_1"),
            assistantBlock("assistant_1"),
            userBlock("user_2", "next"),
          ],
        }],
      });
      await screen.flush();
    });

    expect(rendererMocks.requestRender).not.toHaveBeenCalled();
    expect(rendererMocks.resize).not.toHaveBeenCalled();
    screen.renderer.destroy();
  });

  it("refreshes the viewport when same-session static history is removed", async () => {
    const host = new MutableHost([
      userBlock("user_1"),
      assistantBlock("assistant_1"),
      userBlock("user_2"),
    ]);
    const screen = await renderController(host);

    rendererMocks.requestRender.mockClear();
    rendererMocks.resize.mockClear();
    await act(async () => {
      host.setState({ turns: [] });
      await screen.flush();
    });

    expect(rendererMocks.requestRender).toHaveBeenCalled();
    expect(rendererMocks.resize).toHaveBeenCalledWith(80, 24);
    screen.renderer.destroy();
  });

  it("refreshes the viewport when switching sessions", async () => {
    const host = new MutableHost([
      userBlock("user_1"),
      assistantBlock("assistant_1"),
    ]);
    const screen = await renderController(host);

    rendererMocks.requestRender.mockClear();
    rendererMocks.resize.mockClear();
    await act(async () => {
      host.setState({
        currentSessionId: "ses_2",
        turns: [{
          id: "turn_2",
          status: "completed",
          blocks: [
            userBlock("user_9"),
            assistantBlock("assistant_9"),
          ],
        }],
      });
      await screen.flush();
    });

    expect(rendererMocks.requestRender).toHaveBeenCalled();
    expect(rendererMocks.resize).toHaveBeenCalledWith(80, 24);
    screen.renderer.destroy();
  });
});