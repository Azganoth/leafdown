import { useId, useMemo, useRef, useState, type SubmitEvent } from "react";

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent } from "@/components/ui/popover";

import { normalizeCodeBlockLanguage } from "../commands/formatting/codeBlockLanguage";
import type { CodeBlockLanguageRequest } from "../plugins/codeBlockLanguage";
import { HIGHLIGHT_LANGUAGE_IDENTIFIERS } from "../utils/highlightLanguages";

const POPOVER_LABEL = "Code block language";

const suggestsLanguage = (identifier: string, query: string) =>
  identifier.includes(query.trim().toLowerCase());

// An open list hides the rest of the popover from assistive technology, the field's label and
// description included, so it stays shut rather than open on nothing. An empty field suggests
// nothing either, which keeps the note on clearing the language readable.
const findSuggestions = (query: string) =>
  query.trim() === ""
    ? []
    : HIGHLIGHT_LANGUAGE_IDENTIFIERS.filter((identifier) => suggestsLanguage(identifier, query));

interface EditorCodeBlockLanguagePopoverProps {
  onApply: (language: string) => boolean;
  onCancel: () => void;
  onReturnFocus: () => void;
  request: CodeBlockLanguageRequest | null;
}

export function EditorCodeBlockLanguagePopover({
  request,
  ...props
}: EditorCodeBlockLanguagePopoverProps) {
  if (!request) {
    return null;
  }

  return <CodeBlockLanguageForm key={request.position} request={request} {...props} />;
}

interface CodeBlockLanguageFormProps extends EditorCodeBlockLanguagePopoverProps {
  request: CodeBlockLanguageRequest;
}

function CodeBlockLanguageForm({
  onApply,
  onCancel,
  onReturnFocus,
  request,
}: CodeBlockLanguageFormProps) {
  const inputId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(request.language);
  const [suggesting, setSuggesting] = useState(false);
  const suggestions = findSuggestions(value);
  const language = normalizeCodeBlockLanguage(value);
  const clearsMeta = language === "" && request.meta !== "";
  // Measured once, so the popover stays put while its field has focus and the text it anchors to
  // no longer does.
  const anchor = useMemo(() => {
    const rect = request.anchor.getRect("pinned");

    return {
      contextElement: request.anchor.contextElement,
      getBoundingClientRect: () => rect,
    };
  }, [request]);

  // The popover unmounts as the request ends rather than closing, so focus goes back by hand.
  const cancel = (returnFocus: boolean) => {
    onCancel();

    if (returnFocus) {
      onReturnFocus();
    }
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (language === null) {
      return;
    }

    if (onApply(language)) {
      onReturnFocus();
    } else {
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
        align="start"
        anchor={anchor}
        aria-label={POPOVER_LABEL}
        className="w-72 gap-3 p-3"
        data-testid="editor-code-block-language-popover"
        finalFocus={false}
        initialFocus={() => inputRef.current ?? false}
        side="bottom"
        sideOffset={8}
      >
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <Field data-invalid={language === null || undefined}>
            <FieldLabel htmlFor={inputId}>Language</FieldLabel>
            <Autocomplete
              filter={suggestsLanguage}
              items={suggestions}
              onOpenChange={setSuggesting}
              onValueChange={setValue}
              open={suggesting && suggestions.length > 0}
              value={value}
            >
              <AutocompleteInput
                aria-describedby={descriptionId}
                aria-invalid={language === null || undefined}
                autoComplete="off"
                id={inputId}
                placeholder="None"
                ref={inputRef}
                spellCheck={false}
              />
              <AutocompleteContent>
                <AutocompleteList>
                  {(identifier: string) => (
                    <AutocompleteItem key={identifier} value={identifier}>
                      {identifier}
                    </AutocompleteItem>
                  )}
                </AutocompleteList>
              </AutocompleteContent>
            </Autocomplete>
            <FieldDescription id={descriptionId}>
              {language === null
                ? "A language is one word, without spaces."
                : clearsMeta
                  ? `Clearing the language also removes the rest of the info string: ${request.meta}`
                  : "Suggested languages are highlighted. Any other name is kept as written."}
            </FieldDescription>
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => cancel(true)} size="sm" type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={language === null} size="sm" type="submit">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
