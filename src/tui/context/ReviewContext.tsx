import React, { ReactNode } from "react";
import { PullRequest, SubAgentState, ReviewScreenMode } from "../../types.js";
import { PRProvider, usePRContext } from "./PRContext.js";
import { ReviewSessionProvider, useReviewSessionContext } from "./ReviewSessionContext.js";
import { SubAgentProvider, useSubAgentContext } from "./SubAgentContext.js";

export type ReviewBlock = {
  type: "text"; text: string;
} | {
  type: "subagent"; toolCallId: string;
} | {
  type: "tool-call"; toolCallId: string; toolName: string; toolArgs: string; status: "pending" | "completed" | "error";
};

export function ReviewProvider({ children }: { children: ReactNode }) {
  return (
    <PRProvider>
      <ReviewSessionProvider>
        <SubAgentProvider>
          {children}
        </SubAgentProvider>
      </ReviewSessionProvider>
    </PRProvider>
  );
}

export function useReviewContext() {
  const pr = usePRContext();
  const rs = useReviewSessionContext();
  const sa = useSubAgentContext();

  return { ...pr, ...rs, ...sa };
}

