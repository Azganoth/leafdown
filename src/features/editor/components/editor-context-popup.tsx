import {
  ArrowDownIcon,
  ArrowDownFromLineIcon,
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  ArrowLeftFromLineIcon,
  ArrowRightIcon,
  ArrowRightFromLineIcon,
  ArrowUpIcon,
  ArrowUpFromLineIcon,
  BoldIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardCopyIcon,
  ClipboardPasteIcon,
  Code2Icon,
  CopyIcon,
  CornerDownRightIcon,
  FileCodeIcon,
  FolderOpenIcon,
  Columns3Icon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  ImageIcon,
  ItalicIcon,
  Link2Icon,
  LightbulbIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  PencilLineIcon,
  PilcrowIcon,
  PlusIcon,
  ScissorsIcon,
  Rows3Icon,
  Table2Icon,
  TextAlignCenterIcon,
  TextAlignEndIcon,
  TextAlignStartIcon,
  TextQuoteIcon,
  Trash2Icon,
  UnfoldVerticalIcon,
  UnlinkIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Toolbar, ToolbarButton } from "@/components/ui/toolbar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocalization, type MessageId } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type { EditorCommandId, EditorCommandState } from "../commands";
import type { CalloutTypeChoice, CalloutTypeChoices } from "../commands/formatting/callouts";
import { getEditorCommandLabelId } from "../commands/metadata";
import type { ContextPopupRequest, ContextPopupTable } from "../plugins/contextPopup";
import { isDismissedFromOutside } from "../utils/popoverDismissal";
import type { TableAxis } from "../utils/tables";
import { CalloutTypeIcon } from "./callout-type-icon";
import { EditorInsertMenuItems, INSERT_MENU_COMMAND_IDS } from "./editor-insert-menu";

