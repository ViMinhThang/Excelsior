import { createChannelBus } from "./bus.js";
import type { ConfirmEvents } from "./confirmTypes.js";

export const confirmBus = createChannelBus<ConfirmEvents>();
