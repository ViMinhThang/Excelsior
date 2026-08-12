import type { AppSettings } from "@excelsior/protocol";
import type { Store } from "../store/store.js";
import type { SettingsDraft } from "../store/types.js";
import { getBridge } from "./bridge.js";
import { back } from "./navigation.js";
import { register } from "./registry.js";
import { handleAck } from "./submit.js";

export type SettingsField = "deepseekApiKey" | "githubToken" | "agentToolLoopSteps" | "autoApproveWorkspaceEdits";

export function createSettingsDraft(settings: AppSettings): SettingsDraft {
  return {
    active: 0,
    fields: ["deepseekApiKey", "githubToken", "agentToolLoopSteps", "autoApproveWorkspaceEdits"],
    values: { ...settings },
  };
}

export function navigate(store: Store, delta: number): void {
  store.dispatch((s) => {
    const draft = s.settingsDraft;
    if (!draft) return { ui: s.ui };
    const next = (draft.active + delta + draft.fields.length) % draft.fields.length;
    return { settingsDraft: { ...draft, active: next } };
  });
}

export function toggleActive(store: Store): void {
  store.dispatch((s) => {
    const draft = s.settingsDraft;
    if (!draft) return { ui: s.ui };
    const field = draft.fields[draft.active];
    if (field === "autoApproveWorkspaceEdits") {
      return {
        settingsDraft: {
          ...draft,
          values: { ...draft.values, autoApproveWorkspaceEdits: !draft.values.autoApproveWorkspaceEdits },
        },
      };
    }
    return { ui: s.ui };
  });
}

export function insertText(store: Store, text: string): void {
  store.dispatch((s) => {
    const draft = s.settingsDraft;
    if (!draft) return { ui: s.ui };
    const field = draft.fields[draft.active];
    if (field === "autoApproveWorkspaceEdits") return { ui: s.ui };
    const current = String(draft.values[field] ?? "");
    return {
      settingsDraft: { ...draft, values: { ...draft.values, [field]: current + text } },
    };
  });
}

export function nextField(store: Store): void {
  navigate(store, 1);
}

export function saveSettings(store: Store): void {
  const draft = store.getState().settingsDraft;
  const bridge = getBridge();
  if (!draft || !bridge) return;
  const patch: Partial<AppSettings> = { ...draft.values };
  void bridge.command({ cmd: "settings-save", patch }).then((ack) => {
    handleAck(store, ack);
    if (ack.ok) back(store);
  });
}

register("settings.navigate", (store, arg) => navigate(store, Number(arg ?? 1)));
register("settings.toggle", (store) => toggleActive(store));
register("settings.insert", (store, arg) => insertText(store, arg ?? ""));
register("settings.nextField", (store) => nextField(store));
register("settings.save", (store) => saveSettings(store));
register("settings.back", (store) => back(store));
