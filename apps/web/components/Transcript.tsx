"use client";

import React, { forwardRef } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import type { Block } from "../lib/useEngine";

type TranscriptProps = {
  blocks: Block[];
  streaming: boolean;
};

const Transcript = forwardRef<HTMLDivElement, TranscriptProps>(function Transcript({ blocks, streaming }, ref) {
  const visible = blocks.filter((b) => b.role !== "system");

  if (visible.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4">
        <div className="max-w-3xl mx-auto w-full">
          <div className="text-center text-[var(--text-dim)] text-xs py-12">New session started. Ask anything below to begin.</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-4 md:px-8 py-4 space-y-4">
      <div className="max-w-3xl mx-auto w-full">
        {visible.map((block, index) => (
          <MarkdownRenderer
            key={`${block.role}-${index}`}
            role={block.role}
            content={block.content}
            meta={block.meta}
            isStreaming={streaming && index === visible.length - 1}
          />
        ))}
      </div>
    </div>
  );
});

export default React.memo(Transcript);
