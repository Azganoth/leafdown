import {
  BookmarkIcon,
  ChevronsUpDownIcon,
  FolderIcon,
  FolderPlusIcon,
  SearchIcon,
} from "lucide-react";
import { useRef, useState, type ComponentProps, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocalization } from "@/lib/i18n";
import { getPathParts, isSamePath } from "@/lib/path";

import type { NamedFolder } from "../services/namedFoldersApi";
import {
  activateNamedFolder,
  keepNamedFolder,
  removeNamedFolder,
  runNamedFolderAction,
  showNamedFolders,
} from "../services/namedFolderWorkflows";
import { useNamedFoldersStore } from "../stores/namedFolders";
import { getSessionFolderPath, useSessionStore } from "../stores/session";
import { NamedFolderDialog } from "./named-folder-dialog";

export function NamedFolderSelector() {
  const { t } = useLocalization();
  const folders = useNamedFoldersStore((state) => state.folders);
  const activeId = useNamedFoldersStore((state) => state.activeId);
  const path = useSessionStore(getSessionFolderPath);
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start" />}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {folders.find((folder) => folder.contextId === activeId)?.name ??
            (path ? getPathParts(path).name : t("session.bookmarks.title"))}
        </span>
        <ChevronsUpDownIcon />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[var(--available-height)] w-80 max-w-[calc(100vw-2rem)] gap-0 p-2"
        aria-label={t("session.bookmarks.title")}
      >
        <FolderPicker onSelected={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

interface FolderChoice {
  name: string;
  path: string;
  folder: NamedFolder | null;
  current: boolean;
}
interface FolderEditorState {
  folder: NamedFolder | null;
}
interface FolderPickerProps {
  onSelected: () => void;
}
function FolderPicker({ onSelected }: FolderPickerProps) {
  const { t } = useLocalization();
  const folders = useNamedFoldersStore((state) => state.folders);
  const activeId = useNamedFoldersStore((state) => state.activeId);
  const busy = useNamedFoldersStore((state) => state.transitioning);
  const path = useSessionStore(getSessionFolderPath);
  const sessions = useNamedFoldersStore((state) => state.sessions);
  const recoverable = sessions.filter(
    (session) => session.hasUnsavedDrafts && !session.windowLabel,
  );
  const [recovering, setRecovering] = useState(false);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<FolderEditorState | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement>(null);
  const choices: FolderChoice[] = folders.map((folder) => ({
    name: folder.name,
    path: folder.path,
    folder,
    current:
      folder.contextId === activeId || Boolean(!activeId && path && isSamePath(folder.path, path)),
  }));
  if (path && !choices.some((choice) => choice.current))
    choices.unshift({ name: getPathParts(path).name, path, folder: null, current: true });
  const visible = choices.filter((choice) =>
    `${choice.name} ${choice.path}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const focusRow = (index: number) => {
    const buttons = rowsRef.current?.querySelectorAll<HTMLButtonElement>("[data-folder-choice]");
    if (!buttons?.length) return;
    const button = buttons[(index + buttons.length) % buttons.length];
    button.focus();
    button.scrollIntoView({ block: "nearest" });
  };
  return (
    <>
      <div aria-busy={busy} inert={busy} className="flex min-h-0 flex-col gap-2">
        <InputGroup className="h-8 border-transparent bg-muted/50 shadow-none dark:bg-muted/50">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            aria-label={t("session.bookmarks.search")}
            placeholder={t("session.bookmarks.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                focusRow(event.key === "ArrowDown" ? 0 : -1);
              }
            }}
          />
        </InputGroup>
        <ScrollArea className="mt-2 min-h-0 px-1" viewportClassName="max-h-64 overscroll-contain">
          <div
            ref={rowsRef}
            onKeyDown={(event) => {
              if (
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                !rowsRef.current?.contains(event.target as Node)
              )
                return;
              const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
              if (!keys.includes(event.key)) return;
              const buttons = Array.from(rowsRef.current.querySelectorAll("[data-folder-choice]"));
              const button = (event.target as HTMLElement)
                .closest("[data-folder-row]")
                ?.querySelector("[data-folder-choice]");
              if (!button) return;
              event.preventDefault();
              focusRow(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? -1
                    : buttons.indexOf(button) + (event.key === "ArrowDown" ? 1 : -1),
              );
            }}
          >
            {visible.map((choice) => (
              <FolderRow
                key={choice.current ? "current" : choice.folder?.id}
                choice={choice}
                onSelected={onSelected}
                onRemoved={() => searchRef.current?.focus()}
                onEdit={(element) => {
                  returnFocus.current = element;
                  setEditor({ folder: choice.folder });
                }}
              />
            ))}
            {!visible.length && (
              <p role="status" className="p-3 text-sm text-muted-foreground">
                {t("session.bookmarks.empty")}
              </p>
            )}
          </div>
        </ScrollArea>
        <Separator />
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={(event) => {
            returnFocus.current = event.currentTarget;
            setEditor({ folder: null });
          }}
        >
          <FolderPlusIcon />
          {t("session.bookmarks.add")}
        </Button>
        {recoverable.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={(event) => {
              returnFocus.current = event.currentTarget;
              setRecovering(true);
            }}
          >
            {t("session.bookmarks.recover")}
          </Button>
        )}
      </div>
      <Dialog
        open={recovering}
        onOpenChange={(open) => {
          if (!busy) setRecovering(open);
        }}
      >
        <DialogContent
          finalFocus={returnFocus}
          aria-describedby={undefined}
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>{t("session.bookmarks.recoveryTitle")}</DialogTitle>
          </DialogHeader>
          <ScrollArea viewportClassName="max-h-64">
            <div className="flex flex-col gap-1" inert={busy}>
              {recoverable.map((session) => (
                <FolderTooltip key={session.id} content={session.path}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() =>
                      void runNamedFolderAction(async () => {
                        if (await activateNamedFolder(session.id, false, undefined, true)) {
                          setRecovering(false);
                          onSelected();
                        }
                      })
                    }
                  >
                    <FolderIcon data-icon="inline-start" />
                    <span className="truncate">{session.name}</span>
                  </Button>
                </FolderTooltip>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {editor && (
        <NamedFolderDialog
          folder={editor.folder}
          returnFocus={returnFocus}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

interface FolderRowProps {
  onRemoved: () => void;
  choice: FolderChoice;
  onSelected: () => void;
  onEdit: (element: HTMLElement | null) => void;
}
function FolderRow({
  choice: { name, path, folder, current },
  onSelected,
  onEdit,
  onRemoved,
}: FolderRowProps) {
  const { t } = useLocalization();
  const rowButton = useRef<HTMLButtonElement>(null);
  const editing = useRef(false);
  const bookmarkLabel = t(folder ? "session.bookmarks.remove" : "session.bookmarks.keep");
  const toggleBookmark = () => {
    void runNamedFolderAction(async () => {
      if (folder) {
        await removeNamedFolder(folder);
        if (!current) onRemoved();
      } else await keepNamedFolder(name);
    });
  };
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) editing.current = false;
      }}
    >
      <ContextMenuTrigger
        render={<div />}
        data-folder-row
        data-active={current}
        className="group/folder relative flex min-w-0 items-center rounded-md px-1 before:pointer-events-none before:absolute before:top-1/2 before:left-[3px] before:h-3 before:w-[3px] before:-translate-y-1/2 before:rounded-full hover:bg-muted data-[active=true]:before:bg-primary dark:hover:bg-muted/50"
      >
        <FolderTooltip
          content={path}
          anchor={() => {
            const button = rowButton.current;
            const popover = button?.closest('[data-slot="popover-content"]');
            if (!button || !popover) return button;
            return {
              contextElement: button,
              getBoundingClientRect: () => {
                const row = button.getBoundingClientRect();
                const panel = popover.getBoundingClientRect();
                return new DOMRect(panel.x, row.y, panel.width, row.height);
              },
            };
          }}
        >
          <Button
            ref={rowButton}
            data-folder-choice
            variant="ghost"
            size="default"
            aria-current={current ? "true" : undefined}
            className="min-w-0 flex-1 justify-start font-normal hover:bg-transparent dark:hover:bg-transparent"
            onClick={() =>
              void runNamedFolderAction(async () => {
                if (!folder || (await activateNamedFolder(folder.contextId))) onSelected();
              })
            }
          >
            <span className="truncate">{name}</span>
          </Button>
        </FolderTooltip>
        <FolderTooltip content={bookmarkLabel}>
          <Button variant="ghost" size="icon" aria-label={bookmarkLabel} onClick={toggleBookmark}>
            <BookmarkIcon className={folder ? "fill-current" : undefined} />
          </Button>
        </FolderTooltip>
      </ContextMenuTrigger>
      <ContextMenuContent finalFocus={() => (editing.current ? false : rowButton.current)}>
        <ContextMenuGroup>
          {folder && (
            <ContextMenuItem
              onClick={() => {
                editing.current = true;
                onEdit(rowButton.current);
              }}
            >
              {t("session.bookmarks.editAction")}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={toggleBookmark}>
            {folder ? t("session.bookmarks.removeAction") : bookmarkLabel}
          </ContextMenuItem>
        </ContextMenuGroup>
        {folder && (
          <>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem
                onClick={() =>
                  void runNamedFolderAction(() => activateNamedFolder(folder.contextId, true))
                }
              >
                {t("session.bookmarks.newWindow")}
              </ContextMenuItem>
            </ContextMenuGroup>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function NamedFoldersList() {
  const { t } = useLocalization();
  const folders = useNamedFoldersStore((state) => state.folders);
  return (
    <section aria-label={t("session.bookmarks.title")} className="flex min-w-0 flex-col gap-2">
      <Button variant="ghost" onClick={showNamedFolders}>
        {t("session.bookmarks.title")}
      </Button>
      {folders.map((folder) => (
        <Button
          key={folder.id}
          variant="outline"
          onClick={() => void runNamedFolderAction(() => activateNamedFolder(folder.contextId))}
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
  const busy = useNamedFoldersStore((state) => state.transitioning);
  return (
    <Dialog
      open={open}
      onOpenChange={(dialogOpen) => {
        if (!busy) useNamedFoldersStore.setState({ dialogOpen });
      }}
    >
      <DialogContent showCloseButton={!busy} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("session.bookmarks.title")}</DialogTitle>
        </DialogHeader>
        <FolderPicker onSelected={() => useNamedFoldersStore.setState({ dialogOpen: false })} />
      </DialogContent>
    </Dialog>
  );
}
interface FolderTooltipProps {
  content: string;
  children: ReactElement;
  anchor?: ComponentProps<typeof TooltipContent>["anchor"];
}
function FolderTooltip({ content, children, anchor }: FolderTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" anchor={anchor}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
