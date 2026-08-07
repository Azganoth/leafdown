import {
  BoldIcon,
  ChevronRightIcon,
  ClipboardPasteIcon,
  Code2Icon,
  CopyIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  PilcrowIcon,
  ScissorsIcon,
  TableIcon,
  TextQuoteIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/Popover";
import { Toolbar, ToolbarButton } from "@/components/ui/Toolbar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

import type { EditorCommandId, EditorCommandState } from "../commands";
import { EDITOR_COMMAND_LABELS } from "../commands/metadata";
import type { ContextPopupRequest } from "../plugins/contextPopup";

interface ContextButtonCommand {
  commandId: EditorCommandId;
  icon: LucideIcon;
}

interface ContextSubmenuCommand {
  commandId: EditorCommandId;
  icon?: LucideIcon;
}

const QUICK_ACTION_COMMANDS = [
  { commandId: "edit.cut", icon: ScissorsIcon },
  { commandId: "edit.copy", icon: CopyIcon },
  { commandId: "edit.paste", icon: ClipboardPasteIcon },
  { commandId: "edit.delete", icon: Trash2Icon },
] satisfies readonly ContextButtonCommand[];

const INLINE_ACTION_COMMANDS = [
  { commandId: "format.strong", icon: BoldIcon },
  { commandId: "format.emphasis", icon: ItalicIcon },
  { commandId: "format.inlineCode", icon: Code2Icon },
  { commandId: "insert.link", icon: Link2Icon },
] satisfies readonly ContextButtonCommand[];

const BLOCK_FORMATTING_COMMANDS = [
  { commandId: "format.blockquote", icon: TextQuoteIcon },
  { commandId: "format.orderedList", icon: ListOrderedIcon },
  { commandId: "format.unorderedList", icon: ListIcon },
  { commandId: "format.taskList", icon: ListTodoIcon },
] satisfies readonly ContextButtonCommand[];

const BLOCK_TYPE_COMMANDS = [
  { commandId: "format.paragraph", icon: PilcrowIcon },
  { commandId: "format.heading1", icon: Heading1Icon },
  { commandId: "format.heading2", icon: Heading2Icon },
  { commandId: "format.heading3", icon: Heading3Icon },
  { commandId: "format.heading4", icon: Heading4Icon },
  { commandId: "format.heading5", icon: Heading5Icon },
  { commandId: "format.heading6", icon: Heading6Icon },
] satisfies readonly ContextSubmenuCommand[];

const INSERT_COMMANDS = [
  { commandId: "insert.paragraph", icon: PilcrowIcon },
  { commandId: "insert.heading1", icon: Heading1Icon },
  { commandId: "insert.heading2", icon: Heading2Icon },
  { commandId: "insert.heading3", icon: Heading3Icon },
  { commandId: "insert.heading4", icon: Heading4Icon },
  { commandId: "insert.heading5", icon: Heading5Icon },
  { commandId: "insert.heading6", icon: Heading6Icon },
  { commandId: "insert.blockquote", icon: TextQuoteIcon },
  { commandId: "insert.orderedList", icon: ListOrderedIcon },
  { commandId: "insert.unorderedList", icon: ListIcon },
  { commandId: "insert.taskList", icon: ListTodoIcon },
  { commandId: "insert.codeBlock", icon: Code2Icon },
  { commandId: "insert.table", icon: TableIcon },
  { commandId: "insert.horizontalRule", icon: MinusIcon },
] satisfies readonly ContextSubmenuCommand[];

const isCommandEnabled = (commandId: EditorCommandId, commandState: EditorCommandState) =>
  commandState.status === "ready" && commandState.enabledCommands[commandId];

const CONTEXT_POPUP_LABEL = "Context actions";
const POPPER_WRAPPER_SELECTOR = "[data-radix-popper-content-wrapper]";
const REPOSITIONING_ATTRIBUTE = "data-leafdown-context-popup-repositioning";
const REPOSITIONING_SETTLE_MS = 150;

// Radix's roving focus only walks controls in document order, so vertical movement across the
// wrapped rows is worked out from these.
const toolbarPosition = (row: number, column: number) => ({
  "data-toolbar-row": row,
  "data-toolbar-column": column,
});

const ENABLED_CONTROL_SELECTOR = "[data-toolbar-row]:not([disabled])";

const readPosition = (control: HTMLElement, axis: "toolbarRow" | "toolbarColumn") =>
  Number(control.dataset[axis]);

const focusFirstControl = (toolbar: HTMLElement | null) => {
  toolbar?.querySelector<HTMLElement>(ENABLED_CONTROL_SELECTOR)?.focus();
};

const focusAdjacentRow = (toolbar: HTMLElement, control: HTMLElement, step: 1 | -1) => {
  const controls = [...toolbar.querySelectorAll<HTMLElement>(ENABLED_CONTROL_SELECTOR)];
  // A row with nothing available drops out here, which is what skips it.
  const rows = [...new Set(controls.map((candidate) => readPosition(candidate, "toolbarRow")))];
  const rowIndex = rows.indexOf(readPosition(control, "toolbarRow"));

  if (rowIndex === -1 || rows.length < 2) {
    return false;
  }

  const column = readPosition(control, "toolbarColumn");
  const nextRow = rows[(rowIndex + step + rows.length) % rows.length];
  const distanceToColumn = (candidate: HTMLElement) =>
    Math.abs(readPosition(candidate, "toolbarColumn") - column);

  controls
    .filter((candidate) => readPosition(candidate, "toolbarRow") === nextRow)
    .reduce((closest, candidate) =>
      distanceToColumn(candidate) < distanceToColumn(closest) ? candidate : closest,
    )
    .focus();

  return true;
};

// Radix's `Measurable`, plus the element Floating UI resolves scroll ancestors and clipping
// through for a virtual reference.
interface VirtualAnchor {
  contextElement: Element | undefined;
  getBoundingClientRect: () => DOMRect;
}

interface EditorContextPopupProps {
  commandState: EditorCommandState;
  onClose: () => void;
  onExecute: (commandId: EditorCommandId) => void;
  onReturnFocus: () => void;
  request: ContextPopupRequest | null;
}

export function EditorContextPopup({
  commandState,
  onClose,
  onExecute,
  onReturnFocus,
  request,
}: EditorContextPopupProps) {
  const isOpen = request !== null;
  const source = request?.source;
  const contentRef = useRef<HTMLDivElement>(null);
  // Sticky for one open popup, so that focus moving into a portalled submenu does not clear it.
  const hasHeldFocusRef = useRef(false);
  const pinnedRectRef = useRef<DOMRect | null>(null);
  const previousRequestRef = useRef<ContextPopupRequest | null>(null);
  // Radix registers the anchor once per object identity and Floating UI measures only when it
  // does, so scroll and resize aside, a fresh identity is the one thing that moves the popup
  // onto a selection that has changed. Held against the render rather than created during one,
  // or every unrelated render would re-register it.
  const virtualRef = useMemo<{ current: VirtualAnchor }>(
    () => ({
      current: {
        contextElement: request?.anchor.contextElement,
        getBoundingClientRect: () => {
          if (!request) {
            return new DOMRect();
          }

          // A keyboard popup pins from the start rather than from the focus it is about to take,
          // so it cannot hide in the moment between the two.
          if (!hasHeldFocusRef.current && request.source !== "keyboard") {
            return request.anchor.getRect("live");
          }

          pinnedRectRef.current ??= request.anchor.getRect("pinned");

          return pinnedRectRef.current;
        },
      },
    }),
    [request],
  );
  const canExecute = (commandId: EditorCommandId) => isCommandEnabled(commandId, commandState);
  const releaseHeldFocus = () => {
    hasHeldFocusRef.current = false;
    pinnedRectRef.current = null;
  };

  // Strict Mode must not mistake an opening placement for a later selection request.
  useEffect(() => {
    previousRequestRef.current = request;

    return () => {
      if (previousRequestRef.current === request) {
        previousRequestRef.current = null;
      }
    };
  }, [request]);

  // Layout is early enough: Radix registers the anchor from a passive effect, and Floating UI
  // measures later still.
  useLayoutEffect(() => {
    const previousRequest = previousRequestRef.current;

    // A popup the user is working in keeps the rect it was pinned to.
    if (!hasHeldFocusRef.current) {
      pinnedRectRef.current = null;
    }

    // Opening from Radix's parked position must remain immediate, and held popups must stay pinned.
    if (!previousRequest || !request || hasHeldFocusRef.current) {
      return undefined;
    }

    const wrapper = contentRef.current?.closest<HTMLElement>(POPPER_WRAPPER_SELECTOR);

    if (!wrapper) {
      return undefined;
    }

    let settleTimeout: number | undefined;
    const stopRepositioning = () => {
      wrapper.removeAttribute(REPOSITIONING_ATTRIBUTE);
      wrapper.removeEventListener("transitionend", handleTransitionEnd);
      window.removeEventListener("scroll", stopRepositioning, true);

      if (settleTimeout !== undefined) {
        window.clearTimeout(settleTimeout);
        settleTimeout = undefined;
      }
    };
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target === wrapper && event.propertyName === "transform") {
        stopRepositioning();
      }
    };

    wrapper.setAttribute(REPOSITIONING_ATTRIBUTE, "");
    wrapper.addEventListener("transitionend", handleTransitionEnd);
    // Scrolling must not inherit selection easing while a transition is settling.
    window.addEventListener("scroll", stopRepositioning, true);
    settleTimeout = window.setTimeout(stopRepositioning, REPOSITIONING_SETTLE_MS);

    return stopRepositioning;
  }, [request]);

  // Only for a keyboard request landing on an already open popup. A fresh open cannot be served
  // here, because the content ref fills a microtask after this runs.
  useEffect(() => {
    if (isOpen && source === "keyboard") {
      focusFirstControl(contentRef.current);
    }
  }, [isOpen, source]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // A submenu keeps its keys despite reaching here through its portal: its Escape closes it.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
      return;
    }

    // The focused control's tooltip is the layer Radix offers Escape to first, so leaving this
    // to the popup's own layer would cost a second press. Closing twice asks nothing of a closed
    // popup, and the two cases cannot be told apart: both mark the event as handled.
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (event.key === "Tab") {
      // Tabbing on would land after the portal rather than back in the text.
      event.preventDefault();
      onClose();
      return;
    }

    // Left to Radix: the horizontal arrows to roving focus, ArrowDown to a submenu trigger.
    if (event.defaultPrevented) {
      return;
    }

    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : null;
    const control = document.activeElement;

    if (
      step === null ||
      !(control instanceof HTMLElement) ||
      !event.currentTarget.contains(control)
    )
      return;

    if (focusAdjacentRow(event.currentTarget, control, step)) {
      event.preventDefault();
    }
  };

  if (!request) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={(nextIsOpen) => !nextIsOpen && onClose()}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        align="center"
        asChild
        className="leafdown-context-popup w-auto gap-1 rounded-md p-1"
        data-testid="editor-context-popup"
        hideWhenDetached
        onCloseAutoFocus={(event) => {
          // Radix restores focus to a trigger, and this popup only has an anchor, so its restore
          // is a no-op that leaves focus on the body.
          event.preventDefault();

          if (hasHeldFocusRef.current) {
            releaseHeldFocus();
            onReturnFocus();
          }
        }}
        onFocus={() => {
          hasHeldFocusRef.current = true;
        }}
        onInteractOutside={() => {
          // Radix defers this dismissal past the click, so returning focus would take it back
          // from whatever was just clicked.
          releaseHeldFocus();
        }}
        onOpenAutoFocus={(event) => {
          // Radix would take focus on every open, including the pointer ones that must not.
          event.preventDefault();
          releaseHeldFocus();

          if (source === "keyboard" && event.currentTarget instanceof HTMLElement) {
            focusFirstControl(event.currentTarget);
          }
        }}
        ref={contentRef}
        side="bottom"
        sideOffset={8}
      >
        <Toolbar
          aria-label={CONTEXT_POPUP_LABEL}
          onKeyDown={handleKeyDown}
          // Overrides the popover's role="dialog", which arrives through asChild.
          role="toolbar"
        >
          <ContextCommandRow
            commands={QUICK_ACTION_COMMANDS}
            onExecute={onExecute}
            canExecute={canExecute}
            row={0}
          />
          <ContextCommandRow
            commands={INLINE_ACTION_COMMANDS}
            onExecute={onExecute}
            canExecute={canExecute}
            row={1}
          />
          <ContextCommandRow
            commands={BLOCK_FORMATTING_COMMANDS}
            onExecute={onExecute}
            canExecute={canExecute}
            row={2}
          />
          <ContextCommandSubmenu
            label="Block type"
            commands={BLOCK_TYPE_COMMANDS}
            onExecute={onExecute}
            canExecute={canExecute}
            row={3}
          />
          <ContextCommandSubmenu
            commands={INSERT_COMMANDS}
            label="Insert"
            onExecute={onExecute}
            canExecute={canExecute}
            row={4}
          />
        </Toolbar>
      </PopoverContent>
    </Popover>
  );
}

