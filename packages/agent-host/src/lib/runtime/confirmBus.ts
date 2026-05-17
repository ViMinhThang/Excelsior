import { createChannelBus } from "@excelsior/run-runtime";
import type { ConfirmEvents } from "./confirmTypes.js";

export const confirmBus = createChannelBus<ConfirmEvents>();
