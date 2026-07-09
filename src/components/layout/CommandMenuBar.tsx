import { createContext, useContext } from "react";

import {
  COMMAND_DEFINITIONS,
  COMMAND_MENU_LABELS,
  formatShortcut,
  type AppCommandId,
  type CommandState,
} from "@/commands";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/Menubar";
import { invariant } from "@/lib/errors";

interface CommandMenuBarProps {
  commandState: (commandId: AppCommandId) => CommandState;
  onExecute: (commandId: AppCommandId) => void;
  onOpenRecentFile: (path: string) => void;
  onOpenRecentFolder: (path: string) => void;
  recentFiles: string[];
  recentFolders: string[];
}

interface CommandMenuContextValue {
  commandState: (commandId: AppCommandId) => CommandState;
  onExecute: (commandId: AppCommandId) => void;
}

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null);

const useCommandMenu = () => {
  const context = useContext(CommandMenuContext);
  invariant(context, "useCommandMenu must be used within a CommandMenuProvider");
  return context;
};

export function CommandMenuBar({
  commandState,
  onExecute,
  onOpenRecentFile,
  onOpenRecentFolder,
  recentFiles,
  recentFolders,
}: CommandMenuBarProps) {
  return (
    <CommandMenuContext.Provider value={{ commandState, onExecute }}>
      <Menubar className="border-0 bg-transparent p-0">
        <MenubarMenu>
          <MenubarTrigger>{COMMAND_MENU_LABELS.file}</MenubarTrigger>
          <MenubarContent>
            <CommandItems commandIds={["file.new"]} />
            <MenubarSeparator />
            <CommandItems commandIds={["file.open", "file.openFolder"]} />
            <RecentItemsSubmenu
              onOpenRecentFile={onOpenRecentFile}
              onOpenRecentFolder={onOpenRecentFolder}
              recentFiles={recentFiles}
              recentFolders={recentFolders}
            />
            <MenubarSeparator />
            <CommandItems commandIds={["file.save", "file.saveAs"]} />
            <MenubarSeparator />
            <CommandItems commandIds={["file.openLocation", "file.revealInSidebar"]} />
            <MenubarSeparator />
            <CommandItems commandIds={["file.preferences"]} />
            <MenubarSeparator />
            <CommandItems commandIds={["file.closeDocument", "file.closeWindow"]} />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{COMMAND_MENU_LABELS.edit}</MenubarTrigger>
          <MenubarContent>
            <CommandItems commandIds={["edit.undo", "edit.redo"]} />
            <MenubarSeparator />
            <CommandItems commandIds={["edit.cut", "edit.copy"]} />
            <CommandSubmenu
              commandIds={["edit.copyAsPlainText", "edit.copyAsMarkdown"]}
              label="Copy as"
            />
            <CommandItems commandIds={["edit.paste"]} />
            <CommandSubmenu
              commandIds={["edit.pasteAsPlainText", "edit.pasteAsMarkdown", "edit.pasteAsRichText"]}
              label="Paste as"
            />
            <MenubarSeparator />
            <CommandSubmenu
              commandIds={["edit.delete", "edit.deleteWordBackward", "edit.deleteWordForward"]}
              label="Delete"
            />
            <CommandSubmenu commandIds={["edit.selectAll", "edit.selectWord"]} label="Select" />
            <CommandSubmenu
              commandIds={[
                "edit.jumpToTop",
                "edit.jumpToBottom",
                "edit.jumpToSelection",
                "edit.jumpToLineStart",
                "edit.jumpToLineEnd",
              ]}
              label="Jump"
            />
            <MenubarSeparator />
            <LineEndingSubmenu />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{COMMAND_MENU_LABELS.insert}</MenubarTrigger>
          <MenubarContent>
            <CommandItems commandIds={["insert.paragraph"]} />
            <HeadingSubmenu prefix="insert" />
            <MenubarSeparator />
            <CommandItems commandIds={INSERT_COMMAND_IDS} />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{COMMAND_MENU_LABELS.format}</MenubarTrigger>
          <MenubarContent>
            <CommandItems commandIds={INLINE_FORMAT_COMMAND_IDS} />
            <MenubarSeparator />
            <CommandItems commandIds={["format.paragraph"]} />
            <HeadingSubmenu prefix="format" />
            <CommandItems commandIds={["format.increaseHeading", "format.decreaseHeading"]} />
            <MenubarSeparator />
            <CommandItems commandIds={BLOCK_FORMAT_COMMAND_IDS} />
            <CommandSubmenu commandIds={TABLE_COMMAND_IDS} label="Table" />
            <CommandItems commandIds={["format.clearBlock"]} />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{COMMAND_MENU_LABELS.view}</MenubarTrigger>
          <MenubarContent>
            <CommandCheckboxItem commandId="view.toggleSidebar" />
            <MenubarSeparator />
            <CommandItems commandIds={["view.zoomIn", "view.zoomOut", "view.resetZoom"]} />
            <CommandCheckboxItem commandId="view.fullscreen" />
            <MenubarSeparator />
            <RadioSubmenu
              commandIds={[
                "view.appearance.system",
                "view.appearance.light",
                "view.appearance.dark",
              ]}
              label="Appearance"
            />
            <RadioSubmenu
              commandIds={["view.sort.name", "view.sort.modifiedDate", "view.sort.type"]}
              label="Sort articles by"
            />
            <CommandItems commandIds={["view.collapseAllFolders", "view.expandAllFolders"]} />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{COMMAND_MENU_LABELS.help}</MenubarTrigger>
          <MenubarContent>
            <CommandItems commandIds={["help.openDevTools", "help.diagnostics"]} />
            <MenubarSeparator />
            <CommandItems commandIds={["help.about"]} />
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </CommandMenuContext.Provider>
  );
}

