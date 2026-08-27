import type { Store } from "../store/store.js";
import { getBridge } from "./bridge.js";
import { closeOverlay } from "./overlay.js";
import { register } from "./registry.js";
import { handleAck } from "./submit.js";

export function approve(store: Store): void {
  const overlay = store.getState().overlay;
  if (overlay.kind !== "pending-confirm") return;
  const bridge = getBridge();
  if (!bridge) return;
  closeOverlay(store);
  void bridge
    .command({ cmd: "confirm-respond", callId: overlay.state.callId, approved: true })
    .then((ack) => handleAck(store, ack));
}

export function deny(store: Store): void {
  const overlay = store.getState().overlay;
  if (overlay.kind !== "pending-confirm") return;
  const bridge = getBridge();
  if (!bridge) return;
  closeOverlay(store);
  void bridge
    .command({ cmd: "confirm-respond", callId: overlay.state.callId, approved: false })
    .then((ack) => handleAck(store, ack));
}

export function approveAll(store: Store): void {
  const overlay = store.getState().overlay;
  if (overlay.kind !== "pending-confirm") return;
  const bridge = getBridge();
  if (!bridge) return;
  closeOverlay(store);
  void bridge.command({ cmd: "confirm-approve-all" }).then((ack) => handleAck(store, ack));
}

register("confirm.approve", (store) => approve(store));
register("confirm.deny", (store) => deny(store));
register("confirm.approveAll", (store) => approveAll(store));
