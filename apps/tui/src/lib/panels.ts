import type { ComponentType } from "react";
import { SESSION_PICKER_PANEL_ID } from "@excelsior/core";
import SessionPickerPanel, {
  type SessionPickerPanelContext,
} from "../components/sessions/SessionPickerPanel.js";

export type TuiPanelContext = SessionPickerPanelContext;

export interface TuiPanelDefinition {
  id: string;
  component: ComponentType<{ context: TuiPanelContext }>;
}

const panels = new Map<string, TuiPanelDefinition>([
  [
    SESSION_PICKER_PANEL_ID,
    {
      id: SESSION_PICKER_PANEL_ID,
      component: SessionPickerPanel,
    },
  ],
]);

export function getPanel(panelId: string): TuiPanelDefinition | undefined {
  return panels.get(panelId);
}
