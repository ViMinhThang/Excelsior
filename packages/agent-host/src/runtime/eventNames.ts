// Event name constants: always reference these instead of raw strings.
// This prevents drift between emitter and consumer code.

export const RUN_START = "run-start";
export const RUN_END = "run-end";
export const CHILD_RUN_ATTACHED = "child-run-attached";
export const USER_INPUT = "user-input";
export const TEXT_DELTA = "text-delta";
export const TOOL_CALL_START = "tool-call-start";
export const TOOL_CALL_END = "tool-call-end";
export const ERROR = "error";
export const PERSISTENCE_ERROR = "persistence-error";
export const TURN_COMPLETE = "turn-complete";
