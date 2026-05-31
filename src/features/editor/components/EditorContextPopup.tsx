import {
  BoldIcon,
  ChevronRightIcon,
  ClipboardPasteIcon,
  Code2Icon,
  CopyIcon,
  Heading1Icon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  PilcrowIcon,
  PlusIcon,
  ScissorsIcon,
  TextQuoteIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react";
import { type ComponentType, type SVGProps, useEffect } from "react";

import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/Popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import { commandDefinitions } from "@/features/commands/commandDefinitions";
import type { AppCommandId, EditorCommandState } from "@/features/commands/types";
import { cn } from "@/lib/cn";

import type { EditorContextPopupAnchor } from "../types";

interface EditorContextPopupProps {
  anchor: EditorContextPopupAnchor | null;
  commandState: EditorCommandState;
  onClose: () => void;
  onExecuteCommand: (commandId: AppCommandId) => void;
  open: boolean;
}

interface ContextButtonCommand {
  commandId: AppCommandId;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const quickActionCommands: ContextButtonCommand[] = [
  { commandId: "edit.cut", icon: ScissorsIcon },
  { commandId: "edit.copy", icon: CopyIcon },
  { commandId: "edit.paste", icon: ClipboardPasteIcon },
  { commandId: "edit.delete", icon: Trash2Icon },
];

const inlineActionCommands: ContextButtonCommand[] = [
  { commandId: "format.strong", icon: BoldIcon },
  { commandId: "format.emphasis", icon: ItalicIcon },
  { commandId: "format.inlineCode", icon: Code2Icon },
  { commandId: "insert.link", icon: Link2Icon },
];

const blockFormattingCommands: ContextButtonCommand[] = [
  { commandId: "format.blockquote", icon: TextQuoteIcon },
  { commandId: "format.orderedList", icon: ListOrderedIcon },
  { commandId: "format.unorderedList", icon: ListIcon },
  { commandId: "format.taskList", icon: ListTodoIcon },
];

const blockTypeCommands: AppCommandId[] = [
  "format.paragraph",
  "format.heading1",
  "format.heading2",
  "format.heading3",
  "format.heading4",
  "format.heading5",
  "format.heading6",
];

const insertCommands: AppCommandId[] = [
  "insert.paragraph",
  "insert.heading1",
  "insert.heading2",
  "insert.heading3",
  "insert.heading4",
  "insert.heading5",
  "insert.heading6",
  "insert.blockquote",
  "insert.orderedList",
  "insert.unorderedList",
  "insert.taskList",
  "insert.codeBlock",
  "insert.table",
  "insert.horizontalRule",
];

const isCommandEnabled = (commandState: EditorCommandState, commandId: AppCommandId) =>
  Boolean(commandState.enabledCommands[commandId]);

export function EditorContextPopup({
  anchor,
  commandState,
  onClose,
  onExecuteCommand,
  open,
}: EditorContextPopupProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeOnScroll = () => onClose();

    document.addEventListener("scroll", closeOnScroll, true);

    return () => {
      document.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [onClose, open]);

  if (!anchor) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-px"
          style={{ left: anchor.x, top: anchor.y }}
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
        <TooltipProvider>
          <ContextCommandRow
            commands={quickActionCommands}
            commandState={commandState}
            onExecuteCommand={onExecuteCommand}
          />
          <ContextCommandRow
            commands={inlineActionCommands}
            commandState={commandState}
            onExecuteCommand={onExecuteCommand}
          />
          <ContextCommandRow
            commands={blockFormattingCommands}
            commandState={commandState}
            onExecuteCommand={onExecuteCommand}
          />
        </TooltipProvider>
        <ContextCommandSubmenu
          commandIds={blockTypeCommands}
          commandState={commandState}
          icon={TypeIcon}
          label="Block type"
          onExecuteCommand={onExecuteCommand}
        />
        <ContextCommandSubmenu
          commandIds={insertCommands}
          commandState={commandState}
          icon={PlusIcon}
          label="Insert"
          onExecuteCommand={onExecuteCommand}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ContextCommandRowProps {
  commands: ContextButtonCommand[];
  commandState: EditorCommandState;
  onExecuteCommand: (commandId: AppCommandId) => void;
}

function ContextCommandRow({ commands, commandState, onExecuteCommand }: ContextCommandRowProps) {
  return (
    <div className="flex items-center gap-1" role="group">
      {commands.map(({ commandId, icon: Icon }) => {
        const command = commandDefinitions[commandId];
        const enabled = isCommandEnabled(commandState, commandId);

        return (
          <Tooltip key={commandId}>
            <TooltipTrigger asChild>
              <Button
                aria-label={command.label}
                className="size-8 rounded-sm"
                disabled={!enabled}
                onClick={() => onExecuteCommand(commandId)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Icon aria-hidden className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {command.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

interface ContextCommandSubmenuProps {
  commandIds: AppCommandId[];
  commandState: EditorCommandState;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onExecuteCommand: (commandId: AppCommandId) => void;
}

function ContextCommandSubmenu({
  commandIds,
  commandState,
  icon: Icon,
  label,
  onExecuteCommand,
}: ContextCommandSubmenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 w-full justify-start gap-2 rounded-sm px-2"
          type="button"
          variant="ghost"
        >
          <Icon aria-hidden className="size-4" />
          <span className="min-w-24 flex-1 text-left">{label}</span>
          <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-44"
        side="right"
        sideOffset={8}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {commandIds.map((commandId) => {
          const command = commandDefinitions[commandId];
          const enabled = isCommandEnabled(commandState, commandId);

          return (
            <DropdownMenuItem
              className={cn(!enabled && "pointer-events-none opacity-50")}
              disabled={!enabled}
              key={commandId}
              onSelect={(event) => {
                event.preventDefault();
                onExecuteCommand(commandId);
              }}
            >
              {commandId === "format.heading1" || commandId === "insert.heading1" ? (
                <Heading1Icon aria-hidden className="size-4" />
              ) : (
                <PilcrowIcon aria-hidden className="size-4 opacity-0" />
              )}
              {command.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
