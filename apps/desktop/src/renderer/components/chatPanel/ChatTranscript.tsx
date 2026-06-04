import type { ProjectedBlock } from "@excelsior/core";
import type { RefObject } from "react";
import { EmptyChat } from "./EmptyChat.js";
import {
  MessageBlock,
  ThinkingRow,
} from "./transcriptBubbles.js";
export { ScrollToBottomButton } from "./ScrollToBottomButton.js";

type ChatTranscriptProps = {
  blocks: ProjectedBlock[];
  isLoading: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  openToolCalls: Record<string, boolean>;
  workspaceName: string;
  onPickPrompt: (prompt: string) => void;
  onToggleToolCall: (id: string) => void;
};

export function ChatTranscript({
  blocks,
  isLoading,
  messagesEndRef,
  openToolCalls,
  workspaceName,
  onPickPrompt,
  onToggleToolCall,
}: ChatTranscriptProps) {
  // Find the boundary of the last user prompt
  let lastUserIndex = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === "user") {
      lastUserIndex = i;
      break;
    }
  }

  const staticBlocks = lastUserIndex >= 0 ? blocks.slice(0, lastUserIndex) : [];
  const dynamicBlocks = lastUserIndex >= 0 ? blocks.slice(lastUserIndex) : blocks;

  if (blocks.length > 0) {
    return (
      <div className="chat-content-rail flex flex-col gap-3">
        {staticBlocks.map((block) => (
          <MessageBlock
            key={block.id}
            block={block}
            isToolOpen={openToolCalls[block.id] === true}
            onToggleToolCall={onToggleToolCall}
          />
        ))}
        {dynamicBlocks.map((block) => (
          <MessageBlock
            key={block.id}
            block={block}
            isToolOpen={openToolCalls[block.id] === true}
            onToggleToolCall={onToggleToolCall}
          />
        ))}
        {isLoading && <ThinkingRow />}
        <div ref={messagesEndRef} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="chat-content-rail flex flex-col gap-3">
        <ThinkingRow />
        <div ref={messagesEndRef} />
      </div>
    );
  }

  return (
    <div className="chat-content-rail flex flex-col justify-center min-h-[calc(100%-20px)] py-6">
      <EmptyChat workspaceName={workspaceName} onPickPrompt={onPickPrompt} />
    </div>
  );
}
