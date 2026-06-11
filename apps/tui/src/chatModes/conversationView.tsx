import { createElement, memo, useCallback, useEffect, useRef, useState, type FC } from "react";
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core";
import { formatAgentMode } from "@excelsior/core";
import ChatHistory from "../components/chat/ChatHistory.js";
import ChatInput from "../components/chat/ChatInput.js";
import SubAgentPickerPanel from "../components/subAgents/SubAgentPickerPanel.js";
import ThinkingIndicator from "../components/chat/ThinkingIndicator.js";
import { textAttrs } from "../platform/opentui/textAttributes.js";
import { theme } from "../theme.js";
import type {
  InputModeRenderContext,
  SubAgentPickerModeRenderContext,
} from "./types.js";

type ConversationModeContext =
  | InputModeRenderContext
  | SubAgentPickerModeRenderContext;

interface ScrollSnapshot {
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
}

const SCROLL_BOTTOM_EPSILON = 1;

export function isScrolledBackFromLatest(
  snapshot: ScrollSnapshot,
  epsilon = SCROLL_BOTTOM_EPSILON,
): boolean {
  const maxScrollTop = Math.max(0, snapshot.scrollHeight - snapshot.viewportHeight);
  return maxScrollTop > epsilon && snapshot.scrollTop < maxScrollTop - epsilon;
}

function getScrollSnapshot(scrollbox: ScrollBoxRenderable): ScrollSnapshot {
  return {
    scrollTop: scrollbox.scrollTop,
    scrollHeight: scrollbox.scrollHeight,
    viewportHeight: scrollbox.viewport.height,
  };
}

function scrollToLatest(scrollbox: ScrollBoxRenderable): void {
  scrollbox.scrollTo({
    x: scrollbox.scrollLeft,
    y: Math.max(0, scrollbox.scrollHeight - scrollbox.viewport.height),
  });
}

export interface ScrollToLatestButtonProps {
  onPress: () => void;
}

export const ScrollToLatestButton: FC<ScrollToLatestButtonProps> = ({ onPress }) => {
  const handleMouseDown = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onPress();
  }, [onPress]);

  return (
    <box
      position="absolute"
      left={0}
      bottom={1}
      width="100%"
      justifyContent="center"
      alignItems="center"
      zIndex={10}
    >
      <box onMouseDown={handleMouseDown}>
        <text
          fg={theme.colors.muted}
          attributes={textAttrs({ dim: true })}
        >
          {"\u2193"}
        </text>
      </box>
    </box>
  );
};

interface ConversationViewProps {
  ctx: ConversationModeContext;
  options: {
    showSubAgentPicker?: boolean;
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

  const ActiveFeaturePanel = ctx.panel.active?.component;
  const showSubAgentPicker = options.showSubAgentPicker && "subAgents" in ctx;

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
          onSizeChange={scheduleScrollStateRefresh}
        >
          <box flexDirection="column" width="100%">
            <ChatHistory
              turns={ctx.transcript.turns}
              toolsExpanded={ctx.transcript.toolsExpanded}
            />

            {showSubAgentPicker ? (
              <SubAgentPickerPanel
                subAgents={ctx.subAgents.blocks}
                selectedIndex={ctx.subAgents.selectedIndex}
                showToolCalls={ctx.transcript.toolsExpanded}
              />
            ) : null}
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
          <ChatInput
            value={ctx.input.value}
            onChange={ctx.input.setValue}
            onSubmit={ctx.input.submit}
            shouldSubmit={ctx.input.shouldSubmit}
            placeholder="Type your coding task here..."
            focus={ctx.chatMode === "input" && !ctx.runtime.pending && !ctx.runtime.paletteOpen}
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
  ctx: ConversationModeContext,
  options: {
    showSubAgentPicker?: boolean;
    showCommandResult?: boolean;
  } = {},
) {
  return <ConversationView ctx={ctx} options={options} />;
}

export default memo(ConversationView);
