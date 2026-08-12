import type { TranscriptBlock } from "@excelsior/protocol";
import type { LiveRunState } from "../store/types.js";

export interface MeasureContext {
  width: number;
  toolsExpanded: boolean;
}

const WIDE_RANGE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += WIDE_RANGE.test(char) ? 2 : 1;
  }
  return width;
}

export function textRows(text: string, width: number): number {
  if (!text) return 1;
  let rows = 0;
  for (const line of text.split(/\r?\n/)) {
    const lineWidth = displayWidth(line);
    rows += lineWidth === 0 ? 1 : Math.max(1, Math.ceil(lineWidth / Math.max(1, width)));
  }
  return Math.max(1, rows);
}

const USER_CHROME = 2;
const ASSISTANT_CHROME = 1;
const SYSTEM_CHROME = 1;
const TOOL_HEADER = 3;
const TOOL_RESULT_LIMIT = 12;
const LIVE_TOOL_HEADER = 2;

export function estimateBlockHeight(block: TranscriptBlock, ctx: MeasureContext): number {
  const contentWidth = Math.max(20, ctx.width - 2);
  switch (block.kind) {
    case "user":
      return USER_CHROME + textRows(block.content, contentWidth);
    case "assistant":
      return ASSISTANT_CHROME + textRows(block.content, contentWidth);
    case "system":
      return SYSTEM_CHROME + textRows(block.content, contentWidth);
    case "tool-call": {
      const tool = block.tool;
      if (!tool) return TOOL_HEADER;
      if (!ctx.toolsExpanded) return TOOL_HEADER;
      return TOOL_HEADER + Math.min(TOOL_RESULT_LIMIT, textRows(tool.result, contentWidth));
    }
    default:
      return 1;
  }
}

export function estimateLiveHeight(live: LiveRunState, ctx: MeasureContext): number {
  const contentWidth = Math.max(20, ctx.width - 2);
  const text = live.text ? textRows(live.text, contentWidth) : 0;
  const tools = live.tools.length > 0
    ? live.tools.reduce((sum, _tool) => sum + LIVE_TOOL_HEADER + (ctx.toolsExpanded ? 1 : 0), 0)
    : 0;
  return Math.max(1, text + tools + 1);
}
