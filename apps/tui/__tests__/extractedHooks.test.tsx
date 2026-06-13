import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectedTurn } from "@excelsior/core";
import { renderTui } from "../src/platform/opentui/testing/renderTui.js";
import { useOptimisticTranscript } from "../src/hooks/useOptimisticTranscript.js";
import { useDoubleEscapeCancel } from "../src/hooks/useDoubleEscapeCancel.js";
import { useTranscriptViewportReset } from "../src/hooks/useTranscriptViewportReset.js";
import { useState } from "react";

function OptimisticTranscriptProbe({
  initialTurns,
  isLoading,
  currentSessionId,
  onDerivedTurns,
  onSendWithOptimisticMessage,
}: {
  initialTurns: ProjectedTurn[];
  isLoading: boolean;
  currentSessionId: string | null;
  onDerivedTurns: (turns: ProjectedTurn[]) => void;
  onSendWithOptimisticMessage: (cb: (content: string) => void) => void;
}) {
  const [turns, setTurns] = useState(initialTurns);
  const { derivedTurns, sendWithOptimisticMessage } = useOptimisticTranscript(
    turns,
    isLoading,
    currentSessionId,
    (content) => {
      setTurns((prev) => [
        ...prev,
        {
          id: "turn_new",
          status: "completed",
          blocks: [{ type: "user", id: "user_new", content, timestamp: "2026-05-18T12:34:56.000Z" }],
        },
      ]);
    }
  );

  onDerivedTurns(derivedTurns);
  onSendWithOptimisticMessage(sendWithOptimisticMessage);

  return <text>optimistic</text>;
}

function DoubleEscapeCancelProbe({
  isLoading,
  cancel,
  onRequestTurnCancel,
}: {
  isLoading: boolean;
  cancel: () => void;
  onRequestTurnCancel: (cb: () => void) => void;
}) {
  const { requestTurnCancel } = useDoubleEscapeCancel(isLoading, cancel);
  onRequestTurnCancel(requestTurnCancel);
  return <text>escape-cancel</text>;
}

function ViewportResetProbe({
  currentSessionId,
  derivedTurns,
  onHistoryResetKey,
}: {
  currentSessionId: string | null;
  derivedTurns: ProjectedTurn[];
  onHistoryResetKey: (key: number) => void;
}) {
  const { historyResetKey } = useTranscriptViewportReset(currentSessionId, derivedTurns);
  onHistoryResetKey(historyResetKey);
  return <text>viewport-reset</text>;
}

describe("Extracted TUI Hooks", () => {
  it("useOptimisticTranscript handles optimistic message adding and clearing", async () => {
    let currentDerivedTurns: ProjectedTurn[] = [];
    let triggerSend: ((content: string) => void) | null = null;

    const initialTurns: ProjectedTurn[] = [
      {
        id: "turn_1",
        status: "completed",
        blocks: [{ type: "user", id: "user_1", content: "initial", timestamp: "2026-05-18T00:00:00.000Z" }],
      },
    ];

    const screen = await renderTui(
      <OptimisticTranscriptProbe
        initialTurns={initialTurns}
        isLoading={false}
        currentSessionId="ses_1"
        onDerivedTurns={(t) => {
          currentDerivedTurns = t;
        }}
        onSendWithOptimisticMessage={(cb) => {
          triggerSend = cb;
        }}
      />
    );

    expect(currentDerivedTurns).toHaveLength(1);
    expect(currentDerivedTurns[0].id).toBe("turn_1");

    await act(async () => {
      triggerSend!("hello");
      await screen.flush();
    });

    expect(currentDerivedTurns).toHaveLength(2);
    expect((currentDerivedTurns[1].blocks[0] as any).content).toBe("hello");
    expect(currentDerivedTurns[1].id).toBe("turn_new");

    screen.renderer.destroy();
  });

  it("useDoubleEscapeCancel registers twice and cancels", async () => {
    const cancelSpy = vi.fn();
    let triggerCancel: (() => void) | null = null;

    const screen = await renderTui(
      <DoubleEscapeCancelProbe
        isLoading={true}
        cancel={cancelSpy}
        onRequestTurnCancel={(cb) => {
          triggerCancel = cb;
        }}
      />
    );

    expect(cancelSpy).not.toHaveBeenCalled();

    await act(async () => {
      triggerCancel!();
      await screen.flush();
    });
    expect(cancelSpy).not.toHaveBeenCalled();

    await act(async () => {
      triggerCancel!();
      await screen.flush();
    });
    expect(cancelSpy).toHaveBeenCalledTimes(1);

    screen.renderer.destroy();
  });

  it("useTranscriptViewportReset triggers key changes on turn removals", async () => {
    let currentKey = -1;
    const initialTurns: ProjectedTurn[] = [
      {
        id: "turn_1",
        status: "completed",
        blocks: [
          { type: "user", id: "user_1", content: "initial", timestamp: "2026-05-18T00:00:00.000Z" },
          { type: "user", id: "user_2", content: "second", timestamp: "2026-05-18T00:00:01.000Z" }
        ],
      },
    ];

    const screen = await renderTui(
      <ViewportResetProbe
        currentSessionId="ses_1"
        derivedTurns={initialTurns}
        onHistoryResetKey={(k) => {
          currentKey = k;
        }}
      />
    );

    const firstKey = currentKey;

    await act(async () => {
      screen.rerender(
        <ViewportResetProbe
          currentSessionId="ses_1"
          derivedTurns={[]}
          onHistoryResetKey={(k) => {
            currentKey = k;
          }}
        />
      );
      await screen.flush();
    });

    expect(currentKey).toBeGreaterThan(firstKey);

    screen.renderer.destroy();
  });
});
