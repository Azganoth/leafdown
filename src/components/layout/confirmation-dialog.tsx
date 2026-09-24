import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  answerConfirmation,
  cancelPendingConfirmations,
  useConfirmationStore,
} from "@/lib/confirmation";

export function ConfirmationDialog() {
  const request = useConfirmationStore((state) => state.current);

  useEffect(() => cancelPendingConfirmations, []);

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && request) {
          answerConfirmation(request.id, false);
        }
      }}
    >
      {request && (
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{request.title}</DialogTitle>
            <DialogDescription>{request.message}</DialogDescription>
          </DialogHeader>
          {request.detail && (
            <p
              className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all"
              title={request.detail}
            >
              {request.detail}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => answerConfirmation(request.id, false)}>
              {request.cancelLabel}
            </Button>
            <Button onClick={() => answerConfirmation(request.id, true)}>
              {request.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
