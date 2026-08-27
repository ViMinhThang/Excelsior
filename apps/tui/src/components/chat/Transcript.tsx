import { useEffect, useMemo, useCallback } from "react";
import type { LiveRunState } from "../../store/types.js";
import { useSlice, useStore } from "../../store/store.js";
import { selectMeta, selectOverlay, selectStatus, selectTranscript, selectView } from "../../store/selectors.js";
import { armFollowLatest } from "../../actions/viewport.js";
import { computeWindow, isAtBottom, type WindowItem } from "../../transcript/window.js";
import { flattenTranscript, type VisualUnit } from "../../transcript/flatten.js";
import { UserMessage } from "./UserMessage.js";
import { ToolHeader, ToolBody, formatToolCommandAndArgs } from "./ToolMessage.js";
import { SystemMessage } from "./SystemMessage.js";
import { MarkdownBlockView } from "../markdown/MarkdownRenderer.js";
import { WelcomeBanner } from "../WelcomeBanner.js";
import { useThemeTokens } from "../useThemeTokens.js";
import { useTerminalDimensions } from "@opentui/react";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { MouseButton, type MouseEvent as OpenTuiMouseEvent } from "@opentui/core";

export function getScrollDelta(event: OpenTuiMouseEvent): number {
  if (event.scroll) {
    const delta = event.scroll.delta || 1;
    if (event.scroll.direction === "up") return -delta;
    if (event.scroll.direction === "down") return delta;
  }
  if (event.button === MouseButton.WHEEL_UP || event.button === 4) return -1;
  if (event.button === MouseButton.WHEEL_DOWN || event.button === 5) return 1;
  return 0;
}

export function Transcript() {
  const store = useStore();
  const transcript = useSlice(selectTranscript);
  const view = useSlice(selectView);
  const meta = useSlice(selectMeta);
  const status = useSlice(selectStatus);
  const overlay = useSlice(selectOverlay);
  const tokens = useThemeTokens();
  const { height, width } = useTerminalDimensions();
  const overlayHeight = overlay.kind !== "none" ? 10 : 0;
  const chromeHeight = 6 + overlayHeight;
  const viewportHeight = Math.max(3, height - chromeHeight);
  const contentWidth = Math.max(20, width - 2);

  const { units, heights } = useMemo(
    () => flattenTranscript(transcript.blocks, transcript.live, view.toolsExpanded, contentWidth),
    [transcript.blocks, transcript.live, view.toolsExpanded, contentWidth],
  );

  const items: WindowItem[] = useMemo(
    () => units.map((u, i) => ({ id: u.id, live: u.kind.startsWith("live"), height: heights[i] ?? 1 })),
    [units, heights],
  );

  const window = useMemo(
    () =>
      computeWindow({
        items,
        scrollTop: view.scrollTop,
        viewportHeight,
        followLatest: view.followLatest,
      }),
    [items, view.scrollTop, viewportHeight, view.followLatest],
  );

  const atBottom = !view.followLatest && isAtBottom(window);
  useEffect(() => {
    if (atBottom) armFollowLatest(store);
  }, [atBottom, store]);

  const handleMouseScroll = useCallback((event: OpenTuiMouseEvent) => {
    const delta = getScrollDelta(event);
    if (delta === 0 || window.maxScroll <= 0) return;
    const linesDelta = delta * 3;
    const currentScroll = view.followLatest ? window.maxScroll : Math.min(view.scrollTop, window.maxScroll);
    const newScroll = Math.max(0, Math.min(window.maxScroll, currentScroll + linesDelta));
    const followLatest = newScroll >= window.maxScroll;
    store.dispatch((s) => ({
      view: { ...s.view, scrollTop: newScroll, followLatest },
    }));
  }, [store, view.followLatest, view.scrollTop, window.maxScroll]);

  const handleScrollTo = useCallback((targetScroll: number) => {
    if (window.maxScroll <= 0) return;
    const clamped = Math.max(0, Math.min(window.maxScroll, targetScroll));
    const followLatest = clamped >= window.maxScroll;
    store.dispatch((s) => ({
      view: { ...s.view, scrollTop: clamped, followLatest },
    }));
  }, [store, window.maxScroll]);

  if (transcript.blocks.length === 0 && !transcript.live) {
    return (
      <box flexGrow={1} flexShrink={0} flexDirection="column" minHeight={0} width="100%" overflow="hidden">
        <WelcomeBanner tokens={tokens} meta={meta} status={status} width={contentWidth} />
      </box>
    );
  }

  const visibleUnits = units.slice(window.startIndex, window.endIndex + 1);

  return (
    <box
      flexDirection="row"
      width="100%"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      overflow="hidden"
      onMouseScroll={handleMouseScroll}
    >
      <box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        overflow="hidden"
        onMouseScroll={handleMouseScroll}
      >
        {visibleUnits.map((unit) => (
          <RenderUnit key={unit.id} unit={unit} tokens={tokens} width={contentWidth} terminalColumns={width} />
        ))}
      </box>
      <TranscriptScrollbar
        totalHeight={window.totalHeight}
        viewportHeight={viewportHeight}
        scrollTop={view.scrollTop}
        maxScroll={window.maxScroll}
        followLatest={view.followLatest}
        tokens={tokens}
        onScrollTo={handleScrollTo}
        onMouseScroll={handleMouseScroll}
      />
    </box>
  );
}