const INSERT_HEADING_COMMAND_IDS = [
  "insert.heading1",
  "insert.heading2",
  "insert.heading3",
  "insert.heading4",
  "insert.heading5",
  "insert.heading6",
] satisfies readonly AppCommandId[];

const FORMAT_HEADING_COMMAND_IDS = [
  "format.heading1",
  "format.heading2",
  "format.heading3",
  "format.heading4",
  "format.heading5",
  "format.heading6",
] satisfies readonly AppCommandId[];

const INSERT_COMMAND_IDS = [
  "insert.link",
  "insert.image",
  "insert.orderedList",
  "insert.unorderedList",
  "insert.taskList",
  "insert.blockquote",
  "insert.codeBlock",
  "insert.table",
  "insert.horizontalRule",
] satisfies readonly AppCommandId[];

const INLINE_FORMAT_COMMAND_IDS = [
  "format.strong",
  "format.emphasis",
  "format.strikethrough",
  "format.inlineCode",
  "format.clearInline",
] satisfies readonly AppCommandId[];

const BLOCK_FORMAT_COMMAND_IDS = [
  "format.orderedList",
  "format.unorderedList",
  "format.taskList",
  "format.increaseListIndent",
  "format.decreaseListIndent",
  "format.toggleTaskChecked",
  "format.blockquote",
  "format.codeBlock",
] satisfies readonly AppCommandId[];

const TABLE_COMMAND_IDS = [
  "format.table.delete",
  "format.table.addRowAbove",
  "format.table.addRowBelow",
  "format.table.addColumnBefore",
  "format.table.addColumnAfter",
  "format.table.moveRowUp",
  "format.table.moveRowDown",
  "format.table.moveColumnLeft",
  "format.table.moveColumnRight",
  "format.table.deleteRow",
  "format.table.deleteColumn",
] satisfies readonly AppCommandId[];

interface CommandItemsProps {
  commandIds: readonly AppCommandId[];
}

function CommandItems({ commandIds }: CommandItemsProps) {
  return commandIds.map((commandId) => <CommandMenuItem commandId={commandId} key={commandId} />);
}

interface CommandItemProps {
  commandId: AppCommandId;
}

function CommandMenuItem({ commandId }: CommandItemProps) {
  const { commandState, onExecute } = useCommandMenu();
  const state = commandState(commandId);
  const command = COMMAND_DEFINITIONS[commandId];
  const primaryShortcut = command.shortcuts?.[0];

  return (
    <MenubarItem disabled={!state.enabled} onSelect={() => onExecute(commandId)}>
      {command.label}
      {primaryShortcut && <MenubarShortcut>{formatShortcut(primaryShortcut)}</MenubarShortcut>}
    </MenubarItem>
  );
}

function CommandCheckboxItem({ commandId }: CommandItemProps) {
  const { commandState, onExecute } = useCommandMenu();
  const state = commandState(commandId);
  const command = COMMAND_DEFINITIONS[commandId];
  const primaryShortcut = command.shortcuts?.[0];

  return (
    <MenubarCheckboxItem
      checked={state.enabled && Boolean(state.checked)}
      disabled={!state.enabled}
      onSelect={() => onExecute(commandId)}
    >
      {command.label}
      {primaryShortcut && <MenubarShortcut>{formatShortcut(primaryShortcut)}</MenubarShortcut>}
    </MenubarCheckboxItem>
  );
}

