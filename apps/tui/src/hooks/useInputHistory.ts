import { useState, useRef } from "react";
import type { ProjectedBlock } from "@excelsior/core";
import { useEvent } from "./useEvent.js";

/**
 * useInputHistory manages the chat input state and the "command history" 
 * navigation (similar to how a terminal lets you press Up/Down to see old commands).
 * 
 * Example Flow:
 * 1. User types "Hello" (but hasn't sent it yet).
 * 2. User presses UP:
 *    - originalInput becomes "Hello"
 *    - historyIndex becomes 0
 *    - input becomes the MOST RECENT sent message.
 * 3. User presses DOWN:
 *    - historyIndex becomes -1
 *    - input restored to originalInput ("Hello").
 */
export function useInputHistory(displayBlocks: ProjectedBlock[]) {
  // The current text in the input field
  const [input, setInput] = useState("");

  // -1 means we are not in history (typing a new message).
  // 0, 1, 2... are indices into the userBlocks array.
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Stores what the user was typing BEFORE they started browsing history,
  // so we can restore it if they navigate back down to the bottom.
  const [originalInput, setOriginalInput] = useState("");

  const inputRef = useRef(input);
  inputRef.current = input;

  // We filter for user messages only and REVERSE them so that:
  // [0] is the newest message, [length-1] is the oldest.
  const userBlocks = displayBlocks
    .filter((b): b is ProjectedBlock & { type: "user"; content: string } => b.type === "user")
    .reverse();

  /**
   * Navigates back in time (Up Arrow).
   * Stable identity, always sees fresh state via useEvent.
   */
  const navigateUp = useEvent(() => {
    if (historyIndex + 1 < userBlocks.length) {
      const newIndex = historyIndex + 1;
      // If this is the first "Up" press, save what the user was currently typing
      if (historyIndex === -1) setOriginalInput(input);
      
      setHistoryIndex(newIndex);
      setInput(userBlocks[newIndex].content);
    }
  });

  /**
   * Navigates forward in time (Down Arrow).
   * Stable identity, always sees fresh state via useEvent.
   */
  const navigateDown = useEvent(() => {
    if (historyIndex >= 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      // If we've reached the bottom (-1), restore the user's original text
      setInput(newIndex === -1 ? originalInput : userBlocks[newIndex].content);
    }
  });

  /**
   * Clears the input and resets history tracking (called after sending a message).
   */
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
