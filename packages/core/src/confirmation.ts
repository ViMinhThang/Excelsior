export type DiffAction = "create" | "overwrite" | "edit";

export type ConfirmRequest = {
  callId: string;
  toolName: string;
  args: string;
  diff?: string;
  filePath?: string;
  action?: DiffAction;
};

export type ConfirmResponse = {
  callId: string;
  approved: boolean;
};
