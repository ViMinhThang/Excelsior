import type { AskQuestionResponse } from "@excelsior/protocol";
import type { Store } from "../store/store.js";
import { getBridge } from "./bridge.js";
import { closeOverlay } from "./overlay.js";
import { register } from "./registry.js";
import { handleAck } from "./submit.js";

function withQuestion(store: Store, fn: (state: import("../store/types.js").QuestionOverlayState) => import("../store/types.js").QuestionOverlayState): void {
  store.dispatch((s) => {
    if (s.overlay.kind !== "pending-question") return { ui: s.ui };
    return { overlay: { kind: "pending-question", state: fn(s.overlay.state) } };
  });
}

export function selectAnswer(store: Store, index: number): void {
  withQuestion(store, (state) => ({ ...state, selected: index }));
}

export function selectPrev(store: Store): void {
  withQuestion(store, (state) => ({
    ...state,
    selected: state.selected === null ? state.options.length - 1 : (state.selected + state.options.length - 1) % state.options.length,
  }));
}

export function selectNext(store: Store): void {
  withQuestion(store, (state) => ({
    ...state,
    selected: state.selected === null ? 0 : (state.selected + 1) % state.options.length,
  }));
}

export function appendManual(store: Store, text: string): void {
  withQuestion(store, (state) => ({ ...state, manual: state.manual + text }));
}

export function manualBackspace(store: Store): void {
  withQuestion(store, (state) => ({ ...state, manual: state.manual.slice(0, -1) }));
}

export function submitAnswer(store: Store): void {
  const overlay = store.getState().overlay;
  if (overlay.kind !== "pending-question") return;
  const bridge = getBridge();
  if (!bridge) return;
  const state = overlay.state;
  const option = state.selected !== null ? state.options[state.selected] : null;
  const manual = state.manual.trim();
  const response: AskQuestionResponse =
    manual.length > 0 && state.allowManual
      ? { callId: state.callId, answer: manual, isManual: true }
      : option
        ? {
            callId: state.callId,
            answer: option.label,
            selectedOptionId: option.id,
            selectedOptionLabel: option.label,
            isManual: false,
          }
        : { callId: state.callId, answer: "", isManual: false, cancelled: true };
  closeOverlay(store);
  void bridge.command({ cmd: "question-respond", response }).then((ack) => handleAck(store, ack));
}

export function cancelQuestion(store: Store): void {
  const overlay = store.getState().overlay;
  if (overlay.kind !== "pending-question") return;
  const bridge = getBridge();
  if (!bridge) return;
  closeOverlay(store);
  void bridge
    .command({ cmd: "question-respond", response: { callId: overlay.state.callId, answer: "", isManual: false, cancelled: true } })
    .then((ack) => handleAck(store, ack));
}

register("question.select", (store, arg) => selectAnswer(store, Number(arg ?? 0)));
register("question.selectPrev", (store) => selectPrev(store));
register("question.selectNext", (store) => selectNext(store));
register("question.submit", (store) => submitAnswer(store));
register("question.cancel", (store) => cancelQuestion(store));
register("question.insert", (store, arg) => appendManual(store, arg ?? ""));
register("question.backspace", (store) => manualBackspace(store));
