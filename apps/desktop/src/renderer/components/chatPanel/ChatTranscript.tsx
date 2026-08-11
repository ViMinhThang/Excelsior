import type { ProjectedTurn, AgentMode } from "@excelsior/core";
import type { RefObject } from "react";
import { EmptyChat } from "./EmptyChat.js";
import {
  MessageBlock,
  ThinkingRow,
} from "./transcriptBubbles.js";
export { ScrollToBottomButton } from "./ScrollToBottomButton.js";

type ChatTranscriptProps = {
  turns: ProjectedTurn[];
  isLoading: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  openToolCalls: Record<string, boolean>;
  workspaceName: string;
  onToggleToolCall: (id: string) => void;
  inputValue: string;
  mode: AgentMode;
  onCancel: () => void;
  onInputChange: (value: string) => void;
  onModeChange: (mode: AgentMode) => void;
  onSend: () => void;
};

export function ChatTranscript({
  turns,
  isLoading,
  messagesEndRef,
  openToolCalls,
  workspaceName,
  onToggleToolCall,
  inputValue,
  mode,
  onCancel,
  onInputChange,
  onModeChange,
  onSend,
}: ChatTranscriptProps) {
  const lastTurnIndex = turns.length - 1;
  const staticTurns = lastTurnIndex >= 0 ? turns.slice(0, lastTurnIndex) : [];
  const dynamicTurns = lastTurnIndex >= 0 ? turns.slice(lastTurnIndex) : turns;

  const totalBlocksCount = turns.reduce((sum, turn) => sum + turn.blocks.length, 0);

  if (totalBlocksCount > 0) {
    return (
      <div className="chat-content-rail flex flex-col gap-3">
        {staticTurns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-3">
            {turn.blocks.map((block) => (
              <MessageBlock
                key={block.id}
                block={block}
                isToolOpen={openToolCalls[block.id] === true}
                onToggleToolCall={onToggleToolCall}
              />
            ))}
            {turn.status === "failed" && turn.error && (
              <div className="pl-4 text-xs font-semibold text-red-500">
                Turn failed: {turn.error.message}
              </div>
            )}
          </div>
        ))}
        {dynamicTurns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-3">
            {turn.blocks.map((block) => (
              <MessageBlock
                key={block.id}
                block={block}
                isToolOpen={openToolCalls[block.id] === true}
                onToggleToolCall={onToggleToolCall}
              />
            ))}
            {turn.status === "failed" && turn.error && (
              <div className="pl-4 text-xs font-semibold text-red-500">
                Turn failed: {turn.error.message}
              </div>
            )}
          </div>
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
      <EmptyChat
        workspaceName={workspaceName}
        inputValue={inputValue}
        isLoading={isLoading}
        mode={mode}
        onCancel={onCancel}
        onInputChange={onInputChange}
        onModeChange={onModeChange}
        onSend={onSend}
      />
    </div>
  );
}
