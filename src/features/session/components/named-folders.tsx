import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useLocalization } from "@/lib/i18n";

import type { NamedFolder } from "../services/namedFoldersApi";
import {
  activateNamedFolder,
  keepNamedFolder,
  locateNamedFolder,
  removeNamedFolder,
  renameNamedFolder,
  runNamedFolderAction,
  showNamedFolders,
} from "../services/namedFolderWorkflows";
import { pickAndOpenFolderContext } from "../services/openSession";
import { useNamedFoldersStore } from "../stores/namedFolders";
import { getSessionFolderPath, useSessionStore } from "../stores/session";

export function NamedFolderSelector() {
  const { t } = useLocalization();
  const folders = useNamedFoldersStore((state) => state.folders);
  const activeId = useNamedFoldersStore((state) => state.activeId);
  return (
    <Button type="button" variant="outline" className="m-2 shrink-0" onClick={showNamedFolders}>
      {folders.find((folder) => folder.id === activeId)?.name ?? t("session.namedFolders.title")}
    </Button>
  );
}

export function NamedFoldersList() {
  const { t } = useLocalization();
  const folders = useNamedFoldersStore((state) => state.folders);
  return (
    <section aria-label={t("session.namedFolders.title")} className="flex min-w-0 flex-col gap-2">
      <Button variant="ghost" onClick={showNamedFolders}>
        {t("session.namedFolders.title")}
      </Button>
      {folders.map((folder) => (
        <Button
          key={folder.id}
          variant="outline"
          onClick={() => void runNamedFolderAction(() => activateNamedFolder(folder.id))}
        >
          {folder.name}
        </Button>
      ))}
    </section>
  );
}

export function NamedFoldersDialog() {
  const { t } = useLocalization();
  const open = useNamedFoldersStore((state) => state.dialogOpen);
  const folders = useNamedFoldersStore((state) => state.folders);
  const activeId = useNamedFoldersStore((state) => state.activeId);
  const busy = useNamedFoldersStore((state) => state.transitioning);
  const folderPath = useSessionStore(getSessionFolderPath);
  const [name, setName] = useState("");
  const nameId = useId();
  return (
    <Dialog
      open={open}
      onOpenChange={(dialogOpen) => {
        if (!busy) {
          useNamedFoldersStore.setState({ dialogOpen });
        }
      }}
    >
      <DialogContent className="max-h-[80vh] overflow-y-auto" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t("session.namedFolders.title")}</DialogTitle>
          <DialogDescription>{t("session.namedFolders.description")}</DialogDescription>
        </DialogHeader>
        <div aria-busy={busy} inert={busy} className="flex flex-col gap-4">
          {folders.map((folder) => (
            <NamedFolderRow key={folder.id} folder={folder} active={folder.id === activeId} />
          ))}
          {activeId ? (
            <Button
              variant="outline"
              onClick={() => void runNamedFolderAction(() => activateNamedFolder(null))}
            >
              {t("session.namedFolders.park")}
            </Button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void runNamedFolderAction(async () => {
                  if (await keepNamedFolder(name)) {
                    setName("");
                  }
                });
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={nameId}>{t("session.namedFolders.name")}</FieldLabel>
                  <Input
                    id={nameId}
                    value={name}
                    maxLength={200}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <p className="text-sm break-all text-muted-foreground">
                  {folderPath ?? t("session.namedFolders.chooseFirst")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void runNamedFolderAction(pickAndOpenFolderContext)}
                >
                  {t("session.namedFolders.choose")}
                </Button>
                <Button type="submit" disabled={!folderPath || !name.trim()}>
                  {t("session.namedFolders.keep")}
                </Button>
              </FieldGroup>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NamedFolderRow({ folder, active }: { folder: NamedFolder; active: boolean }) {
  const { t } = useLocalization();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const nameId = useId();
  return (
    <section aria-label={folder.name} className="flex flex-col gap-2 rounded-md border p-3">
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runNamedFolderAction(async () => {
              await renameNamedFolder(folder.id, name);
              setEditing(false);
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={nameId}>{t("session.namedFolders.name")}</FieldLabel>
              <Input
                id={nameId}
                value={name}
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={!name.trim()}>
              {t("session.namedFolders.rename")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              {t("session.namedFolders.cancel")}
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <Button
          variant="ghost"
          aria-pressed={active}
          onClick={() =>
            void runNamedFolderAction(async () => {
              if (await activateNamedFolder(folder.id)) {
                useNamedFoldersStore.setState({ dialogOpen: false });
              }
            })
          }
        >
          {folder.name}
        </Button>
      )}
      <p className="text-sm break-all text-muted-foreground">{folder.path}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void runNamedFolderAction(() => activateNamedFolder(folder.id, true))}
        >
          {t("session.namedFolders.newWindow")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setName(folder.name);
            setEditing(true);
          }}
        >
          {t("session.namedFolders.rename")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={folder.windowLabel !== null}
          onClick={() => void runNamedFolderAction(() => locateNamedFolder(folder.id))}
        >
          {t("session.namedFolders.locate")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={folder.windowLabel !== null}
          onClick={() => void runNamedFolderAction(() => removeNamedFolder(folder))}
        >
          {t("session.namedFolders.remove")}
        </Button>
      </div>
    </section>
  );
}
