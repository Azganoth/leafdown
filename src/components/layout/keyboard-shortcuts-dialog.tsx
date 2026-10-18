import { KeyboardIcon, SearchIcon, XIcon } from "lucide-react";
import { Fragment, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  filterShortcutReferenceGroups,
  filterShortcutReferenceGroupsByEvent,
  formatShortcut,
  getShortcutKeys,
  getShortcutQueryTerms,
  getShortcutReferenceGroups,
  type CommandShortcut,
} from "@/commands";
import { Dialog } from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ShortcutKeys } from "@/components/ui/shortcut-keys";
import { HelpPageBody, HelpPageContent, HelpPageHeader } from "@/features/help";
import { useLocalization } from "@/lib/i18n";
import { isPrimaryModifierEvent } from "@/lib/input";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph"]);

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const eventShortcut = (event: KeyboardEvent): CommandShortcut => ({
  key: event.key === " " ? "Space" : event.key,
  mod: isPrimaryModifierEvent(event),
  alt: event.altKey,
  shift: event.shiftKey,
});

function MatchedLabel({ text, terms }: { text: string; terms: readonly string[] }) {
  if (!terms.length) {
    return text;
  }
  const pattern = new RegExp(`(${terms.map(escapePattern).join("|")})`, "giu");
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded-[3px] bg-primary/15 text-foreground">
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const [wasOpen, setWasOpen] = useState(open);
  const [opening, setOpening] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpening(opening + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ShortcutsContent key={opening} />
    </Dialog>
  );
}

function ShortcutsContent() {
  const { t } = useLocalization();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<KeyboardEvent | null>(null);
  const allGroups = getShortcutReferenceGroups();
  const groups = recording
    ? recorded
      ? filterShortcutReferenceGroupsByEvent(allGroups, recorded)
      : allGroups
    : filterShortcutReferenceGroups(allGroups, query, t);
  const terms = recording ? [] : getShortcutQueryTerms(query);
  const highlighted = terms.filter((term) => term.length > 1);
  const count = groups.reduce((total, group) => total + group.entries.length, 0);
  const searching = recording ? recorded !== null : terms.length > 0;

  const clear = () => {
    setQuery("");
    setRecorded(null);
    searchRef.current?.focus();
  };

  const recordKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const native = event.nativeEvent;
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key === "Tab" && plain) {
      return;
    }
    event.preventDefault();
    if (event.key === "Escape" && plain && !event.shiftKey) {
      event.stopPropagation();
      setRecording(false);
      setRecorded(null);
      return;
    }
    if (!MODIFIER_KEYS.has(event.key)) {
      setRecorded(native);
    }
  };

  return (
    <HelpPageContent kind="reference" initialFocus={searchRef}>
      <HelpPageHeader
        title={t("command.help.keyboardShortcuts")}
        description={t("shortcuts.description")}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <InputGroup className="max-w-[30rem] flex-1 basis-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchRef}
              type="search"
              aria-label={recording ? t("shortcuts.recordLabel") : t("shortcuts.searchLabel")}
              placeholder={
                recording ? t("shortcuts.recordPlaceholder") : t("shortcuts.searchPlaceholder")
              }
              readOnly={recording}
              value={recording ? (recorded ? formatShortcut(eventShortcut(recorded)) : "") : query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={recording ? recordKey : undefined}
            />
            <InputGroupAddon align="inline-end">
              {searching && (
                <InputGroupButton
                  size="icon-xs"
                  aria-label={t("shortcuts.clearSearch")}
                  onClick={clear}
                >
                  <XIcon />
                </InputGroupButton>
              )}
              <InputGroupButton
                variant={recording ? "secondary" : "ghost"}
                aria-pressed={recording}
                onClick={() => {
                  setRecording(!recording);
                  setRecorded(null);
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <KeyboardIcon data-icon="inline-start" />
                {t("shortcuts.recordKeys")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <span role="status" className="text-xs text-muted-foreground tabular-nums">
            {searching ? t("shortcuts.count", { count }) : null}
          </span>
        </div>
      </HelpPageHeader>
      <HelpPageBody kind="reference">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-14 text-center">
            <p className="font-medium">{t("shortcuts.noMatches")}</p>
            <p className="text-sm text-muted-foreground">{t("shortcuts.noMatchesHint")}</p>
          </div>
        ) : (
          <div className="gap-5 @3xl/help-article:columns-2">
            {groups.map((group) => (
              <section
                aria-label={t(group.labelId)}
                key={group.id}
                className="mb-5 break-inside-avoid rounded-xl border bg-card px-4 pt-3 pb-1"
              >
                <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t(group.labelId)}
                </h3>
                <ul className="divide-y divide-border/60">
                  {group.entries.map((entry) => (
                    <li
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 py-2 text-sm leading-snug"
                      key={entry.id}
                    >
                      <span>
                        <MatchedLabel text={t(entry.labelId)} terms={highlighted} />
                      </span>
                      <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                        {entry.shortcuts.map((shortcut, index) => (
                          <Fragment key={formatShortcut(shortcut)}>
                            {index > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {t("shortcuts.alternative")}
                              </span>
                            )}
                            <ShortcutKeys keys={getShortcutKeys(shortcut)} />
                          </Fragment>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </HelpPageBody>
    </HelpPageContent>
  );
}
