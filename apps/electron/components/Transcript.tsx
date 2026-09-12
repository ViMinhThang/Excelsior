"use client";

import React, { forwardRef, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import PermissionInline from "./PermissionInline";
import type { PermissionReq } from "../lib/protocol";
import type { Block } from "../lib/engineState";

type TranscriptProps = {
  blocks: Block[];
  streaming: boolean;
  permission?: PermissionReq | null;
  onPermissionDecision?: (approved: boolean) => void;
  onAllowAll?: () => void;
};

const Transcript = forwardRef<HTMLDivElement, TranscriptProps>(function Transcript(
  { blocks, streaming, permission, onPermissionDecision, onAllowAll },
  ref
) {
  const visible = blocks.filter((b) => b.role !== "system");

  if (visible.length === 0) {
    return <div className="flex-1" />;
  }

  const innerRef = useRef<HTMLDivElement | null>(null);
  const [showJump, setShowJump] = useState(false);

  const setRef = (el: HTMLDivElement | null) => {
    innerRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  const handleScroll = () => {
    const el = innerRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  };

  const scrollToLatest = () => {
    const el = innerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={setRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 md:px-8 py-4 space-y-3">
        <div className="max-w-3xl mx-auto w-full">
          {visible.map((block, index) => (
            <MarkdownRenderer
              key={`${block.role}-${index}`}
              role={block.role}
              content={block.content}
              meta={block.meta}
              args={block.args}
              isStreaming={streaming && index === visible.length - 1}
            />
          ))}
          {permission && onPermissionDecision && (
            <PermissionInline permission={permission} onDecision={onPermissionDecision} onAllowAll={onAllowAll} />
          )}
        </div>
      </div>
      {showJump && (
        <button
          type="button"
          onClick={scrollToLatest}
          aria-label="Scroll to latest"
          className="absolute bottom-4 right-6 w-7 h-7 rounded-full bg-[var(--bg-card)] border-subtle shadow-sm flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer z-10 animate-appear"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});

export default React.memo(Transcript);
