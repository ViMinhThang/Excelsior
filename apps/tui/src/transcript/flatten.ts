import type { TranscriptBlock, ToolCallBlock } from "@excelsior/protocol";
import type { LiveRunState } from "../store/types.js";
import { parseMarkdown, type MarkdownBlock } from "../components/markdown/MarkdownRenderer.js";

export type VisualUnit =
  | { kind: "user"; id: string; block: TranscriptBlock; text: string }
  | { kind: "system"; id: string; block: TranscriptBlock; text: string }
  | { kind: "md"; id: string; blockId: string; mdBlock: MarkdownBlock; isLive?: boolean }
  | { kind: "tool-header"; id: string; tool: ToolCallBlock; expanded: boolean }
  | { kind: "tool-body"; id: string; tool: ToolCallBlock }
  | { kind: "live-thinking"; id: string }
  | { kind: "live-tool"; id: string; toolName: string; args: unknown; status: string; expanded: boolean };

export function estimateUnitHeight(unit: VisualUnit, contentWidth: number): number {
  switch (unit.kind) {
    case "user": {
      const lines = unit.text.split("\n");
      let h = 0;
      for (const line of lines) {
        h += Math.max(1, Math.ceil((line.length + 2) / contentWidth));
      }
      return h;
    }
    case "system":
      return Math.max(1, Math.ceil(unit.text.length / contentWidth));
    case "tool-header":
    case "live-tool":
    case "live-thinking":
      return 1;
    case "tool-body": {
      const lines = (unit.tool.result ?? "").split("\n");
      return Math.min(20, Math.max(1, lines.length));
    }
    case "md": {
      const b = unit.mdBlock;
      switch (b.kind) {
        case "heading":
          return 1;
        case "empty":
          return 0;
        case "hr":
          return 1;
        case "code":
          return b.lines.length + 2;
        case "list":
          return b.lines.length;
        case "quote":
          return b.lines.length;
        case "paragraph": {
          const text = b.lines[0] ?? "";
          return Math.max(1, Math.ceil(text.length / contentWidth));
        }
        default:
          return 1;
      }
    }
  }
}

export function flattenTranscript(
  blocks: readonly TranscriptBlock[],
  live: LiveRunState | null,
  toolsExpanded: boolean,
  contentWidth: number,
): { units: VisualUnit[]; heights: number[] } {
  const units: VisualUnit[] = [];
  const heights: number[] = [];

  function addUnit(unit: VisualUnit) {
    units.push(unit);
    heights.push(Math.max(1, estimateUnitHeight(unit, contentWidth)));
  }

  for (const block of blocks) {
    if (block.kind === "user") {
      addUnit({ kind: "user", id: `u_${block.id}`, block, text: block.content });
    } else if (block.kind === "assistant") {
      const mdBlocks = parseMarkdown(block.content);
      for (let i = 0; i < mdBlocks.length; i++) {
        const md = mdBlocks[i];
        if (md.kind === "empty") continue;
        addUnit({ kind: "md", id: `a_${block.id}_${i}`, blockId: block.id, mdBlock: md });
      }
    } else if (block.kind === "tool-call" && block.tool) {
      addUnit({ kind: "tool-header", id: `th_${block.id}`, tool: block.tool, expanded: toolsExpanded });
      if (toolsExpanded) {
        addUnit({ kind: "tool-body", id: `tb_${block.id}`, tool: block.tool });
      }
    } else if (block.kind === "system") {
      addUnit({ kind: "system", id: `s_${block.id}`, block, text: block.content });
    }
  }

  if (live) {
    const thinking = live.items.length === 0 && (live.status === "running" || live.status === "committing");
    if (thinking) {
      addUnit({ kind: "live-thinking", id: "live_thinking" });
    } else {
      for (let idx = 0; idx < live.items.length; idx++) {
        const item = live.items[idx];
        if (item.kind === "assistant") {
          const mdBlocks = parseMarkdown(item.content);
          for (let i = 0; i < mdBlocks.length; i++) {
            const md = mdBlocks[i];
            if (md.kind === "empty") continue;
            const isLast = i === mdBlocks.length - 1 && idx === live.items.length - 1;
            addUnit({
              kind: "md",
              id: `live_a_${idx}_${i}`,
              blockId: "live",
              mdBlock: md,
              isLive: isLast,
            });
          }
        } else {
          addUnit({
            kind: "live-tool",
            id: `live_tool_${item.tool.id}`,
            toolName: item.tool.toolName,
            args: item.tool.args,
            status: item.tool.status,
            expanded: toolsExpanded,
          });
        }
      }
    }
  }

  return { units, heights };
}
