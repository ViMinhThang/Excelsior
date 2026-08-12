import type { MetaSlice, CatalogSlice, SessionSlice, RunSlice } from "@excelsior/client";
import type { InteractionState } from "@excelsior/protocol";
import type { Store } from "../store/store.js";
import { EMPTY_INTERACTION } from "../store/types.js";
import { nextFocus } from "../routing/focus.js";

export function foldMeta(store: Store, slice: MetaSlice): void {
  store.dispatch((s) => ({
    meta: {
      sessions: slice.sessions,
      currentSessionId: slice.currentSessionId,
      workspace: slice.workspace,
      llm: slice.llm,
    },
    status: { ...s.status, mode: slice.mode, llm: slice.llm },
  }));
}

export function foldCatalog(store: Store, slice: CatalogSlice): void {
  store.dispatch((_s) => ({
    catalog: { commands: slice.commands, settings: slice.settings },
  }));
}

export function foldSession(store: Store, slice: SessionSlice | null): void {
  store.dispatch((s) => ({
    transcript: {
      ...s.transcript,
      blocks: slice ? slice.blocks : [],
      interaction: slice ? slice.interaction : EMPTY_INTERACTION,
    },
  }));
  const interaction = slice?.interaction;
  if (interaction) foldInteraction(store, interaction);
}

function foldInteraction(store: Store, interaction: InteractionState): void {
  const confirmation = interaction.confirmation;
  const question = interaction.question;
  if (confirmation) {
    store.dispatch((s) => ({
      overlay: {
        kind: "pending-confirm",
        state: {
          callId: confirmation.callId,
          toolName: confirmation.request.toolName,
          args: confirmation.request.args,
          diff: confirmation.request.diff,
          filePath: confirmation.request.filePath,
          action: confirmation.request.action,
          warning: confirmation.request.warning,
        },
      },
      ui: { ...s.ui, focus: nextFocus(s.ui.focus, "confirm-arrived") },
    }));
    return;
  }
  if (question) {
    store.dispatch((s) => ({
      overlay: {
        kind: "pending-question",
        state: {
          callId: question.callId,
          question: question.request.question,
          options: question.request.options.map((o) => ({
            id: o.id,
            label: o.label,
            description: o.description,
          })),
          allowManual: question.request.allowManual,
          selected: null,
          manual: "",
        },
      },
      ui: { ...s.ui, focus: nextFocus(s.ui.focus, "question-arrived") },
    }));
    return;
  }
  store.dispatch((s) => {
    if (s.overlay.kind !== "pending-confirm" && s.overlay.kind !== "pending-question") {
      return { ui: s.ui };
    }
    return {
      overlay: { kind: "none" },
      ui: { ...s.ui, focus: nextFocus(s.ui.focus, "overlay-dismissed") },
    };
  });
}

export function foldRun(store: Store, slice: RunSlice | null): void {
  store.dispatch((s) => ({
    transcript: {
      ...s.transcript,
      live: slice
        ? { status: slice.status, turnId: slice.turnId, text: slice.text, tools: slice.tools }
        : null,
    },
    status: { ...s.status, busy: slice ? slice.status === "running" : false },
  }));
}
