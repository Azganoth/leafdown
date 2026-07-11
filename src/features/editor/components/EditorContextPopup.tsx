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
import { useEffect } from "react";

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
import type { ContextPopupAnchor } from "../plugins/contextPopup";

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

interface EditorContextPopupProps {
  anchor: ContextPopupAnchor | null;
  commandState: EditorCommandState;
  onClose: () => void;
  onExecute: (commandId: EditorCommandId) => void;
}

export function EditorContextPopup({
  anchor,
  commandState,
  onClose,
  onExecute,
}: EditorContextPopupProps) {
  const isOpen = anchor !== null;
  const canExecute = (commandId: EditorCommandId) => isCommandEnabled(commandId, commandState);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleScroll = () => onClose();

    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose, isOpen]);

  if (!anchor) {
    return null;
  }

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
        onCloseAutoFocus={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
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