interface ContextCommandRowProps {
  commands: readonly ContextButtonCommand[];
  onExecute: (commandId: EditorCommandId) => void;
  canExecute: (commandId: EditorCommandId) => boolean;
  row: number;
}

function ContextCommandRow({ commands, onExecute, canExecute, row }: ContextCommandRowProps) {
  return (
    <div className="flex items-center gap-1">
      {commands.map(({ commandId, icon: Icon }, column) => {
        const label = EDITOR_COMMAND_LABELS[commandId];
        const enabled = canExecute(commandId);

        return (
          <Tooltip key={commandId}>
            <ToolbarButton asChild disabled={!enabled} {...toolbarPosition(row, column)}>
              <TooltipTrigger asChild>
                <Button
                  aria-label={label}
                  className="size-8 rounded-sm"
                  disabled={!enabled}
                  onClick={() => onExecute(commandId)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Icon className="size-5" />
                </Button>
              </TooltipTrigger>
            </ToolbarButton>
            <TooltipContent side="right" sideOffset={8}>
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

interface ContextCommandSubmenuProps {
  label: string;
  commands: readonly ContextSubmenuCommand[];
  onExecute: (commandId: EditorCommandId) => void;
  canExecute: (commandId: EditorCommandId) => boolean;
  row: number;
}

function ContextCommandSubmenu({
  label,
  commands,
  onExecute,
  canExecute,
  row,
}: ContextCommandSubmenuProps) {
  return (
    <DropdownMenu>
      <ToolbarButton asChild {...toolbarPosition(row, 0)}>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-8 w-full justify-start gap-2 rounded-sm px-2"
            type="button"
            variant="ghost"
          >
            <span className="min-w-24 flex-1 text-left">{label}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
      </ToolbarButton>
      <DropdownMenuContent align="start" className="w-44" side="right" sideOffset={8}>
        {commands.map(({ commandId, icon: CommandIcon }) => {
          const label = EDITOR_COMMAND_LABELS[commandId];
          const enabled = canExecute(commandId);

          return (
            <DropdownMenuItem
              className={cn(!enabled && "pointer-events-none opacity-50")}
              disabled={!enabled}
              key={commandId}
              onSelect={(event) => {
                event.preventDefault();
                onExecute(commandId);
              }}
            >
              {CommandIcon ? (
                <CommandIcon className="size-4" />
              ) : (
                <PilcrowIcon className="size-4 opacity-0" />
              )}
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
