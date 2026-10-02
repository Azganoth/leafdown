import { Fragment } from "react";

import {
  formatShortcut,
  getShortcutKeyLabels,
  getShortcutReferenceGroups,
  type CommandShortcut,
} from "@/commands";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocalization } from "@/lib/i18n";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ShortcutKeys({ shortcut }: { shortcut: CommandShortcut }) {
  return (
    <kbd className="inline-flex items-center gap-1 font-sans">
      <span className="sr-only">{formatShortcut(shortcut)}</span>
      {getShortcutKeyLabels(shortcut).map((label) => (
        <kbd
          aria-hidden
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5 text-[0.6875rem] leading-none font-medium text-foreground/80 shadow-[0_1px_0_var(--border)]"
          key={label}
        >
          {label}
        </kbd>
      ))}
    </kbd>
  );
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const { t } = useLocalization();
  const groups = getShortcutReferenceGroups();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(40rem,calc(100dvh-2rem))] min-h-0 flex-col gap-4 sm:max-w-2xl">
        <DialogHeader className="shrink-0 pr-10">
          <DialogTitle>{t("command.help.keyboardShortcuts")}</DialogTitle>
          <DialogDescription>{t("shortcuts.description")}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1" viewportClassName="max-h-full">
          <div className="space-y-6 pr-4 pb-1">
            {groups.map((group) => (
              <section aria-label={t(group.labelId)} key={group.id}>
                <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t(group.labelId)}
                </h3>
                <ul className="divide-y divide-border/60">
                  {group.entries.map((entry) => (
                    <li
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 py-2 text-sm"
                      key={entry.id}
                    >
                      <span>{t(entry.labelId)}</span>
                      <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                        {entry.shortcuts.map((shortcut, index) => (
                          <Fragment key={formatShortcut(shortcut)}>
                            {index > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {t("shortcuts.alternative")}
                              </span>
                            )}
                            <ShortcutKeys shortcut={shortcut} />
                          </Fragment>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </ScrollArea>
        <p className="shrink-0 border-t pt-3 text-xs text-muted-foreground">
          {t("shortcuts.modLegend")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
