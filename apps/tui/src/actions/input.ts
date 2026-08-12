import type { Store } from "../store/store.js";
import type { InputState } from "../store/types.js";
import { register } from "./registry.js";

const MAX_HISTORY = 100;

export function patchInput(store: Store, patch: Partial<InputState>): void {
  store.dispatch((s) => ({
    ui: { ...s.ui, input: { ...s.ui.input, ...patch } },
  }));
}

export function setInput(store: Store, value: string): void {
  patchInput(store, { value, cursor: value.length });
}

export function insert(store: Store, text: string): void {
  if (!text) return;
  store.dispatch((s) => {
    const { value, cursor } = s.ui.input;
    const next = value.slice(0, cursor) + text + value.slice(cursor);
    return { ui: { ...s.ui, input: { ...s.ui.input, value: next, cursor: cursor + text.length } } };
  });
}

export function backspace(store: Store): void {
  store.dispatch((s) => {
    const { value, cursor } = s.ui.input;
    if (cursor === 0) return { ui: s.ui };
    const next = value.slice(0, cursor - 1) + value.slice(cursor);
    return { ui: { ...s.ui, input: { ...s.ui.input, value: next, cursor: cursor - 1 } } };
  });
}

export function moveCursorBy(store: Store, delta: number): void {
  store.dispatch((s) => {
    const { value, cursor } = s.ui.input;
    const next = Math.max(0, Math.min(value.length, cursor + delta));
    return { ui: { ...s.ui, input: { ...s.ui.input, cursor: next } } };
  });
}

export function moveCursorHome(store: Store): void {
  patchInput(store, { cursor: 0 });
}

export function moveCursorEnd(store: Store): void {
  store.dispatch((s) => ({ ui: { ...s.ui, input: { ...s.ui.input, cursor: s.ui.input.value.length } } }));
}

export function clearLine(store: Store): void {
  patchInput(store, { value: "", cursor: 0 });
}

export function killLine(store: Store): void {
  store.dispatch((s) => {
    const { value, cursor } = s.ui.input;
    return { ui: { ...s.ui, input: { ...s.ui.input, value: value.slice(0, cursor) } } };
  });
}

export function deleteWord(store: Store): void {
  store.dispatch((s) => {
    const { value, cursor } = s.ui.input;
    if (cursor === 0) return { ui: s.ui };
    let start = cursor - 1;
    while (start > 0 && value[start - 1] === " ") start -= 1;
    while (start > 0 && value[start - 1] !== " ") start -= 1;
    const next = value.slice(0, start) + value.slice(cursor);
    return { ui: { ...s.ui, input: { ...s.ui.input, value: next, cursor: start } } };
  });
}

export function historyUp(store: Store): void {
  store.dispatch((s) => {
    const { history, historyIndex } = s.ui.input;
    if (history.length === 0) return { ui: s.ui };
    const nextIndex = Math.min(history.length - 1, historyIndex + 1);
    return {
      ui: {
        ...s.ui,
        input: {
          ...s.ui.input,
          historyIndex: nextIndex,
          value: history[history.length - 1 - nextIndex],
          cursor: history[history.length - 1 - nextIndex].length,
        },
      },
    };
  });
}

export function historyDown(store: Store): void {
  store.dispatch((s) => {
    const { history, historyIndex } = s.ui.input;
    if (historyIndex < 0) return { ui: s.ui };
    const nextIndex = historyIndex - 1;
    if (nextIndex < 0) {
      return {
        ui: { ...s.ui, input: { ...s.ui.input, historyIndex: -1, value: "", cursor: 0 } },
      };
    }
    return {
      ui: {
        ...s.ui,
        input: {
          ...s.ui.input,
          historyIndex: nextIndex,
          value: history[history.length - 1 - nextIndex],
          cursor: history[history.length - 1 - nextIndex].length,
        },
      },
    };
  });
}

export function pushHistory(store: Store, value: string): void {
  if (!value.trim()) return;
  store.dispatch((s) => {
    const history = s.ui.input.history;
    const next = history[0] === value ? history : [value, ...history].slice(0, MAX_HISTORY);
    return { ui: { ...s.ui, input: { ...s.ui.input, history: next } } };
  });
}

register("input.insert", (store, arg) => insert(store, arg ?? ""));
register("input.backspace", (store) => backspace(store));
register("input.moveLeft", (store) => moveCursorBy(store, -1));
register("input.moveRight", (store) => moveCursorBy(store, 1));
register("input.moveHome", (store) => moveCursorHome(store));
register("input.moveEnd", (store) => moveCursorEnd(store));
register("input.clearLine", (store) => clearLine(store));
register("input.killLine", (store) => killLine(store));
register("input.deleteWord", (store) => deleteWord(store));
register("input.historyUp", (store) => historyUp(store));
register("input.historyDown", (store) => historyDown(store));
