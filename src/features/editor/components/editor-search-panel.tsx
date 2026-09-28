import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaseSensitiveIcon,
  ChevronRightIcon,
  ReplaceAllIcon,
  ReplaceIcon,
  WholeWordIcon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocalization, type Translate } from "@/lib/i18n";
import { isPrimaryModifierEvent } from "@/lib/input";
import { cn } from "@/lib/utils";

import type { EditorSearchControls } from "../hooks/useMilkdownEditorInstance";
import type { EditorSearchState } from "../plugins/search";

interface EditorSearchPanelProps {
  search: EditorSearchControls;
}

export function EditorSearchPanel({ search }: EditorSearchPanelProps) {
  if (!search.state.open) {
    return null;
  }

  return <SearchPanel search={search} />;
}

const describeResults = (t: Translate, state: EditorSearchState) => {
  if (state.query === "") {
    return "";
  }

  if (state.matchCount === 0) {
    return t("editor.search.noResults");
  }

  return state.currentIndex === null
    ? t("editor.search.results", { count: state.matchCount })
    : t("editor.search.currentResult", {
        count: state.matchCount,
        current: state.currentIndex + 1,
      });
};

const isComposing = (event: KeyboardEvent) => event.nativeEvent.isComposing;

const SCROLLING_OVERFLOW_PATTERN = /auto|scroll|overlay/u;

const findScrollingAncestor = (element: Element) => {
  for (let current = element.parentElement; current; current = current.parentElement) {
    if (SCROLLING_OVERFLOW_PATTERN.test(getComputedStyle(current).overflowY)) {
      return current;
    }
  }

  return null;
};

