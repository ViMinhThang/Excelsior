import { act } from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentClientState, AgentHost } from "@excelsior/client";
import type { ProjectedBlock } from "@excelsior/core";
import { AgentHostProvider } from "../src/context/AgentHostContext.js";
import { NavigationProvider } from "../src/context/NavigationContext.js";
import { useChatInteractionController } from "../src/hooks/useChatInteractionController.js";

const CLEAR_SEQUENCE = "\u001b[2J\u001b[3J\u001b[H";
const timestamp = "2026-05-18T00:00:00.000Z";

class MutableHost implements AgentHost {
  private state: AgentClientState;
  private readonly listeners = new Set<() => void>();

  constructor(initialBlocks: ProjectedBlock[]) {
    this.state = {
      displayBlocks: initialBlocks,
      isLoading: false,
      sessions: [],
      currentSessionId: "ses_1",
      workspace: {
        id: "ws_1",
        name: "Workspace",
        rootPath: "C:/workspace",
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
  return <Text>{screen.modeView.chatMode}</Text>;
}

function renderController(host: AgentHost) {
  return render(
    <AgentHostProvider host={host}>
      <NavigationProvider>
        <Probe />
      </NavigationProvider>
    </AgentHostProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useChatInteractionController history reset", () => {
  it("does not clear stdout when same-session submit appends static history", () => {
    const host = new MutableHost([
      userBlock("user_1"),
      assistantBlock("assistant_1"),
    ]);
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const screen = renderController(host);

    writeSpy.mockClear();
    act(() => {
      host.setState({
        displayBlocks: [
          userBlock("user_1"),
          assistantBlock("assistant_1"),
          userBlock("user_2", "next"),
        ],
      });
    });

    expect(writeSpy.mock.calls.some((call) => String(call[0]).includes(CLEAR_SEQUENCE))).toBe(false);
    screen.unmount();
  });

  it("clears stdout when same-session static history is removed", () => {
    const host = new MutableHost([
      userBlock("user_1"),
      assistantBlock("assistant_1"),
      userBlock("user_2"),
    ]);
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const screen = renderController(host);

    writeSpy.mockClear();
    act(() => {
      host.setState({ displayBlocks: [] });
    });

    expect(writeSpy.mock.calls.some((call) => String(call[0]).includes(CLEAR_SEQUENCE))).toBe(true);
    screen.unmount();
  });
});
