import { TriangleAlert } from "lucide-react";
import type { Session } from "@excelsior/core";
import { sessionTitle } from "./sessionListModel.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../ui/dialog.js";
import { Button } from "../ui/button.js";

type DeleteSessionDialogProps = {
  session: Session;
  onCancel: () => void;
  onConfirm: (sessionId: string) => void;
};

export function DeleteSessionDialog({
  session,
  onCancel,
  onConfirm,
}: DeleteSessionDialogProps) {
  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[420px] max-w-[420px] p-0 gap-0 overflow-hidden border-brand-border bg-brand-surface text-brand-text-strong shadow-2xl"
      >
        <div className="flex gap-4 p-6 pb-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-500"
            aria-hidden="true"
          >
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-brand-text-strong">
              Delete chat?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-brand-text-light">
              <span className="font-semibold text-brand-text-strong">
                {sessionTitle(session)}
              </span>{" "}
              will be removed from this workspace.
            </DialogDescription>
          </div>
        </div>

        <DialogFooter className="m-0 bg-brand-bg/40 border-t border-brand-border px-5 py-3 flex gap-2 justify-end sm:flex-row">
          <Button
            variant="outline"
            onClick={onCancel}
            className="h-9 px-4 text-brand-text-muted hover:text-brand-text-strong border-brand-border hover:bg-brand-panel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(session.id)}
            className="h-9 px-4 bg-red-500 hover:bg-red-600 text-white border-0"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
