import type { Session } from "@excelsior/core";
import { MESSAGE_END, type AnyHarnessEvent } from "../events.js";

export function deriveSession(
  session: Session,
  events: readonly AnyHarnessEvent[],
  updatedAtFallback: string = session.updatedAt,
): Session {
  let userInput = session.metadata.userInput;
  if (!userInput) {
    const firstUserMessage = events.find(
      (event): event is Extract<AnyHarnessEvent, { type: typeof MESSAGE_END }> =>
        event.type === MESSAGE_END && event.data.message.role === "user",
    );
    userInput = firstUserMessage?.data.message.content ?? "";
  }
  return {
    ...session,
    updatedAt: events.at(-1)?.timestamp ?? updatedAtFallback,
    metadata: {
      ...session.metadata,
      userInput,
    },
  };
}
