import { createBus } from "./bus.js";

export type ConfirmEvents = {
  "request": { callId: string; toolName: string; args: string };
  "response": { callId: string; approved: boolean };
};

export const confirmBus = createBus<ConfirmEvents>();
