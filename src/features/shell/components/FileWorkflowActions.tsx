import { Button } from "@/components/ui/Button";
import {
  createNewMarkdownDocument,
  saveActiveMarkdownDocument,
  saveActiveMarkdownDocumentAs,
} from "@/lib/documentWorkflows";
import { useSessionStore } from "@/stores/session";
import { FilePlusIcon, SaveAllIcon, SaveIcon } from "lucide-react";
import { useEffect, useCallback } from "react";
import { toast } from "sonner";

const isPrimaryModifierEvent = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

export function FileWorkflowActions() {
  const hasActiveDocument = useSessionStore((state) => Boolean(state.activeDocument));

  const handleNew = useCallback(() => {
    createNewMarkdownDocument();
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
          handleSaveAs();
          return;
        }

        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleNew, handleSave, handleSaveAs]);

  return (
    <div aria-label="File actions" className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={handleNew}>
        <FilePlusIcon aria-hidden="true" className="size-4" />
        New
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleSave}
        disabled={!hasActiveDocument}
      >
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
    </div>
  );
}