function SearchPanel({ search }: EditorSearchPanelProps) {
  const { t } = useLocalization();
  const clearanceRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  const { state } = search;
  const { focusRequest } = state;
  const replacing = state.mode === "replace";
  const hasMatches = state.matchCount > 0;

  useEffect(() => {
    if (!focusRequest) {
      return undefined;
    }

    const focusField = () => {
      const field =
        focusRequest.target === "replacement" ? replacementRef.current : queryRef.current;

      field?.focus();
      field?.select();
    };

    focusField();

    // A menu that ran the command hands focus back to its trigger as it closes, after this effect.
    const frame = window.requestAnimationFrame(() => {
      if (!panelRef.current?.contains(document.activeElement)) {
        focusField();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest]);

  // The clearance lets a match at the very top of the document scroll clear of the panel, and
  // moving the scroll by its height keeps the text where it was as the panel opens and closes.
  useLayoutEffect(() => {
    const clearance = clearanceRef.current;
    const scroller = clearance && findScrollingAncestor(clearance);

    if (!clearance || !scroller) {
      return undefined;
    }

    const height = clearance.offsetHeight;

    scroller.scrollTop += height;

    return () => {
      scroller.scrollTop -= height;
    };
  }, []);

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !isComposing(event)) {
      event.preventDefault();
      search.close();
    }
  };

  const handleQueryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposing(event)) {
      return;
    }

    event.preventDefault();

    if (event.shiftKey) {
      search.findPrevious();
    } else {
      search.findNext();
    }
  };

  const handleReplacementKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposing(event)) {
      return;
    }

    event.preventDefault();

    if (isPrimaryModifierEvent(event.nativeEvent) && event.altKey) {
      search.replaceAll();
    } else {
      search.replace();
    }
  };

  return (
    <>
      {/* The margins cancel the editor host's padding from `milkdown-editor.css`, so the layer
          spans the scrolled view from its top edge. */}
      <div className="pointer-events-none sticky top-0 z-30 -mx-6 -mt-8 mb-8 h-0 sm:-mx-8 sm:-mt-10 sm:mb-10">
        <div
          aria-label={t("editor.search.label")}
          className="pointer-events-auto absolute top-2 right-3 flex w-[min(26rem,calc(100%-1.5rem))] items-start gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          data-testid="editor-search-panel"
          onKeyDown={handlePanelKeyDown}
          ref={panelRef}
          role="search"
        >
          <div className="flex h-7 items-center">
            <SearchButton
              aria-expanded={replacing}
              label={t(replacing ? "editor.search.hideReplace" : "editor.search.showReplace")}
              onClick={() => search.setMode(replacing ? "find" : "replace")}
            >
              <ChevronRightIcon className={cn("transition-transform", replacing && "rotate-90")} />
            </SearchButton>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-0.5">
              <InputGroup className="h-7 min-w-0 flex-1">
                <InputGroupInput
                  aria-label={t("editor.search.query")}
                  autoComplete="off"
                  className="h-7 min-w-0"
                  onChange={(event) => search.changeQuery({ query: event.target.value })}
                  onKeyDown={handleQueryKeyDown}
                  placeholder={t("editor.search.query")}
                  ref={queryRef}
                  spellCheck={false}
                  value={state.query}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText
                    className="text-xs whitespace-nowrap tabular-nums"
                    data-testid="editor-search-results"
                    role="status"
                  >
                    {describeResults(t, state)}
                  </InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <SearchToggle
                label={t("editor.search.matchCase")}
                onPressedChange={(caseSensitive) => search.changeQuery({ caseSensitive })}
                pressed={state.caseSensitive}
              >
                <CaseSensitiveIcon />
              </SearchToggle>
              <SearchToggle
                label={t("editor.search.wholeWord")}
                onPressedChange={(wholeWord) => search.changeQuery({ wholeWord })}
                pressed={state.wholeWord}
              >
                <WholeWordIcon />
              </SearchToggle>
              <SearchButton
                disabled={!hasMatches}
                label={t("editor.search.previous")}
                onClick={search.findPrevious}
              >
                <ArrowUpIcon />
              </SearchButton>
              <SearchButton
                disabled={!hasMatches}
                label={t("editor.search.next")}
                onClick={search.findNext}
              >
                <ArrowDownIcon />
              </SearchButton>
              <SearchButton label={t("editor.search.close")} onClick={search.close}>
                <XIcon />
              </SearchButton>
            </div>
            {replacing && (
              <div className="flex min-w-0 items-center gap-0.5">
                <InputGroup className="h-7 min-w-0 flex-1">
                  <InputGroupInput
                    aria-label={t("editor.search.replacement")}
                    autoComplete="off"
                    className="h-7 min-w-0"
                    onChange={(event) => search.changeReplacement(event.target.value)}
                    onKeyDown={handleReplacementKeyDown}
                    placeholder={t("editor.search.replacement")}
                    ref={replacementRef}
                    spellCheck={false}
                    value={search.replacement}
                  />
                </InputGroup>
                <SearchButton
                  disabled={!hasMatches}
                  label={t("editor.search.replace")}
                  onClick={search.replace}
                >
                  <ReplaceIcon />
                </SearchButton>
                <SearchButton
                  disabled={!hasMatches}
                  label={t("editor.search.replaceAll")}
                  onClick={search.replaceAll}
                >
                  <ReplaceAllIcon />
                </SearchButton>
              </div>
            )}
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="h-(--leafdown-search-clearance)" ref={clearanceRef} />
    </>
  );
}

interface SearchControlProps {
  children: ReactNode;
  label: string;
}

// A control that lost its only match keeps focus rather than dropping it on the document body.
function SearchButton({
  children,
  label,
  ...props
}: SearchControlProps & Omit<ComponentProps<typeof Button>, "children">) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="size-6 aria-disabled:opacity-50"
            focusableWhenDisabled
            size="icon-sm"
            type="button"
            variant="ghost"
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function SearchToggle({
  children,
  label,
  ...props
}: SearchControlProps & Omit<ComponentProps<typeof Toggle>, "children">) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Toggle aria-label={label} className="size-6 min-w-6 px-0" size="sm" {...props} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
