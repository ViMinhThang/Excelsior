import { createElement, memo, useCallback, useEffect, useRef, useState, type FC } from "react";
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core";
import { formatAgentMode } from "@excelsior/core";
import ChatHistory from "../components/chat/ChatHistory.js";
import ChatInput from "../components/chat/ChatInput.js";
import TaskList from "../components/chat/TaskList.js";
import ThinkingIndicator from "../components/chat/ThinkingIndicator.js";
import { useKeymap } from "../hooks/useKeymap.js";
import { theme } from "../theme.js";
import type { InputModeRenderContext } from "./types.js";
import {
  isScrolledBackFromLatest,
  getScrollSnapshot,
  scrollToLatest,
  getTranscriptArrowScrollTop,
} from "../lib/scrollUtilities.js";
import ScrollToLatestButton from "../components/chat/ScrollToLatestButton.js";

interface ConversationViewProps {
  ctx: InputModeRenderContext;
  options: {
    showCommandResult?: boolean;
  };
}

const ConversationView: FC<ConversationViewProps> = ({ ctx, options }) => {
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);
  const [isScrolledBack, setIsScrolledBack] = useState(false);

  const refreshScrollState = useCallback(() => {
    const scrollbox = scrollboxRef.current;
    if (!scrollbox) return;
    setIsScrolledBack(isScrolledBackFromLatest(getScrollSnapshot(scrollbox)));
  }, []);

  const scheduleScrollStateRefresh = useCallback(() => {
    queueMicrotask(refreshScrollState);
  }, [refreshScrollState]);

  useEffect(() => {
    scheduleScrollStateRefresh();
  }, [
    ctx.transcript.turns,
    ctx.transcript.toolsExpanded,
    ctx.transcript.viewportKey,
    scheduleScrollStateRefresh,
  ]);

  const handleScrollToLatest = useCallback(() => {
    const scrollbox = scrollboxRef.current;
    if (!scrollbox) return;
    scrollToLatest(scrollbox);
    setIsScrolledBack(false);
  }, []);

  const scrollTranscript = useCallback((direction: "up" | "down") => {
    const scrollbox = scrollboxRef.current;
    if (!scrollbox) return;
    scrollbox.scrollTo({
      x: scrollbox.scrollLeft,
      y: getTranscriptArrowScrollTop(getScrollSnapshot(scrollbox), direction),
    });
    scheduleScrollStateRefresh();
  }, [scheduleScrollStateRefresh]);

  const transcriptOwnsArrows =
    !ctx.input.focused &&
    !ctx.runtime.pending &&
    !ctx.runtime.paletteOpen &&
    !ctx.panel.active;

  useKeymap(
    {
      up: () => scrollTranscript("up"),
      down: () => scrollTranscript("down"),
    },
    { enabled: transcriptOwnsArrows, priority: 20 },
  );

  const blurInput = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    ctx.input.setFocused(false);
  }, [ctx.input]);

  const focusInput = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    ctx.input.setFocused(true);
  }, [ctx.input]);

  const ActiveFeaturePanel = ctx.panel.active?.component;

  return (
    <box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} height="100%" width="100%">
      <box flexGrow={1} flexShrink={1} minHeight={0} width="100%" position="relative">
        <scrollbox
          ref={scrollboxRef}
          key={ctx.transcript.viewportKey}
          flexGrow={1}
          flexShrink={1}
          minHeight={0}
          width="100%"
          scrollY
          stickyScroll
          stickyStart="bottom"
          onMouseScroll={scheduleScrollStateRefresh}
          onMouseDown={blurInput}
          onSizeChange={scheduleScrollStateRefresh}
        >
          <box flexDirection="column" width="100%">
            <ChatHistory
              turns={ctx.transcript.turns}
              toolsExpanded={ctx.transcript.toolsExpanded}
            />
          </box>
        </scrollbox>

        {isScrolledBack ? (
          <ScrollToLatestButton onPress={handleScrollToLatest} />
        ) : null}
      </box>

      {ctx.runtime.isLoading && (
        <box flexShrink={0} marginTop={1} width="100%">
          <ThinkingIndicator />
        </box>
      )}

      {ActiveFeaturePanel ? (
        <box flexShrink={0} width="100%">
          {createElement(ActiveFeaturePanel, { context: ctx.panel.context })}
        </box>
      ) : (
        <box flexShrink={0} flexDirection="column" width="100%">
          <TaskList tasks={ctx.transcript.tasks} />
          <ChatInput
            value={ctx.input.value}
            onChange={ctx.input.setValue}
            onSubmit={ctx.input.submit}
            shouldSubmit={ctx.input.shouldSubmit}
            placeholder="Type your coding task here..."
            focus={
              ctx.input.focused &&
              ctx.chatMode === "input" &&
              !ctx.runtime.pending &&
              !ctx.runtime.paletteOpen
            }
            onMouseDown={focusInput}
          />
          <box flexDirection="row" gap={1}>
            <text fg={theme.colors.modeHintKey} bg={theme.colors.modeHintKeyBg}>
              {" Shift+Tab "}
            </text>
            <text
              fg={
                ctx.runtime.agentMode === "plan"
                  ? theme.colors.modeHintPlan
                  : theme.colors.modeHintAct
              }
              bg={
                ctx.runtime.agentMode === "plan"
                  ? theme.colors.modeHintPlanBg
                  : theme.colors.modeHintActBg
              }
            >
              {` ${formatAgentMode(ctx.runtime.agentMode)} `}
            </text>
          </box>
          {!options.showCommandResult || !ctx.runtime.commandResult ? null : (
            <box marginTop={1} flexDirection="column">
              <text fg={theme.colors.secondary}>{ctx.runtime.commandResult}</text>
            </box>
          )}
        </box>
      )}
    </box>
  );
};

export function renderConversation(
  ctx: InputModeRenderContext,
  options: {
    showCommandResult?: boolean;
  } = {},
) {
  return <ConversationView ctx={ctx} options={options} />;
}

export default memo(ConversationView);
