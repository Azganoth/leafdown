import { CheckIcon } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import {
  Autocomplete,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useLocalization } from "@/lib/i18n";

import { CALLOUT_TYPES } from "../plugins/callout";
import type { CalloutTypeRequest } from "../plugins/calloutType";

const matchesType = (token: string, query: string) =>
  token.toLowerCase().includes(query.trim().toLowerCase());

interface EditorCalloutTypePickerProps {
  onApply: (token: string) => boolean;
  onCancel: () => void;
  onReturnFocus: () => void;
  request: CalloutTypeRequest | null;
}

export function EditorCalloutTypePicker({ request, ...props }: EditorCalloutTypePickerProps) {
  if (!request) {
    return null;
  }

  const { target } = request;
  const key = target.type === "change" ? `change:${target.position}` : `insert:${target.boundary}`;

  return <CalloutTypePicker key={key} request={request} {...props} />;
}

interface CalloutTypePickerProps extends EditorCalloutTypePickerProps {
  request: CalloutTypeRequest;
}

function CalloutTypePicker({ onApply, onCancel, onReturnFocus, request }: CalloutTypePickerProps) {
  const { t } = useLocalization();
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightedRef = useRef<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const inserting = request.target.type === "insert";

  // The picker unmounts as the request ends rather than closing, so focus goes back by hand.
  const cancel = (returnFocus: boolean) => {
    onCancel();

    if (returnFocus) {
      onReturnFocus();
    }
  };

  const apply = (token: string) => {
    if (onApply(token)) {
      onReturnFocus();
    } else {
      cancel(true);
    }
  };

  // Heard after the list has had the key, which takes `Enter` for a highlighted row.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && !event.defaultPrevented && highlightedRef.current === undefined) {
      event.preventDefault();

      if (search.trim() === "") {
        cancel(true);
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
        align={inserting ? "start" : "end"}
        anchor={request.anchor}
        aria-label={t(inserting ? "editor.calloutType.insertLabel" : "editor.calloutType.label")}
        className="w-56 gap-0 overflow-hidden p-0"
        data-testid="editor-callout-type-picker"
        finalFocus={false}
        initialFocus={() => inputRef.current ?? false}
        side="bottom"
        sideOffset={6}
      >
        <div onKeyDown={handleKeyDown}>
          <Autocomplete
            autoHighlight
            filter={matchesType}
            highlightItemOnHover={false}
            inline
            items={CALLOUT_TYPES[request.dialect]}
            onItemHighlighted={(token) => {
              highlightedRef.current = token;
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
                aria-label={t("editor.calloutType.search")}
                autoComplete="off"
                className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                placeholder={t("editor.calloutType.searchPlaceholder")}
                ref={inputRef}
                spellCheck={false}
              />
            </div>
            <AutocompleteList aria-label={t("editor.calloutType.list")} className="max-h-64">
              {(token: string) => (
                <AutocompleteItem
                  className="hover:bg-muted"
                  data-current={token === request.token || undefined}
                  key={token}
                  onClick={() => apply(token)}
                  value={token}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {token === request.token && <CheckIcon className="size-4" />}
                  </span>
                  <span className="font-mono">{token}</span>
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </Autocomplete>
        </div>
      </PopoverContent>
    </Popover>
  );
}
