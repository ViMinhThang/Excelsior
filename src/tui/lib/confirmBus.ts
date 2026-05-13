import { createChannelBus } from "../../lib/runtime/bus.js";
import type { ConfirmEvents } from "../../types.js";

export const confirmBus = createChannelBus<ConfirmEvents>("confirm");
