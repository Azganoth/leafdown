import { FolderOpenIcon } from "lucide-react";
import { useId, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { selectFolderContextPath } from "@/features/folder-context";
import { useLocalization } from "@/lib/i18n";
import { getPathParts } from "@/lib/path";

import { getBookmarkError, type BookmarkFormError } from "../services/bookmarkErrors";
import { addNamedFolder, updateNamedFolder } from "../services/namedFolderForms";
import type { NamedFolder } from "../services/namedFoldersApi";

interface NamedFolderDialogProps {
  folder: NamedFolder | null;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}

export function NamedFolderDialog({ folder, onClose, returnFocus }: NamedFolderDialogProps) {
  const { t } = useLocalization();
  const [name, setName] = useState(folder?.name ?? "");
  const [path, setPath] = useState(folder?.path ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<BookmarkFormError | null>(null);
  const nameId = useId();
  const pathId = useId();
  const descriptionId = useId();

  const chooseFolder = async () => {
    setPending(true);
    setError(null);
    try {
      const selected = await selectFolderContextPath();
      if (!selected) return;
      setPath(selected);
      if (!name.trim()) setName(getPathParts(selected).name);
    } catch (failure) {
      setError(getBookmarkError(failure));
    } finally {
      setPending(false);
    }
  };
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      if (await (folder ? updateNamedFolder(folder, name, path) : addNamedFolder(name, path)))
        onClose();
      else setError({ message: t("session.bookmarks.failed") });
    } catch (failure) {
      setError(getBookmarkError(failure));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        finalFocus={returnFocus}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {t(folder ? "session.bookmarks.editTitle" : "session.bookmarks.addTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          aria-busy={pending}
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            void submit();
          }}
        >
          <FieldGroup>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor={nameId}>{t("session.bookmarks.name")}</FieldLabel>
              <Input
                id={nameId}
                value={name}
                maxLength={200}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field data-disabled={pending} data-invalid={error?.field === "folder"}>
              <FieldLabel htmlFor={pathId}>{t("session.bookmarks.folder")}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={pathId}
                  value={path}
                  disabled={pending}
                  aria-invalid={error?.field === "folder"}
                  aria-describedby={error?.field === "folder" ? descriptionId : undefined}
                  onChange={(event) => {
                    setPath(event.target.value);
                    setError(null);
                  }}
                />
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={pending}
                        onClick={() => void chooseFolder()}
                        aria-label={t("session.bookmarks.selectFolder")}
                      />
                    }
                  >
                    <FolderOpenIcon />
                  </TooltipTrigger>
                  <TooltipContent>{t("session.bookmarks.selectFolder")}</TooltipContent>
                </Tooltip>
              </div>
              {error?.field === "folder" && (
                <FieldError id={descriptionId}>{error.message}</FieldError>
              )}
            </Field>
          </FieldGroup>
          {error && !error.field && <FieldError>{error.message}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t("session.bookmarks.cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || !path.trim()}>
              {t(folder ? "session.bookmarks.save" : "session.bookmarks.addTitle")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
