import React, { ReactNode } from "react";
import { PRProvider } from "./PRContext.js";
import { ReviewSessionProvider } from "./ReviewSessionContext.js";
import { SubAgentProvider } from "./SubAgentContext.js";

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

