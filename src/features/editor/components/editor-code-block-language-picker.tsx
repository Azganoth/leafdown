import { CheckIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import {
  Autocomplete,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete";
import { Popover, PopoverContent } from "@/components/ui/popover";

import { normalizeCodeBlockLanguage } from "../commands/formatting/codeBlockLanguage";
import type { CodeBlockLanguageRequest } from "../plugins/codeBlockLanguage";
import {
  HIGHLIGHT_LANGUAGE_CHOICES,
  type HighlightLanguageChoice,
} from "../utils/highlightLanguages";

const PICKER_LABEL = "Code block language";
const NO_LANGUAGE_LABEL = "No language";

type PickerRow = { kind: "none" } | ({ kind: "language" } & HighlightLanguageChoice);

const NO_LANGUAGE_ROW: PickerRow = { kind: "none" };
const LANGUAGE_ROWS: PickerRow[] = HIGHLIGHT_LANGUAGE_CHOICES.map((choice) => ({
  kind: "language",
  ...choice,
}));

const rowLanguage = (row: PickerRow) => (row.kind === "none" ? "" : row.language);

const rowKey = (row: PickerRow) => (row.kind === "none" ? "" : row.language);

// A search reads the aliases too, so `ts` finds TypeScript. Clearing is offered only before a
// search narrows the list.
const matchesRow = (row: PickerRow, query: string) => {
  const search = query.trim().toLowerCase();

  if (row.kind === "none") {
    return search === "";
  }

  return [row.language, ...row.aliases].some((name) => name.includes(search));
};

const isCurrentRow = (row: PickerRow, language: string) => {
  const current = language.toLowerCase();

  return row.kind === "none"
    ? current === ""
    : row.language === current || row.aliases.includes(current);
};

interface EditorCodeBlockLanguagePickerProps {
  onApply: (language: string) => boolean;
  onCancel: () => void;
  onReturnFocus: () => void;
  request: CodeBlockLanguageRequest | null;
}

export function EditorCodeBlockLanguagePicker({
  request,
  ...props
}: EditorCodeBlockLanguagePickerProps) {
  if (!request) {
    return null;
  }

  return <CodeBlockLanguagePicker key={request.position} request={request} {...props} />;
}

interface CodeBlockLanguagePickerProps extends EditorCodeBlockLanguagePickerProps {
  request: CodeBlockLanguageRequest;
}

function CodeBlockLanguagePicker({
  onApply,
  onCancel,
  onReturnFocus,
  request,
}: CodeBlockLanguagePickerProps) {
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightedRef = useRef<PickerRow | undefined>(undefined);
  const [search, setSearch] = useState("");
  const typed = normalizeCodeBlockLanguage(search);
  const rows = request.language ? [NO_LANGUAGE_ROW, ...LANGUAGE_ROWS] : LANGUAGE_ROWS;

  // The picker unmounts as the request ends rather than closing, so focus goes back by hand.
  const cancel = (returnFocus: boolean) => {
    onCancel();

    if (returnFocus) {
      onReturnFocus();
    }
  };

  const apply = (language: string) => {
    if (onApply(language)) {
      onReturnFocus();
    } else {
      cancel(true);
    }
  };

  // Heard after the list has had the key, which takes `Enter` for a highlighted row. Otherwise the
  // search text is the language, exactly as typed.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && !event.defaultPrevented && highlightedRef.current === undefined) {
      event.preventDefault();

      if (typed === "") {
        cancel(true);
      } else if (typed !== null) {
        apply(typed);
      }
    }

    // Tabbing on would land after the portal rather than back in the text.
    if (event.key === "Tab") {
      event.preventDefault();
      cancel(true);
    }
  };

  return (
    <Popover
      open
      onOpenChange={(open, details) => {
        // Every other dismissal follows focus that has already gone somewhere else.
        if (!open) {
          cancel(details.reason === "escape-key");
        }
      }}
    >
      <PopoverContent
        align="end"
        anchor={request.anchor}
        aria-label={PICKER_LABEL}
        className="w-64 gap-0 overflow-hidden p-0"
        data-testid="editor-code-block-language-picker"
        finalFocus={false}
        initialFocus={() => inputRef.current ?? false}
        side="bottom"
        sideOffset={6}
      >
        <div onKeyDown={handleKeyDown}>
          <Autocomplete
            filter={matchesRow}
            highlightItemOnHover={false}
            inline
            itemToStringValue={rowLanguage}
            items={rows}
            onItemHighlighted={(row) => {
              highlightedRef.current = row;
            }}
            onOpenChange={(open, details) => {
              if (!open && details.reason === "escape-key") {
                cancel(true);
              }
            }}
            onValueChange={(value, details) => {
              // An item press fills the field with that item before its own click applies it.
              if (details.reason !== "item-press") {
                setSearch(value);
              }
            }}
            open
            value={search}
          >
            <div className="border-b border-border p-1">
              <AutocompleteInput
                aria-describedby={typed === "" ? undefined : hintId}
                aria-invalid={typed === null || undefined}
                aria-label="Search languages"
                autoComplete="off"
                className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                placeholder="Search or type a language"
                ref={inputRef}
                spellCheck={false}
              />
            </div>
            <AutocompleteList aria-label="Languages" className="max-h-64">
              {(row: PickerRow) => (
                <AutocompleteItem
                  className="hover:bg-muted"
                  data-current={isCurrentRow(row, request.language) || undefined}
                  key={rowKey(row)}
                  onClick={() => apply(rowLanguage(row))}
                  value={row}
                >
                  <PickerRowContent language={request.language} meta={request.meta} row={row} />
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </Autocomplete>
          {typed !== "" && (
            <p
              className="border-t border-border px-3 py-2 text-xs text-muted-foreground"
              id={hintId}
            >
              {typed === null ? (
                "A language is one word, without spaces."
              ) : (
                <>
                  <kbd className="font-sans">Enter</kbd> sets{" "}
                  <span className="font-mono text-foreground">{typed}</span>
                </>
              )}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PickerRowContentProps {
  language: string;
  meta: string;
  row: PickerRow;
}

function PickerRowContent({ language, meta, row }: PickerRowContentProps) {
  return (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {isCurrentRow(row, language) && <CheckIcon className="size-4" />}
      </span>
      {row.kind === "none" ? (
        <span className="flex min-w-0 flex-col">
          <span>{NO_LANGUAGE_LABEL}</span>
          {meta && (
            <span className="truncate text-xs text-muted-foreground">Also removes {meta}</span>
          )}
        </span>
      ) : (
        <>
          <span className="font-mono">{row.language}</span>
          {row.aliases.length > 0 && (
            <span className="ml-auto truncate pl-2 font-mono text-xs text-muted-foreground">
              {row.aliases.join(", ")}
            </span>
          )}
        </>
      )}
    </>
  );
}
