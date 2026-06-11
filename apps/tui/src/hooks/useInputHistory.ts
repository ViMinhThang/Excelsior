import { useState, useRef } from "react";
import type { ProjectedBlock, ProjectedTurn } from "@excelsior/core";
import { useEvent } from "./useEvent.js";

/**
 * useInputHistory manages the chat input state and the "command history" 
 * navigation (similar to how a terminal lets you press Up/Down to see old commands).
 */
export function useInputHistory(turns: ProjectedTurn[]) {
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState("");

  const inputRef = useRef(input);
  inputRef.current = input;

  const userBlocks = turns
    .flatMap((t) => t.blocks)
    .filter((b): b is ProjectedBlock & { type: "user"; content: string } => b.type === "user")
    .reverse();

  const navigateUp = useEvent(() => {
    if (historyIndex + 1 < userBlocks.length) {
      const newIndex = historyIndex + 1;
      if (historyIndex === -1) setOriginalInput(input);
      
      setHistoryIndex(newIndex);
      setInput(userBlocks[newIndex].content);
    }
  });

  const navigateDown = useEvent(() => {
    if (historyIndex >= 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setInput(newIndex === -1 ? originalInput : userBlocks[newIndex].content);
    }
  });

  const resetInput = useEvent(() => {
    setInput("");
    setHistoryIndex(-1);
    setOriginalInput("");
  });

  return {
    input,
    setInput,
    inputRef,
    resetInput,
    navigateUp,
    navigateDown,
  };
}
