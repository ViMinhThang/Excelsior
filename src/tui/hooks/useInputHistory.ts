import { useState, useCallback, useRef, useEffect } from "react";
import { ProjectedBlock } from "../../lib/projection/display.js";

export function useInputHistory(displayBlocks: ProjectedBlock[]) {
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState("");
  const inputRef = useRef(input);
  inputRef.current = input;

  const userBlocks = displayBlocks
    .filter((b): b is ProjectedBlock & { type: "user"; content: string } => b.type === "user")
    .reverse();

  const navigateUp = useCallback(() => {
    if (historyIndex + 1 < userBlocks.length) {
      const newIndex = historyIndex + 1;
      if (historyIndex === -1) setOriginalInput(input);
      setHistoryIndex(newIndex);
      setInput(userBlocks[newIndex].content);
    }
  }, [historyIndex, userBlocks, input]);

  const navigateDown = useCallback(() => {
    if (historyIndex >= 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setInput(newIndex === -1 ? originalInput : userBlocks[newIndex].content);
    }
  }, [historyIndex, userBlocks, originalInput]);

  const resetInput = useCallback(() => {
    setInput("");
    setHistoryIndex(-1);
    setOriginalInput("");
  }, []);

  return {
    input,
    setInput,
    inputRef,
    resetInput,
    navigateUp,
    navigateDown,
  };
}