interface ContextButtonCommand {
  commandId: EditorCommandId;
  icon: LucideIcon;
  destructive?: boolean;
  labelId?: MessageId;
  // Runs in place of the command while it is checked, so the button toggles.
  uncheckCommandId?: EditorCommandId;
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

const CARET_QUICK_ACTION_COMMANDS = [
  { commandId: "edit.paste", icon: ClipboardPasteIcon },
] satisfies readonly ContextButtonCommand[];

const BLOCK_MOVEMENT_COMMANDS = [
  { commandId: "edit.moveBlockUp", icon: ArrowUpIcon },
  { commandId: "edit.moveBlockDown", icon: ArrowDownIcon },
] satisfies readonly ContextButtonCommand[];

const INLINE_ACTION_COMMANDS = [
  { commandId: "format.strong", icon: BoldIcon },
  { commandId: "format.emphasis", icon: ItalicIcon },
  { commandId: "format.inlineCode", icon: Code2Icon },
  { commandId: "insert.link", icon: Link2Icon },
] satisfies readonly ContextButtonCommand[];

const FOOTNOTE_COMMANDS = [
  { commandId: "edit.renameFootnote", icon: PencilLineIcon },
  { commandId: "edit.jumpToFootnoteDefinition", icon: ArrowDownToLineIcon },
] satisfies readonly ContextButtonCommand[];

const IMAGE_COMMANDS = [
  { commandId: "edit.replaceImage", icon: ImageIcon },
] satisfies readonly ContextButtonCommand[];

const LINK_COMMANDS = [
  { commandId: "edit.copyLinkDestination", icon: ClipboardCopyIcon },
  { commandId: "edit.removeLink", icon: UnlinkIcon },
  { commandId: "edit.chooseLinkFile", icon: FolderOpenIcon },
] satisfies readonly ContextButtonCommand[];

const CODE_BLOCK_COMMANDS = [
  { commandId: "format.codeBlockLanguage", icon: FileCodeIcon },
] satisfies readonly ContextButtonCommand[];

const CALLOUT_COMMANDS = [
  { commandId: "format.calloutExpanded", icon: UnfoldVerticalIcon },
] satisfies readonly ContextButtonCommand[];

const TABLE_ROW_COMMANDS = [
  { commandId: "format.table.addRowAbove", icon: ArrowUpFromLineIcon },
  { commandId: "format.table.addRowBelow", icon: ArrowDownFromLineIcon },
  { commandId: "format.table.moveRowUp", icon: ArrowUpIcon },
  { commandId: "format.table.moveRowDown", icon: ArrowDownIcon },
  { commandId: "format.table.deleteRow", icon: Trash2Icon, destructive: true },
] satisfies readonly ContextButtonCommand[];

const TABLE_COLUMN_COMMANDS = [
  { commandId: "format.table.addColumnBefore", icon: ArrowLeftFromLineIcon },
  { commandId: "format.table.addColumnAfter", icon: ArrowRightFromLineIcon },
  { commandId: "format.table.moveColumnLeft", icon: ArrowLeftIcon },
  { commandId: "format.table.moveColumnRight", icon: ArrowRightIcon },
] satisfies readonly ContextButtonCommand[];

const TABLE_COLUMN_ALIGNMENT_COMMANDS = [
  {
    commandId: "format.table.columnAlignment.left",
    icon: TextAlignStartIcon,
    labelId: "editor.contextPopup.table.alignLeft",
    uncheckCommandId: "format.table.columnAlignment.default",
  },
  {
    commandId: "format.table.columnAlignment.center",
    icon: TextAlignCenterIcon,
    labelId: "editor.contextPopup.table.alignCenter",
    uncheckCommandId: "format.table.columnAlignment.default",
  },
  {
    commandId: "format.table.columnAlignment.right",
    icon: TextAlignEndIcon,
    labelId: "editor.contextPopup.table.alignRight",
    uncheckCommandId: "format.table.columnAlignment.default",
  },
] satisfies readonly ContextButtonCommand[];

const TABLE_COLUMN_DELETE_COMMANDS = [
  { commandId: "format.table.deleteColumn", icon: Trash2Icon, destructive: true },
] satisfies readonly ContextButtonCommand[];

const TABLE_ACTION_GROUPS: Record<TableAxis, readonly (readonly ContextButtonCommand[])[]> = {
  row: [TABLE_ROW_COMMANDS],
  column: [TABLE_COLUMN_COMMANDS, TABLE_COLUMN_ALIGNMENT_COMMANDS, TABLE_COLUMN_DELETE_COMMANDS],
};

const TABLE_COMMANDS = [
  { commandId: "format.table.delete", icon: Table2Icon, destructive: true },
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

const OBJECT_COMMAND_ROWS = [
  { id: "footnote", commands: FOOTNOTE_COMMANDS },
  { id: "image", commands: IMAGE_COMMANDS },
  { id: "link", commands: LINK_COMMANDS, stacked: true },
  { id: "codeBlock", commands: CODE_BLOCK_COMMANDS },
  { id: "callout", commands: CALLOUT_COMMANDS },
] as const;

const FITTED_COMMAND_LABELS: Partial<Record<EditorCommandId, MessageId>> = {
  "edit.renameFootnote": "editor.contextPopup.renameFootnote",
  "edit.jumpToFootnoteDefinition": "editor.contextPopup.goToFootnote",
  "format.codeBlockLanguage": "editor.contextPopup.codeBlockLanguage",
  "format.calloutExpanded": "editor.contextPopup.calloutExpanded",
};

type ContextRow =
  | {
      id: string;
      kind: "buttons";
      commands: readonly ContextButtonCommand[];
      /** Continues the group the previous row began, with no separator between them. */
      joinsPrevious?: boolean;
    }
  | { id: string; kind: "submenu"; commands: readonly ContextSubmenuCommand[]; labelId: MessageId }
  | { id: string; kind: "calloutTypes" | "insert" }
  | { id: string; kind: "tableScope" | "tableActions" };

const buttonRow = (id: string, commands: readonly ContextButtonCommand[]): ContextRow => ({
  commands,
  id,
  kind: "buttons",
});

const BLOCK_TYPE_ROW: ContextRow = {
  commands: BLOCK_TYPE_COMMANDS,
  id: "blockType",
  kind: "submenu",
  labelId: "editor.contextPopup.blockType",
};

const CALLOUT_TYPE_ROW: ContextRow = { id: "calloutType", kind: "calloutTypes" };

const INSERT_ROW: ContextRow = { id: "insert", kind: "insert" };

const getContextRows = (
  { container, selectionKind }: ContextPopupRequest,
  canExecute: (commandId: EditorCommandId) => boolean,
): ContextRow[] => {
  const rows = [
    buttonRow(
      "quickActions",
      selectionKind === "caret" ? CARET_QUICK_ACTION_COMMANDS : QUICK_ACTION_COMMANDS,
    ),
  ];

  // Unlike the other rows, an object's row leaves out what is unavailable, which is what keeps it
  // out of every context its object is not in.
  for (const row of OBJECT_COMMAND_ROWS) {
    const available = row.commands.filter(({ commandId }) => canExecute(commandId));

    // A row of its own for each keeps every label whole and each action one arrow key apart. A
    // table's popup labels no buttons, so there they share one row like any other object's.
    if ("stacked" in row && container !== "table") {
      rows.push(
        ...available.map((command, index): ContextRow => ({
          commands: [command],
          id: `${row.id}.${command.commandId}`,
          joinsPrevious: index > 0,
          kind: "buttons",
        })),
      );
    } else if (available.length > 0) {
      rows.push(buttonRow(row.id, available));
    }
  }

  if (selectionKind === "block") {
    rows.push(
      ...BLOCK_MOVEMENT_COMMANDS.map((command, index): ContextRow => ({
        kind: "buttons",
        id: command.commandId,
        commands: [command],
        joinsPrevious: index > 0,
      })),
    );
  }

  // Code holds no marks.
  if (selectionKind === "text" && container !== "code") {
    rows.push(buttonRow("inlineActions", INLINE_ACTION_COMMANDS));
  }

  if (container === "table") {
    rows.push(
      { id: "tableScope", kind: "tableScope" },
      { id: "tableActions", kind: "tableActions" },
    );
  }

  if (canExecute("format.calloutType")) {
    rows.push(CALLOUT_TYPE_ROW);
  }

  if (container !== "table") {
    rows.push(BLOCK_TYPE_ROW);
    if (selectionKind !== "text") {
      rows.push({
        id: "blockFormatting",
        kind: "submenu",
        commands: BLOCK_FORMATTING_COMMANDS,
        labelId: "editor.contextPopup.listsAndQuote",
      });
    }
  }

  if (selectionKind !== "text") {
    rows.push(INSERT_ROW);
  }

  return rows;
};

const isCommandEnabled = (commandId: EditorCommandId, commandState: EditorCommandState) =>
  commandState.status === "ready" && commandState.enabledCommands[commandId];

const POSITIONER_SELECTOR = "[data-slot='popover-positioner']";
const REPOSITIONING_ATTRIBUTE = "data-leafdown-context-popup-repositioning";
const REPOSITIONING_SETTLE_MS = 150;

// The toolbar's roving focus only walks controls in document order, so vertical movement across
// the wrapped rows is worked out from these.
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

// Base UI's `VirtualElement`, plus the element Floating UI resolves scroll ancestors and
// clipping through for a virtual reference.
interface VirtualAnchor {
  contextElement: Element | undefined;
  getBoundingClientRect: () => DOMRect;
}

interface EditorContextPopupProps {
  commandState: EditorCommandState;
  onChooseCalloutType?: (choice: CalloutTypeChoice, token: string) => void;
  onClose: () => void;
  onExecute: (commandId: EditorCommandId) => void;
  onReturnFocus: () => void;
  readCalloutTypes?: (choice: CalloutTypeChoice) => CalloutTypeChoices | null;
  request: ContextPopupRequest | null;
}

const readNoCalloutTypes = () => null;
const ignoreCalloutType = () => undefined;

export function EditorContextPopup({
  commandState,
  onChooseCalloutType = ignoreCalloutType,
  onClose,
  onExecute,
  onReturnFocus,
  readCalloutTypes = readNoCalloutTypes,
  request,
}: EditorContextPopupProps) {
  const { t } = useLocalization();
  const isOpen = request !== null;
  const source = request?.source;
  const contentRef = useRef<HTMLDivElement>(null);
  const [tableChoice, setTableChoice] = useState<{
    request: ContextPopupRequest;
    axis: TableAxis;
  } | null>(null);
  const tableAxis =
    tableChoice && tableChoice.request === request
      ? tableChoice.axis
      : (request?.table?.axis ?? "row");
  // Sticky for one open popup, so that focus moving into a portalled submenu does not clear it.
  const hasHeldFocusRef = useRef(false);
  const pinnedRectRef = useRef<DOMRect | null>(null);
  const previousRequestRef = useRef<ContextPopupRequest | null>(null);
  // The positioner registers the anchor once per object identity and Floating UI measures only
  // when it does, so scroll and resize aside, a fresh identity is the one thing that moves the
  // popup onto a selection that has changed. Held against the render rather than created during
  // one, or every unrelated render would re-register it.
  const virtualAnchor = useMemo<VirtualAnchor>(
    () => ({
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
    }),
    [request],
  );
  const canExecute = (commandId: EditorCommandId) => isCommandEnabled(commandId, commandState);
  const isChecked = (commandId: EditorCommandId) => commandState.checkedCommands[commandId];
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

  // Layout is early enough: the anchor is registered from a passive effect, and Floating UI
  // measures later still.
  useLayoutEffect(() => {
    const previousRequest = previousRequestRef.current;

    // A popup the user is working in keeps the rect it was pinned to.
    if (!hasHeldFocusRef.current) {
      pinnedRectRef.current = null;
    }

    // Opening from the parked position must remain immediate, and held popups must stay pinned.
    if (!previousRequest || !request || hasHeldFocusRef.current) {
      return undefined;
    }

    const wrapper = contentRef.current?.closest<HTMLElement>(POSITIONER_SELECTOR);

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

    // The focused control's tooltip is the layer offered Escape first, so leaving this to the
    // popup's own layer would cost a second press. Closing twice asks nothing of a closed popup,
    // and the two cases cannot be told apart: both mark the event as handled.
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

    // Left to the toolbar: the horizontal arrows to roving focus.
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

    // This runs during capture, so a submenu trigger has not had its chance at ArrowDown yet.
    if (step === 1 && control.getAttribute("aria-haspopup") === "menu") {
      return;
    }

    if (focusAdjacentRow(event.currentTarget, control, step)) {
      event.preventDefault();
      // Stops the control we are leaving from acting on the same key, which for a submenu
      // trigger would mean opening its menu.
      event.stopPropagation();
    }
  };

  if (!request) {
    return null;
  }

  const fitted = request.container !== "table";
  const rows = getContextRows(request, canExecute);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextIsOpen, details) => {
        if (nextIsOpen) {
          return;
        }

        if (isDismissedFromOutside(details)) {
          releaseHeldFocus();
        }

        onClose();
      }}
    >
      <PopoverContent
        align="center"
        anchor={virtualAnchor}
        className={cn(
          "leafdown-context-popup",
          fitted
            ? request.selectionKind === "text"
              ? "w-42 gap-0"
              : "w-56 gap-0"
            : "w-auto gap-1",
        )}
        data-testid="editor-context-popup"
        finalFocus={() => {
          if (hasHeldFocusRef.current) {
            releaseHeldFocus();
            onReturnFocus();
          }

          return false;
        }}
        initialFocus={() => {
          releaseHeldFocus();

          if (source !== "keyboard") {
            return false;
          }

          return contentRef.current?.querySelector<HTMLElement>(ENABLED_CONTROL_SELECTOR) ?? false;
        }}
        aria-label={t("editor.contextPopup.label")}
        onFocus={() => {
          hasHeldFocusRef.current = true;
        }}
        onKeyDownCapture={handleKeyDown}
        ref={contentRef}
        render={<Toolbar />}
        role="toolbar"
        side="bottom"
        sideOffset={8}
      >
        {rows.map((contextRow, row) => (
          <Fragment key={contextRow.id}>
            {fitted &&
              row > 0 &&
              !(contextRow.kind === "buttons" && contextRow.joinsPrevious) &&
              (contextRow.kind === "buttons" || rows[row - 1]?.kind === "buttons") && (
                <Separator className="my-1" />
              )}
            {contextRow.kind === "tableScope" && (
              <ContextTableScope
                axis={tableAxis}
                table={request.table}
                onSelectAxis={(axis) => {
                  setTableChoice({ request, axis });
                  request.table?.selectAxis(axis);
                }}
                onExecute={onExecute}
                canExecute={canExecute}
                isChecked={isChecked}
                row={row}
              />
            )}
            {contextRow.kind === "tableActions" && (
              <div className="flex flex-col gap-1">
                <Separator />
                <div className="flex items-center justify-between gap-1">
                  {TABLE_ACTION_GROUPS[tableAxis].map((commands, group, groups) => (
                    <Fragment key={commands[0]?.commandId}>
                      {group > 0 && (
                        <Separator
                          orientation="vertical"
                          className="h-5 data-vertical:self-center"
                        />
                      )}
                      <ContextCommandRow
                        commands={commands}
                        fitted={false}
                        onExecute={onExecute}
                        canExecute={canExecute}
                        isChecked={isChecked}
                        row={row}
                        columnOffset={groups
                          .slice(0, group)
                          .reduce((offset, previous) => offset + previous.length, 0)}
                        spread={groups.length === 1}
                      />
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
            {contextRow.kind === "buttons" && (
              <ContextCommandRow
                commands={contextRow.commands}
                fitted={fitted}
                onExecute={onExecute}
                canExecute={canExecute}
                isChecked={isChecked}
                row={row}
              />
            )}
            {contextRow.kind === "submenu" && (
              <ContextCommandSubmenu
                commands={contextRow.commands}
                fitted={fitted}
                labelId={contextRow.labelId}
                onExecute={onExecute}
                canExecute={canExecute}
                row={row}
              />
            )}
            {contextRow.kind === "insert" && (
              <ContextSubmenu
                icon={fitted ? PlusIcon : undefined}
                label={t("editor.contextPopup.insert")}
                row={row}
              >
                <EditorInsertMenuItems
                  canInsert={(kind) => canExecute(INSERT_MENU_COMMAND_IDS[kind])}
                  onChooseCalloutType={onChooseCalloutType}
                  onInsert={(kind) => onExecute(INSERT_MENU_COMMAND_IDS[kind])}
                  readCalloutTypes={() => readCalloutTypes("insert")}
                />
              </ContextSubmenu>
            )}
            {contextRow.kind === "calloutTypes" && (
              <ContextCalloutTypeSubmenu
                fitted={fitted}
                onChooseCalloutType={onChooseCalloutType}
                readCalloutTypes={readCalloutTypes}
                row={row}
              />
            )}
          </Fragment>
        ))}
      </PopoverContent>
    </Popover>
  );
}

interface ContextCommandRowProps {
  commands: readonly ContextButtonCommand[];
  fitted: boolean;
  onExecute: (commandId: EditorCommandId) => void;
  canExecute: (commandId: EditorCommandId) => boolean;
  isChecked: (commandId: EditorCommandId) => boolean | undefined;
  row: number;
  columnOffset?: number;
  spread?: boolean;
}

function ContextCommandRow({
  commands,
  fitted,
  onExecute,
  canExecute,
  isChecked,
  row,
  columnOffset = 0,
  spread = false,
}: ContextCommandRowProps) {
  const { t } = useLocalization();
  const showLabels = fitted && commands.length < 4;

  return (
    <div
      className={cn(
        fitted ? "grid auto-cols-fr grid-flow-col items-center gap-0.5" : "flex items-center gap-1",
        spread && "flex-1 justify-between",
      )}
    >
      {commands.map(({ commandId, icon: Icon, destructive, labelId, uncheckCommandId }, column) => {
        const label = t(labelId ?? getEditorCommandLabelId(commandId));
        const enabled = canExecute(commandId);
        const checked = isChecked(commandId);
        const shortLabelId = showLabels ? FITTED_COMMAND_LABELS[commandId] : undefined;
        const showTooltip = !showLabels || shortLabelId !== undefined;
        const CommandIcon =
          fitted && commandId === "edit.jumpToFootnoteDefinition" ? CornerDownRightIcon : Icon;
        const button = (
          <Button
            aria-label={label}
            aria-pressed={checked}
            className={cn(
              "rounded-sm",
              fitted
                ? "h-auto min-h-8 w-full gap-1.5 px-1.5 py-1 whitespace-normal aria-pressed:bg-primary/10 aria-pressed:text-primary"
                : "size-8 aria-pressed:bg-muted",
              showLabels && commands.length === 1 && "justify-start",
              showLabels && commands.length === 2 && "gap-1 px-1",
            )}
            disabled={!enabled}
            onClick={() => onExecute(checked && uncheckCommandId ? uncheckCommandId : commandId)}
            size={fitted ? "sm" : "icon"}
            type="button"
            variant="ghost"
          />
        );
        const control = (
          <ToolbarButton
            disabled={!enabled}
            render={showTooltip ? <TooltipTrigger render={button} /> : button}
            {...toolbarPosition(row, column + columnOffset)}
          >
            <CommandIcon
              className={cn(
                !fitted && !commandId.startsWith("format.table.") && "size-5",
                (destructive || (fitted && commandId === "edit.delete")) && "text-destructive",
              )}
            />
            {showLabels && (
              <span className="min-w-0 text-sm wrap-anywhere">
                {shortLabelId ? t(shortLabelId) : label}
              </span>
            )}
            {fitted &&
              commandId === "format.calloutExpanded" &&
              (checked ? (
                <CheckIcon className="ml-auto" />
              ) : (
                <MinusIcon className="ml-auto text-muted-foreground" />
              ))}
          </ToolbarButton>
        );

        return showTooltip ? (
          <Tooltip key={commandId}>
            {control}
            <TooltipContent side="right" sideOffset={8}>
              {label}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Fragment key={commandId}>{control}</Fragment>
        );
      })}
    </div>
  );
}

interface ContextTableScopeProps {
  axis: TableAxis;
  table: ContextPopupTable | undefined;
  onSelectAxis: (axis: TableAxis) => void;
  onExecute: ContextCommandRowProps["onExecute"];
  canExecute: ContextCommandRowProps["canExecute"];
  isChecked: ContextCommandRowProps["isChecked"];
  row: number;
}

function ContextTableScope({
  axis,
  table,
  onSelectAxis,
  onExecute,
  canExecute,
  isChecked,
  row,
}: ContextTableScopeProps) {
  const { t } = useLocalization();
  const rows = table?.row ?? { from: 1, to: 2 };
  const columns = table?.column ?? { from: 0, to: 1 };
  const rowLabel =
    rows.from === 0
      ? rows.to === 1
        ? t("editor.contextPopup.table.header")
        : t("editor.contextPopup.table.headerRows", { row: rows.to - 1 })
      : rows.to - rows.from === 1
        ? t("editor.contextPopup.table.row", { row: rows.from })
        : t("editor.contextPopup.table.rows", { from: rows.from, to: rows.to - 1 });
  const columnLabel =
    columns.to - columns.from === 1
      ? t("editor.contextPopup.table.column", { column: columns.from + 1 })
      : t("editor.contextPopup.table.columns", { from: columns.from + 1, to: columns.to });
  const choices = [
    { axis: "row", icon: Rows3Icon, label: rowLabel },
    { axis: "column", icon: Columns3Icon, label: columnLabel },
  ] as const;

  return (
    <div className="flex min-w-74 items-center gap-2">
      {choices.map(({ axis: choice, icon: Icon, label }, column) => (
        <Tooltip key={choice}>
          <ToolbarButton
            render={
              <TooltipTrigger
                whenCutShort
                render={
                  <Button
                    aria-pressed={axis === choice}
                    className="min-w-0 flex-1 rounded-sm aria-pressed:bg-muted"
                    onClick={() => onSelectAxis(choice)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  />
                }
              />
            }
            {...toolbarPosition(row, column)}
          >
            <Icon data-icon="inline-start" />
            <span className="truncate">{label}</span>
          </ToolbarButton>
          <TooltipContent side="bottom" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
      <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
      <ContextCommandRow
        commands={TABLE_COMMANDS}
        fitted={false}
        onExecute={onExecute}
        canExecute={canExecute}
        isChecked={isChecked}
        row={row}
        columnOffset={2}
      />
    </div>
  );
}

interface ContextSubmenuProps {
  children: ReactNode;
  icon?: LucideIcon;
  label: string;
  row: number;
}

function ContextSubmenu({ children, icon: Icon, label, row }: ContextSubmenuProps) {
  return (
    <DropdownMenu>
      <ToolbarButton
        render={
          <DropdownMenuTrigger
            render={
              <Button
                className={cn(
                  "w-full justify-start gap-2 rounded-sm px-2",
                  Icon ? "h-auto min-h-8 whitespace-normal" : "h-8",
                )}
                type="button"
                variant="ghost"
              />
            }
          />
        }
        {...toolbarPosition(row, 0)}
      >
        {Icon && <Icon data-icon="inline-start" />}
        <span
          className={cn("flex-1 text-left", Icon ? "min-w-0 text-sm wrap-anywhere" : "min-w-24")}
        >
          {label}
        </span>
        <ChevronRightIcon className="text-muted-foreground" />
      </ToolbarButton>
      <DropdownMenuContent align="start" className="w-56" side="right" sideOffset={8}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface CalloutTypeChoiceProps {
  onChooseCalloutType: (choice: CalloutTypeChoice, token: string) => void;
  readCalloutTypes: (choice: CalloutTypeChoice) => CalloutTypeChoices | null;
}

interface ContextCommandSubmenuProps {
  fitted: boolean;
  labelId: MessageId;
  commands: readonly ContextSubmenuCommand[];
  onExecute: (commandId: EditorCommandId) => void;
  canExecute: (commandId: EditorCommandId) => boolean;
  row: number;
}

function ContextCommandSubmenu({
  fitted,
  labelId,
  commands,
  onExecute,
  canExecute,
  row,
}: ContextCommandSubmenuProps) {
  const { t } = useLocalization();
  const label = t(labelId);

  return (
    <ContextSubmenu
      icon={
        fitted
          ? labelId === "editor.contextPopup.listsAndQuote"
            ? ListIcon
            : PilcrowIcon
          : undefined
      }
      label={label}
      row={row}
    >
      <DropdownMenuGroup aria-label={label}>
        {commands.map(({ commandId, icon: CommandIcon }) => (
          <DropdownMenuItem
            closeOnClick={false}
            disabled={!canExecute(commandId)}
            inset={!CommandIcon}
            key={commandId}
            onClick={() => onExecute(commandId)}
          >
            {CommandIcon && <CommandIcon />}
            {t(getEditorCommandLabelId(commandId))}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </ContextSubmenu>
  );
}

interface ContextCalloutTypeSubmenuProps extends CalloutTypeChoiceProps {
  fitted: boolean;
  row: number;
}

function ContextCalloutTypeSubmenu({
  fitted,
  onChooseCalloutType,
  readCalloutTypes,
  row,
}: ContextCalloutTypeSubmenuProps) {
  const { t } = useLocalization();
  const label = t("editor.contextPopup.calloutType");

  return (
    <ContextSubmenu icon={fitted ? LightbulbIcon : undefined} label={label} row={row}>
      <ChangeCalloutTypeItems
        label={label}
        onChooseCalloutType={onChooseCalloutType}
        readCalloutTypes={readCalloutTypes}
      />
    </ContextSubmenu>
  );
}

interface ChangeCalloutTypeItemsProps extends CalloutTypeChoiceProps {
  label: string;
}

function ChangeCalloutTypeItems({
  label,
  onChooseCalloutType,
  readCalloutTypes,
}: ChangeCalloutTypeItemsProps) {
  const choices = readCalloutTypes("change");

  if (!choices) {
    return null;
  }

  return (
    <DropdownMenuRadioGroup aria-label={label} value={choices.current}>
      {choices.options.map(({ label: typeLabel, token }) => (
        <DropdownMenuRadioItem
          closeOnClick={false}
          key={token}
          onClick={() => onChooseCalloutType("change", token)}
          value={token}
        >
          <CalloutTypeIcon token={token} />
          {typeLabel}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
