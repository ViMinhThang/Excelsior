export type DiffAction = "create" | "overwrite" | "edit" | "warning";

export type ConfirmRequest = {
  callId: string;
  toolName: string;
  args: string;
  diff?: string;
  filePath?: string;
  action?: DiffAction;
  warning?: string;
};

export type ConfirmResponse = {
  callId: string;
  approved: boolean;
};
