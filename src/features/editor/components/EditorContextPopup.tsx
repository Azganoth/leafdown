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
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

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

const focusFirstControl = (content: HTMLElement | null) => {
  content?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
};

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
  // Sticky for the lifetime of one open popup: it decides whether closing owes the editor its
  // focus back, and it survives focus moving into a submenu, which renders in its own portal.
  const hasHeldFocusRef = useRef(false);
  const canExecute = (commandId: EditorCommandId) => isCommandEnabled(commandId, commandState);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    // Scrolling the popup away from an in-progress keyboard interaction would interrupt focus,
    // which costs more than the popup drifting from the text it anchors to.
    const handleScroll = () => {
      if (!hasHeldFocusRef.current) {
        onClose();
      }
    };

    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose, isOpen]);

  // Covers a keyboard request landing on a popup a pointer already opened, where the content is
  // mounted and Radix has no reason to fire its open-focus event again. The mount case cannot be
  // served here: the content ref is still empty this early, so it runs from that event instead.
  useEffect(() => {
    if (isOpen && source === "keyboard") {
      focusFirstControl(contentRef.current);
    }
  }, [isOpen, source]);

  if (!request) {
    return null;
  }

  const { anchor } = request;

  return (
    <Popover open={isOpen} onOpenChange={(nextIsOpen) => !nextIsOpen && onClose()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed w-px"
          style={{
            left: anchor.x,
            top: anchor.top,
            height: Math.max(1, anchor.bottom - anchor.top),
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="center"
        className="leafdown-context-popup w-auto gap-1 rounded-md p-1"
        data-testid="editor-context-popup"
        onCloseAutoFocus={(event) => {
          // Radix restores focus to a trigger, and this popup anchors instead of triggering, so
          // its restore is a no-op that would leave focus on the body. Return it here instead.
          event.preventDefault();

          if (hasHeldFocusRef.current) {
            hasHeldFocusRef.current = false;
            onReturnFocus();
          }
        }}
        onFocus={() => {
          hasHeldFocusRef.current = true;
        }}
        onOpenAutoFocus={(event) => {
          // Radix would focus the first tab stop on every open. Only a keyboard open should take
          // focus, so the default is always suppressed and the keyboard case focuses explicitly.
          event.preventDefault();
          hasHeldFocusRef.current = false;

          if (source === "keyboard" && event.currentTarget instanceof HTMLElement) {
            focusFirstControl(event.currentTarget);
          }
        }}
        ref={contentRef}
        side="bottom"
        sideOffset={8}
      >
        <ContextCommandRow
          commands={QUICK_ACTION_COMMANDS}
          onExecute={onExecute}
          canExecute={canExecute}
        />
        <ContextCommandRow
          commands={INLINE_ACTION_COMMANDS}
          onExecute={onExecute}
          canExecute={canExecute}
        />
        <ContextCommandRow
          commands={BLOCK_FORMATTING_COMMANDS}
          onExecute={onExecute}
          canExecute={canExecute}
        />
        <ContextCommandSubmenu
          label="Block type"
          commands={BLOCK_TYPE_COMMANDS}
          onExecute={onExecute}
          canExecute={canExecute}
        />
        <ContextCommandSubmenu
          commands={INSERT_COMMANDS}
          label="Insert"
          onExecute={onExecute}
          canExecute={canExecute}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ContextCommandRowProps {
  commands: readonly ContextButtonCommand[];
  onExecute: (commandId: EditorCommandId) => void;
  canExecute: (commandId: EditorCommandId) => boolean;
}

function ContextCommandRow({ commands, onExecute, canExecute }: ContextCommandRowProps) {
  return (
    <div className="flex items-center gap-1" role="group">
      {commands.map(({ commandId, icon: Icon }) => {
        const label = EDITOR_COMMAND_LABELS[commandId];
        const enabled = canExecute(commandId);

        return (
          <Tooltip key={commandId}>
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
}

function ContextCommandSubmenu({
  label,
  commands,
  onExecute,
  canExecute,
}: ContextCommandSubmenuProps) {
  return (
    <DropdownMenu>
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
      <DropdownMenuContent
        align="start"
        className="w-44"
        side="right"
        sideOffset={8}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
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