interface RecentItemsSubmenuProps {
  onOpenRecentFile: CommandMenuBarProps["onOpenRecentFile"];
  onOpenRecentFolder: CommandMenuBarProps["onOpenRecentFolder"];
  recentFiles: string[];
  recentFolders: string[];
}

function RecentItemsSubmenu({
  onOpenRecentFile,
  onOpenRecentFolder,
  recentFiles,
  recentFolders,
}: RecentItemsSubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>Open recent</MenubarSubTrigger>
      <MenubarSubContent className="min-w-64">
        <RecentItems label="Recent files" items={recentFiles} onOpen={onOpenRecentFile} />
        <MenubarSeparator />
        <RecentItems label="Recent folders" items={recentFolders} onOpen={onOpenRecentFolder} />
        <MenubarSeparator />
        <CommandMenuItem commandId="file.clearRecentItems" />
      </MenubarSubContent>
    </MenubarSub>
  );
}

interface RecentItemsProps {
  label: string;
  items: string[];
  onOpen: (path: string) => void;
}

function RecentItems({ label, items, onOpen }: RecentItemsProps) {
  return (
    <>
      <MenubarLabel>{label}</MenubarLabel>
      {items.length === 0 ? (
        <MenubarItem disabled>No recent {label.toLowerCase().replace("recent ", "")}.</MenubarItem>
      ) : (
        items.map((path) => (
          <MenubarItem key={path} onSelect={() => onOpen(path)}>
            <span className="max-w-80 truncate">{path}</span>
          </MenubarItem>
        ))
      )}
    </>
  );
}

interface CommandSubmenuProps extends CommandItemsProps {
  label: string;
}

function CommandSubmenu({ commandIds, label }: CommandSubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>{label}</MenubarSubTrigger>
      <MenubarSubContent>
        <CommandItems commandIds={commandIds} />
      </MenubarSubContent>
    </MenubarSub>
  );
}

interface HeadingSubmenuProps {
  prefix: "format" | "insert";
}

function HeadingSubmenu({ prefix }: HeadingSubmenuProps) {
  const commandIds = prefix === "format" ? FORMAT_HEADING_COMMAND_IDS : INSERT_HEADING_COMMAND_IDS;

  return <CommandSubmenu label="Heading" commandIds={commandIds} />;
}

const LINE_ENDING_COMMAND_IDS = [
  "edit.lineEnding.crlf",
  "edit.lineEnding.lf",
] satisfies readonly AppCommandId[];

function LineEndingSubmenu() {
  const { commandState, onExecute } = useCommandMenu();

  const checkedId =
    LINE_ENDING_COMMAND_IDS.find((id) => {
      const state = commandState(id);
      return state.enabled && state.checked;
    }) ?? "";

  return (
    <MenubarSub>
      <MenubarSubTrigger>Line ending</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={checkedId}
          onValueChange={(commandId) => onExecute(commandId as AppCommandId)}
        >
          {LINE_ENDING_COMMAND_IDS.map((commandId) => (
            <CommandRadioItem commandId={commandId} key={commandId} />
          ))}
        </MenubarRadioGroup>
        <CommandCheckboxItem commandId="edit.insertFinalNewline" />
      </MenubarSubContent>
    </MenubarSub>
  );
}

interface RadioSubmenuProps extends CommandItemsProps {
  label: string;
}

function RadioSubmenu({ commandIds, label }: RadioSubmenuProps) {
  const { commandState, onExecute } = useCommandMenu();

  const checkedId =
    commandIds.find((id) => {
      const state = commandState(id);
      return state.enabled && state.checked;
    }) ?? "";

  return (
    <MenubarSub>
      <MenubarSubTrigger>{label}</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={checkedId}
          onValueChange={(commandId) => onExecute(commandId as AppCommandId)}
        >
          {commandIds.map((commandId) => (
            <CommandRadioItem commandId={commandId} key={commandId} />
          ))}
        </MenubarRadioGroup>
      </MenubarSubContent>
    </MenubarSub>
  );
}

interface CommandRadioItemProps {
  commandId: AppCommandId;
}

function CommandRadioItem({ commandId }: CommandRadioItemProps) {
  const { commandState } = useCommandMenu();
  const state = commandState(commandId);

  return (
    <MenubarRadioItem value={commandId} disabled={!state.enabled}>
      {COMMAND_DEFINITIONS[commandId].label}
    </MenubarRadioItem>
  );
}
