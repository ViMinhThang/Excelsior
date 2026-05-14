import { createChannelBus } from "./bus.js";
import type { ConfirmEvents } from "../../types.js";

export const confirmBus = createChannelBus<ConfirmEvents>();
