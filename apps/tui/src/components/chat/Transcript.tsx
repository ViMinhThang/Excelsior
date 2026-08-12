import { useCallback, useEffect, useMemo } from "react";
import type { TranscriptBlock } from "@excelsior/protocol";
import type { LiveRunState } from "../../store/types.js";
import { useSlice, useStore } from "../../store/store.js";
import { selectTranscript, selectView } from "../../store/selectors.js";
import { armFollowLatest } from "../../actions/viewport.js";
import { estimateBlockHeight, estimateLiveHeight } from "../../transcript/measure.js";
import { computeWindow, isAtBottom, type WindowItem } from "../../transcript/window.js";
import { UserMessage } from "./UserMessage.js";
import { AgentMessage } from "./AgentMessage.js";
import { ToolMessage } from "./ToolMessage.js";
import { SystemMessage } from "./SystemMessage.js";
import { LiveRunView } from "./LiveRunView.js";
import { useThemeTokens } from "../useThemeTokens.js";
import { useTerminalDimensions } from "@opentui/react";

const LIVE_ITEM_ID = "live:run";
// chrome rows around the transcript: header + input bar + footer bar (borders
// are drawn inside the boxes, so each contributes ~2 rows at most)
const TRANSCRIPT_CHROME = 6;

export function Transcript() {
  const store = useStore();
  const transcript = useSlice(selectTranscript);
  const view = useSlice(selectView);
  const tokens = useThemeTokens();
  const { height, width } = useTerminalDimensions();
  const viewportHeight = Math.max(4, height - TRANSCRIPT_CHROME);
  const contentWidth = Math.max(20, width - 2);

  const blockMap = useMemo(() => {
    const map = new Map<string, TranscriptBlock>();
    for (const block of transcript.blocks) map.set(block.id, block);
    return map;
  }, [transcript.blocks]);

  const live = transcript.live;

  const metrics = useCallback(
    (id: string, isLive: boolean) => {
      if (isLive) return live ? estimateLiveHeight(live, { width: contentWidth, toolsExpanded: view.toolsExpanded }) : 0;
      const block = blockMap.get(id);
      return block ? estimateBlockHeight(block, { width: contentWidth, toolsExpanded: view.toolsExpanded }) : 1;
    },
    [blockMap, live, contentWidth, view.toolsExpanded],
  );

  const items: WindowItem[] = useMemo(() => {
    const list: WindowItem[] = transcript.blocks.map((block) => ({
      id: block.id,
      live: false,
      height: metrics(block.id, false),
    }));
    if (live) list.push({ id: LIVE_ITEM_ID, live: true, height: metrics(LIVE_ITEM_ID, true) });
    return list;
  }, [transcript.blocks, live, metrics]);

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

  const visibleItems = items.slice(window.startIndex, window.endIndex + 1);

  return (
    <box flexGrow={1} flexShrink={0} flexDirection="column" minHeight={0} width="100%" overflow="hidden">
      <box height={window.padTop} />
      {visibleItems.map((item) =>
        item.live ? (
          <LiveRunView key={item.id} live={live} tokens={tokens} width={contentWidth} toolsExpanded={view.toolsExpanded} terminalColumns={width} />
        ) : (
          <BlockView key={item.id} block={blockMap.get(item.id)} tokens={tokens} width={contentWidth} toolsExpanded={view.toolsExpanded} terminalColumns={width} />
        ),
      )}
      <box height={window.padBottom} />
    </box>
  );
}

function BlockView({
  block,
  tokens,
  width,
  toolsExpanded,
  terminalColumns,
}: {
  block: TranscriptBlock | undefined;
  tokens: ReturnType<typeof useThemeTokens>;
  width: number;
  toolsExpanded: boolean;
  terminalColumns: number;
}) {
  if (!block) return null;
  switch (block.kind) {
    case "user":
      return <UserMessage block={block} tokens={tokens} width={width} />;
    case "assistant":
      return <AgentMessage content={block.content} tokens={tokens} width={width} />;
    case "tool-call":
      return <ToolMessage block={block} tokens={tokens} width={width} toolsExpanded={toolsExpanded} terminalColumns={terminalColumns} />;
    case "system":
      return <SystemMessage content={block.content} tokens={tokens} width={width} />;
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
