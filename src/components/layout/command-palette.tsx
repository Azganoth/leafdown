import { useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  COMMAND_DEFINITIONS,
  getShortcutKeys,
  getCommandLabelId,
  getCommandMenuPathIds,
  getCommandPaletteOpener,
  PALETTE_COMMAND_IDS,
  type AppCommandId,
  type CommandState,
} from "@/commands";
import { searchPaletteCommands } from "@/commands/paletteSearch";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ShortcutKeys } from "@/components/ui/shortcut-keys";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  activateNamedFolder,
  runNamedFolderAction,
  useNamedFoldersStore,
} from "@/features/session";
import { useLocalization } from "@/lib/i18n";

interface CommandPaletteProps {
  commandState: (commandId: AppCommandId) => CommandState;
  onExecute: (commandId: AppCommandId) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const returnFocusToOpener = () => {
  const opener = getCommandPaletteOpener();
  const target =
    opener?.isConnected && !opener.closest('[data-slot="menubar-content"]')
      ? opener
      : document.querySelector<HTMLElement>("[data-command-palette-trigger]");
  target?.focus();
  return target ?? false;
};

export function CommandPalette(props: CommandPaletteProps) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open);
        if (!open) {
          requestAnimationFrame(returnFocusToOpener);
        }
      }}
    >
      {props.open && <PaletteContent {...props} />}
    </Dialog>
  );
}

function PaletteContent({ commandState, onExecute, onOpenChange }: CommandPaletteProps) {
  const { t } = useLocalization();
  const inputRef = useRef<HTMLInputElement>(null);
  const executingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const namedFolders = useNamedFoldersStore((state) => state.folders);
  const commands = PALETTE_COMMAND_IDS.map((id) => {
    const label = t(getCommandLabelId(id));
    const menuPath = [...getCommandMenuPathIds(id).map((pathId) => t(pathId)), label].join(" › ");
    return { id, label, menuPath, kind: "command" as const, commandId: id };
  });
  const items = [
    ...commands,
    ...namedFolders.map((folder) => ({
      id: `namedFolder:${folder.id}`,
      label: folder.name,
      menuPath: `${t("session.namedFolders.title")} › ${folder.name}`,
      kind: "folder" as const,
      folderId: folder.id,
    })),
  ];
  const results = searchPaletteCommands(items, query);
  const activeCommand =
    results.find(
      (item) =>
        item.id === selectedId && (item.kind === "folder" || commandState(item.commandId).enabled),
    ) ?? results.find((item) => item.kind === "folder" || commandState(item.commandId).enabled);

  const execute = (item: (typeof items)[number]) => {
    if (item.kind === "command" && !commandState(item.commandId).enabled) {
      return;
    }

    executingRef.current = true;
    flushSync(() => onOpenChange(false));
    returnFocusToOpener();
    requestAnimationFrame(() => {
      if (item.kind === "command") {
        onExecute(item.commandId);
      } else {
        void runNamedFolderAction(() => activateNamedFolder(item.folderId));
      }
    });
  };

  return (
    <DialogContent
      className="top-[min(20dvh,10rem)] flex max-h-[calc(100dvh-min(20dvh,10rem)-1rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      initialFocus={inputRef}
      finalFocus={() => (executingRef.current ? false : returnFocusToOpener())}
      showCloseButton={false}
    >
      <DialogTitle className="sr-only">{t("commandPalette.title")}</DialogTitle>
      <Command
        className="h-auto min-h-0 rounded-none bg-transparent"
        label={t("commandPalette.search")}
        loop
        onValueChange={setSelectedId}
        shouldFilter={false}
        value={activeCommand?.id ?? ""}
      >
        <CommandInput
          ref={inputRef}
          aria-label={t("commandPalette.search")}
          onValueChange={(value) => {
            setQuery(value);
            setSelectedId(undefined);
          }}
          placeholder={t("commandPalette.search")}
          value={query}
        />
        <Separator />
        <div className="min-h-0 p-3">
          <ScrollArea
            viewportClassName="max-h-96 snap-y snap-mandatory"
            viewportProps={{
              tabIndex: -1,
              style: {
                maxHeight:
                  "round(down, min(24rem, calc(100dvh - min(20dvh, 10rem) - 10rem)), 4rem)",
              },
            }}
          >
            <CommandList className="max-h-none overflow-visible">
              <CommandEmpty>{t("commandPalette.noResults")}</CommandEmpty>
              {results.length > 0 && (
                <CommandGroup className="p-0" value="commands">
                  {results.map((item) => {
                    const { id, label, menuPath } = item;
                    const state: CommandState =
                      item.kind === "command" ? commandState(item.commandId) : { enabled: true };
                    const shortcut =
                      item.kind === "command"
                        ? COMMAND_DEFINITIONS[item.commandId].shortcuts?.[0]
                        : undefined;

                    return (
                      <CommandItem
                        key={id}
                        className="h-16 snap-start gap-3 px-3"
                        disabled={!state.enabled}
                        onSelect={() => execute(item)}
                        value={id}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {menuPath}
                          </span>
                          {!state.enabled && state.reason && (
                            <Tooltip>
                              <TooltipTrigger render={<span className="block truncate text-xs" />}>
                                {state.reason}
                              </TooltipTrigger>
                              <TooltipContent side="bottom">{state.reason}</TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                        {shortcut && (
                          <CommandShortcut>
                            <ShortcutKeys keys={getShortcutKeys(shortcut)} size="sm" />
                          </CommandShortcut>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </ScrollArea>
        </div>
      </Command>
      <Separator />
      <DialogFooter className="h-12 shrink-0 flex-row items-center justify-end px-3 py-1.5">
        <Button
          disabled={!activeCommand}
          onClick={() => activeCommand && execute(activeCommand)}
          size="sm"
          type="button"
        >
          {t("commandPalette.run")}
          <ShortcutKeys keys={["Enter"]} size="sm" variant="primary" />
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