export function TranscriptScrollbar({
  totalHeight,
  viewportHeight,
  scrollTop,
  maxScroll,
  followLatest,
  tokens,
  onScrollTo,
  onMouseScroll,
}: {
  totalHeight: number;
  viewportHeight: number;
  scrollTop: number;
  maxScroll: number;
  followLatest: boolean;
  tokens: ReturnType<typeof useThemeTokens>;
  onScrollTo?: (targetScroll: number) => void;
  onMouseScroll?: (event: OpenTuiMouseEvent) => void;
}) {
  if (totalHeight <= viewportHeight) return null;

  const currentScroll = followLatest ? maxScroll : Math.min(scrollTop, maxScroll);
  const trackHeight = Math.max(1, viewportHeight);
  const thumbHeight = Math.max(1, Math.min(trackHeight, Math.round((viewportHeight / totalHeight) * trackHeight)));
  const availableTravel = trackHeight - thumbHeight;
  const thumbTop = maxScroll > 0 ? Math.round((currentScroll / maxScroll) * availableTravel) : 0;

  const handleRowClick = (rowIndex: number) => {
    if (!onScrollTo) return;
    if (availableTravel <= 0 || maxScroll <= 0) {
      onScrollTo(0);
      return;
    }
    const idealThumbTop = rowIndex - Math.floor(thumbHeight / 2);
    const clampedThumbTop = Math.max(0, Math.min(availableTravel, idealThumbTop));
    const targetScroll = Math.round((clampedThumbTop / availableTravel) * maxScroll);
    onScrollTo(targetScroll);
  };

  const rows: Array<{ isThumb: boolean }> = [];
  for (let i = 0; i < trackHeight; i++) {
    const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
    rows.push({ isThumb });
  }

  return (
    <box
      flexDirection="column"
      width={1}
      flexShrink={0}
      onMouseScroll={onMouseScroll}
    >
      {rows.map((row, idx) => (
        <box
          key={idx}
          width={1}
          height={1}
          onMouseDown={() => handleRowClick(idx)}
          onMouseDrag={() => handleRowClick(idx)}
        >
          <text
            fg={row.isThumb ? tokens.highlightBrand : tokens.border}
            attributes={textAttrs({ bold: row.isThumb, dim: !row.isThumb })}
          >
            {row.isThumb ? "█" : "│"}
          </text>
        </box>
      ))}
    </box>
  );
}

function RenderUnit({
  unit,
  tokens,
  width,
  terminalColumns,
}: {
  unit: VisualUnit;
  tokens: ReturnType<typeof useThemeTokens>;
  width: number;
  terminalColumns: number;
}) {
  switch (unit.kind) {
    case "user":
      return <UserMessage block={unit.block} tokens={tokens} width={width} />;
    case "md":
      return (
        <box flexDirection="column" width={width} paddingX={1} paddingY={0}>
          <MarkdownBlockView block={unit.mdBlock} tokens={tokens} width={width} isLive={unit.isLive} />
        </box>
      );
    case "tool-header":
      return <ToolHeader tool={unit.tool} expanded={unit.expanded} tokens={tokens} width={width} />;
    case "tool-body":
      return <ToolBody tool={unit.tool} tokens={tokens} width={width} terminalColumns={terminalColumns} />;
    case "live-thinking":
      return (
        <box flexDirection="column" width={width} paddingX={1} paddingY={0}>
          <text fg={tokens.activity} attributes={textAttrs({ bold: true })}>
            <span fg={tokens.highlight}>{"⠋ "}</span>
            {"Thinking…"}
          </text>
        </box>
      );
    case "live-tool":
      return (
        <box flexDirection="row" gap={1} width={width} paddingX={1} paddingY={0}>
          <text fg={unit.status === "done" ? tokens.secondary : tokens.highlight} attributes={textAttrs({ bold: true })}>
            {"●"}
          </text>
          <text fg={tokens.toolCommand} attributes={textAttrs({ bold: true })} truncate>
            {formatToolCommandAndArgs(unit.toolName, unit.args)}
          </text>
          <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
            {unit.expanded ? "[-]" : "[ctrl+o]"}
          </text>
        </box>
      );
    case "system":
      return <SystemMessage content={unit.text} tokens={tokens} width={width} />;
    default:
      return null;
  }
}

export function liveRunStatusLabel(live: LiveRunState | null): string | null {
  if (!live) return null;
  switch (live.status) {
    case "running":
      return "running";
    case "committing":
      return "committing…";
    case "committed":
      return "committed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

