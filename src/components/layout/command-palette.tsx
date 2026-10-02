import { useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  COMMAND_DEFINITIONS,
  formatShortcut,
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
  const [selectedId, setSelectedId] = useState<AppCommandId | undefined>();
  const commands = PALETTE_COMMAND_IDS.map((id) => {
    const label = t(getCommandLabelId(id));
    const menuPath = [...getCommandMenuPathIds(id).map((pathId) => t(pathId)), label].join(" › ");
    return { id, label, menuPath };
  });
  const results = searchPaletteCommands(commands, query);
  const activeCommand =
    results.find(({ id }) => id === selectedId && commandState(id).enabled) ??
    results.find(({ id }) => commandState(id).enabled);

  const execute = (commandId: AppCommandId) => {
    if (!commandState(commandId).enabled) {
      return;
    }

    executingRef.current = true;
    flushSync(() => onOpenChange(false));
    returnFocusToOpener();
    requestAnimationFrame(() => onExecute(commandId));
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
        onValueChange={(value) => setSelectedId(value as AppCommandId)}
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
              style: {
                maxHeight:
                  "round(down, min(24rem, calc(100dvh - min(20dvh, 10rem) - 10rem)), 4rem)",
              },
            }}
          >
            <CommandList className="max-h-none overflow-visible">
              <CommandEmpty>{t("commandPalette.noResults")}</CommandEmpty>
              {results.length > 0 && (
                <CommandGroup value="commands">
                  {results.map(({ id, label, menuPath }) => {
                    const state = commandState(id);
                    const shortcut = COMMAND_DEFINITIONS[id].shortcuts?.[0];

                    return (
                      <CommandItem
                        key={id}
                        className="h-16 snap-start gap-3 px-3"
                        disabled={!state.enabled}
                        onSelect={() => execute(id)}
                        title={!state.enabled ? state.reason : undefined}
                        value={id}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {menuPath}
                          </span>
                          {!state.enabled && state.reason && (
                            <span className="block truncate text-xs">{state.reason}</span>
                          )}
                        </span>
                        {shortcut && <CommandShortcut>{formatShortcut(shortcut)}</CommandShortcut>}
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
          onClick={() => activeCommand && execute(activeCommand.id)}
          size="sm"
          type="button"
        >
          {t("commandPalette.run")}
          <kbd className="rounded-sm border border-primary-foreground/40 px-1 text-[0.625rem] leading-4">
            Enter
          </kbd>
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
