import { Button } from "@/components/ui/Button";
import {
  closeActiveMarkdownDocument,
  createNewMarkdownDocument,
  saveActiveMarkdownDocument,
  saveActiveMarkdownDocumentAs,
} from "@/lib/documentWorkflows";
import { useSessionStore } from "@/stores/session";
import { FilePlusIcon, SaveAllIcon, SaveIcon, XIcon } from "lucide-react";
import { useEffect, useCallback } from "react";
import { toast } from "sonner";

const isPrimaryModifierEvent = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

export function FileWorkflowActions() {
  const activeDocument = useSessionStore((state) => state.activeDocument);
  const hasActiveDocument = Boolean(activeDocument);
  const saveDisabled =
    !activeDocument || (activeDocument.status === "saved" && !activeDocument.isDirty);

  const handleNew = useCallback(() => {
    void createNewMarkdownDocument();
  }, []);

  const handleCloseDocument = useCallback(() => {
    void closeActiveMarkdownDocument();
  }, []);

  const handleSave = useCallback(() => {
    void saveActiveMarkdownDocument()
      .then((saved) => {
        if (saved) {
          toast.success("Document saved.");
        }
      })
      .catch(() => {
        toast.error("Could not save Markdown document.");
      });
  }, []);

  const handleSaveAs = useCallback(() => {
    void saveActiveMarkdownDocumentAs()
      .then((saved) => {
        if (saved) {
          toast.success("Document saved.");
        }
      })
      .catch(() => {
        toast.error("Could not save Markdown document.");
      });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPrimaryModifierEvent(event) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        handleNew();
        return;
      }

      if (key === "s") {
        event.preventDefault();

        if (event.shiftKey) {
          if (hasActiveDocument) {
            handleSaveAs();
          }

          return;
        }

        if (!saveDisabled) {
          handleSave();
        }

        return;
      }

      if (key === "w" && !event.shiftKey) {
        event.preventDefault();
        handleCloseDocument();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCloseDocument, handleNew, handleSave, handleSaveAs, hasActiveDocument, saveDisabled]);

  return (
    <div aria-label="File actions" className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={handleNew}>
        <FilePlusIcon aria-hidden="true" className="size-4" />
        New
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={handleSave} disabled={saveDisabled}>
        <SaveIcon aria-hidden="true" className="size-4" />
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleSaveAs}
        disabled={!hasActiveDocument}
      >
        <SaveAllIcon aria-hidden="true" className="size-4" />
        Save as...
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCloseDocument}
        disabled={!hasActiveDocument}
      >
        <XIcon aria-hidden="true" className="size-4" />
        Close document
      </Button>
    </div>
  );
}
