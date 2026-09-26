import { createContext, useContext, useId } from "react";

import {
  COMMAND_DEFINITIONS,
  formatShortcut,
  getCommandLabelId,
  getCommandMenuLabelId,
  type AppCommandId,
  type CommandState,
} from "@/commands";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
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
} from "@/components/ui/menubar";
import type { RecentItem } from "@/features/preferences";
import { invariant } from "@/lib/errors";
import type { MessageId } from "@/lib/i18n/messages";
import { useLocalization } from "@/lib/i18n/useLocalization";

interface CommandMenubarProps {
  commandState: (commandId: AppCommandId) => CommandState;
  onExecute: (commandId: AppCommandId) => void;
  onOpenRecentFile: (path: string) => void;
  onOpenRecentFolder: (path: string) => void;
  recentFiles: RecentItem[];
  recentFolders: RecentItem[];
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

export function CommandMenubar({
  commandState,
  onExecute,
  onOpenRecentFile,
  onOpenRecentFolder,
  recentFiles,
  recentFolders,
}: CommandMenubarProps) {
  const { t } = useLocalization();

  return (
    <CommandMenuContext.Provider value={{ commandState, onExecute }}>
      <Menubar className="border-0 bg-transparent p-0 text-muted-foreground shadow-none">
        <MenubarMenu>
          <MenubarTrigger className="aria-expanded:text-foreground">
            {t(getCommandMenuLabelId("file"))}
          </MenubarTrigger>
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
            <CommandItems
              commandIds={["file.closeDocument", "file.closeFolder", "file.closeWindow"]}
            />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="aria-expanded:text-foreground">
            {t(getCommandMenuLabelId("edit"))}
          </MenubarTrigger>
          <MenubarContent>
            <CommandItems commandIds={["edit.undo", "edit.redo"]} />
            <MenubarSeparator />
            <CommandItems commandIds={["edit.cut", "edit.copy"]} />
            <CommandSubmenu
              commandIds={[
                "edit.copyAsPlainText",
                "edit.copyAsMarkdown",
                "edit.copyAsHtml",
                "edit.copyAsRichText",
              ]}
              labelId="menu.edit.copyAs"
            />
            <CommandItems commandIds={["edit.paste"]} />
            <CommandSubmenu
              commandIds={["edit.pasteAsPlainText", "edit.pasteAsMarkdown", "edit.pasteAsRichText"]}
              labelId="menu.edit.pasteAs"
            />
            <MenubarSeparator />
            <CommandSubmenu
              commandIds={["edit.delete", "edit.deleteWordBackward", "edit.deleteWordForward"]}
              labelId="menu.edit.delete"
            />
            <CommandSubmenu
              commandIds={["edit.selectAll", "edit.selectWord"]}
              labelId="menu.edit.select"
            />
            <CommandSubmenu
              commandIds={[
                "edit.jumpToTop",
                "edit.jumpToBottom",
                "edit.jumpToSelection",
                "edit.jumpToLineStart",
                "edit.jumpToLineEnd",
                "edit.jumpToFootnoteDefinition",
              ]}
              labelId="menu.edit.jump"
            />
            <CommandItems commandIds={["edit.renameFootnote"]} />
            <CommandItems commandIds={["edit.moveBlockUp", "edit.moveBlockDown"]} />
            <MenubarSeparator />
            <LineEndingSubmenu />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="aria-expanded:text-foreground">
            {t(getCommandMenuLabelId("insert"))}
          </MenubarTrigger>
          <MenubarContent>
            <CommandItems commandIds={["insert.paragraph"]} />
            <HeadingSubmenu prefix="insert" />
            <MenubarSeparator />
            <CommandItems commandIds={INSERT_COMMAND_IDS} />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="aria-expanded:text-foreground">
            {t(getCommandMenuLabelId("format"))}
          </MenubarTrigger>
          <MenubarContent>
            <CommandItems commandIds={INLINE_FORMAT_COMMAND_IDS} />
            <MenubarSeparator />
            <CommandItems commandIds={["format.paragraph"]} />
            <HeadingSubmenu prefix="format" />
            <CommandItems commandIds={["format.increaseHeading", "format.decreaseHeading"]} />
            <MenubarSeparator />
            <CommandItems commandIds={BLOCK_FORMAT_COMMAND_IDS} />
            <CommandSubmenu commandIds={TABLE_COMMAND_IDS} labelId="menu.format.table" />
            <CommandItems commandIds={["format.clearBlock"]} />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="aria-expanded:text-foreground">
            {t(getCommandMenuLabelId("view"))}
          </MenubarTrigger>
          <MenubarContent>
            <CommandCheckboxItem commandId="view.toggleSidebar" />
            <CommandCheckboxItem commandId="view.toggleStatusBar" />
            <MenubarSeparator />
            <CommandItems commandIds={["view.zoomIn", "view.zoomOut", "view.resetZoom"]} inset />
            <CommandCheckboxItem commandId="view.fullscreen" />
            <MenubarSeparator />
            <RadioSubmenu
              commandIds={[
                "view.appearance.system",
                "view.appearance.light",
                "view.appearance.dark",
              ]}
              inset
              labelId="menu.view.appearance"
            />
            <RadioSubmenu
              commandIds={["view.sort.name", "view.sort.modifiedDate", "view.sort.type"]}
              inset
              labelId="menu.view.sortArticlesBy"
            />
            <CommandItems commandIds={["view.collapseAllFolders", "view.expandAllFolders"]} inset />
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="aria-expanded:text-foreground">
            {t(getCommandMenuLabelId("help"))}
          </MenubarTrigger>
          <MenubarContent>
            <CommandItems commandIds={["help.reportIssue", "help.requestFeature"]} />
            <MenubarSeparator />
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
  "insert.footnote",
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
  // Aligns rows to the indicator column of a menu that also holds checkbox or radio items.
  inset?: boolean;
}

const areAllDisabled = (
  commandState: CommandMenuContextValue["commandState"],
  commandIds: readonly AppCommandId[],
) => commandIds.every((commandId) => !commandState(commandId).enabled);

function CommandItems({ commandIds, inset }: CommandItemsProps) {
  return commandIds.map((commandId) => (
    <CommandMenuItem commandId={commandId} inset={inset} key={commandId} />
  ));
}

interface CommandItemProps {
  commandId: AppCommandId;
  inset?: boolean;
}

function CommandMenuItem({ commandId, inset }: CommandItemProps) {
  const { commandState, onExecute } = useCommandMenu();
  const { t } = useLocalization();
  const state = commandState(commandId);
  const command = COMMAND_DEFINITIONS[commandId];
  const primaryShortcut = command.shortcuts?.[0];

  return (
    <MenubarItem disabled={!state.enabled} inset={inset} onClick={() => onExecute(commandId)}>
      {t(getCommandLabelId(commandId))}
      {primaryShortcut && <MenubarShortcut>{formatShortcut(primaryShortcut)}</MenubarShortcut>}
    </MenubarItem>
  );
}

function CommandCheckboxItem({ commandId }: CommandItemProps) {
  const { commandState, onExecute } = useCommandMenu();
  const { t } = useLocalization();
  const state = commandState(commandId);
  const command = COMMAND_DEFINITIONS[commandId];
  const primaryShortcut = command.shortcuts?.[0];

  return (
    <MenubarCheckboxItem
      checked={state.enabled && Boolean(state.checked)}
      disabled={!state.enabled}
      onClick={() => onExecute(commandId)}
    >
      {t(getCommandLabelId(commandId))}
      {primaryShortcut && <MenubarShortcut>{formatShortcut(primaryShortcut)}</MenubarShortcut>}
    </MenubarCheckboxItem>
  );
}

interface RecentItemsSubmenuProps {
  onOpenRecentFile: CommandMenubarProps["onOpenRecentFile"];
  onOpenRecentFolder: CommandMenubarProps["onOpenRecentFolder"];
  recentFiles: RecentItem[];
  recentFolders: RecentItem[];
}

function RecentItemsSubmenu({
  onOpenRecentFile,
  onOpenRecentFolder,
  recentFiles,
  recentFolders,
}: RecentItemsSubmenuProps) {
  const { t } = useLocalization();

  return (
    <MenubarSub>
      <MenubarSubTrigger>{t("menu.file.openRecent")}</MenubarSubTrigger>
      <MenubarSubContent className="min-w-64">
        <RecentItems
          emptyLabelId="menu.file.noRecentFiles"
          labelId="menu.file.recentFiles"
          items={recentFiles}
          onOpen={onOpenRecentFile}
        />
        <MenubarSeparator />
        <RecentItems
          emptyLabelId="menu.file.noRecentFolders"
          labelId="menu.file.recentFolders"
          items={recentFolders}
          onOpen={onOpenRecentFolder}
        />
        <MenubarSeparator />
        <CommandMenuItem commandId="file.clearRecentItems" />
      </MenubarSubContent>
    </MenubarSub>
  );
}

interface RecentItemsProps {
  emptyLabelId: MessageId;
  labelId: MessageId;
  items: RecentItem[];
  onOpen: (path: string) => void;
}

function RecentItems({ emptyLabelId, labelId, items, onOpen }: RecentItemsProps) {
  const { t } = useLocalization();
  const labelElementId = useId();

  return (
    <MenubarGroup aria-labelledby={labelElementId}>
      <MenubarLabel id={labelElementId}>{t(labelId)}</MenubarLabel>
      {items.length === 0 ? (
        <MenubarItem disabled>{t(emptyLabelId)}</MenubarItem>
      ) : (
        items.map(({ path }) => (
          <MenubarItem key={path} onClick={() => onOpen(path)}>
            <span className="max-w-80 truncate">{path}</span>
          </MenubarItem>
        ))
      )}
    </MenubarGroup>
  );
}

interface CommandSubmenuProps extends CommandItemsProps {
  labelId: MessageId;
}

function CommandSubmenu({ commandIds, inset, labelId }: CommandSubmenuProps) {
  const { t } = useLocalization();
  const { commandState } = useCommandMenu();

  return (
    <MenubarSub>
      <MenubarSubTrigger disabled={areAllDisabled(commandState, commandIds)} inset={inset}>
        {t(labelId)}
      </MenubarSubTrigger>
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

  return <CommandSubmenu labelId="menu.heading" commandIds={commandIds} />;
}

const LINE_ENDING_COMMAND_IDS = [
  "edit.lineEnding.crlf",
  "edit.lineEnding.lf",
] satisfies readonly AppCommandId[];

function LineEndingSubmenu() {
  const { t } = useLocalization();
  const { commandState, onExecute } = useCommandMenu();

  const checkedId =
    LINE_ENDING_COMMAND_IDS.find((id) => {
      const state = commandState(id);
      return state.enabled && state.checked;
    }) ?? "";

  return (
    <MenubarSub>
      <MenubarSubTrigger>{t("menu.edit.lineEnding")}</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={checkedId}
          onValueChange={(commandId) => onExecute(commandId as AppCommandId)}
        >
          {LINE_ENDING_COMMAND_IDS.map((commandId) => (
            <CommandRadioItem commandId={commandId} key={commandId} />
          ))}
        </MenubarRadioGroup>
        <MenubarSeparator />
        <CommandCheckboxItem commandId="edit.insertFinalNewline" />
      </MenubarSubContent>
    </MenubarSub>
  );
}

interface RadioSubmenuProps extends CommandItemsProps {
  labelId: MessageId;
}

function RadioSubmenu({ commandIds, inset, labelId }: RadioSubmenuProps) {
  const { t } = useLocalization();
  const { commandState, onExecute } = useCommandMenu();

  const checkedId =
    commandIds.find((id) => {
      const state = commandState(id);
      return state.enabled && state.checked;
    }) ?? "";

  return (
    <MenubarSub>
      <MenubarSubTrigger disabled={areAllDisabled(commandState, commandIds)} inset={inset}>
        {t(labelId)}
      </MenubarSubTrigger>
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
  const { t } = useLocalization();
  const { commandState } = useCommandMenu();
  const state = commandState(commandId);

  return (
    <MenubarRadioItem value={commandId} disabled={!state.enabled}>
      {t(getCommandLabelId(commandId))}
    </MenubarRadioItem>
  );
}
