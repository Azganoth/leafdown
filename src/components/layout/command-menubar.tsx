import { createContext, useContext, useId } from "react";

import {
  COMMAND_DEFINITIONS,
  formatShortcut,
  getCommandLabelId,
  getCommandMenuLabelId,
  type AppCommandId,
  type CommandState,
  type ReopenWithEncodingControl,
} from "@/commands";
import { DROPDOWN_MENU_SCROLL_VIEWPORT_CLASS } from "@/components/ui/dropdown-menu";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { ENCODING_CHOICES, type TextEncodingName } from "@/features/document";
import type { RecentItem } from "@/features/preferences";
import { invariant } from "@/lib/errors";
import { useLocalization, type MessageId } from "@/lib/i18n";

interface CommandMenubarProps {
  commandState: (commandId: AppCommandId) => CommandState;
  fileEncodingLabel?: string | null;
  onExecute: (commandId: AppCommandId) => void;
  onOpenRecentFile: (path: string) => void;
  onOpenRecentFolder: (path: string) => void;
  recentFiles: RecentItem[];
  recentFolders: RecentItem[];
  reopenWithEncoding?: ReopenWithEncodingControl;
}

interface CommandMenuContextValue {
  commandState: (commandId: AppCommandId) => CommandState;
  onExecute: (commandId: AppCommandId) => void;
}

const UNAVAILABLE_REOPEN_WITH_ENCODING: ReopenWithEncodingControl = {
  state: { enabled: false, reason: "No document is open." },
  checkedEncoding: null,
  reopen: () => undefined,
};

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null);

const useCommandMenu = () => {
  const context = useContext(CommandMenuContext);
  invariant(context, "useCommandMenu must be used within a CommandMenuProvider");
  return context;
};

export function CommandMenubar({
  commandState,
  fileEncodingLabel = null,
  onExecute,
  onOpenRecentFile,
  onOpenRecentFolder,
  recentFiles,
  recentFolders,
  reopenWithEncoding = UNAVAILABLE_REOPEN_WITH_ENCODING,
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
            <EncodingSubmenu
              fileEncodingLabel={fileEncodingLabel}
              reopenWithEncoding={reopenWithEncoding}
            />
            <MenubarSeparator />
            <CommandSubmenu
              commandIds={["edit.find", "edit.findNext", "edit.findPrevious", "edit.replace"]}
              labelId="menu.edit.findAndReplace"
            />
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
            <CommandCheckboxItem commandId="view.alwaysOnTop" />
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
            <CommandItems
              commandIds={[
                "help.gettingStarted",
                "help.markdownReference",
                "help.fileAndFolderWorkflows",
                "help.settingsReference",
              ]}
            />
            <MenubarSeparator />
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
  "format.codeBlockLanguage",
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
  const { t } = useLocalization();
  const { commandState, onExecute } = useCommandMenu();
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
  const { t } = useLocalization();
  const { commandState, onExecute } = useCommandMenu();
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
          items={recentFiles}
          labelId="menu.file.recentFiles"
          onOpen={onOpenRecentFile}
        />
        <MenubarSeparator />
        <RecentItems
          emptyLabelId="menu.file.noRecentFolders"
          items={recentFolders}
          labelId="menu.file.recentFolders"
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
  items: RecentItem[];
  labelId: MessageId;
  onOpen: (path: string) => void;
}

function RecentItems({ emptyLabelId, items, labelId, onOpen }: RecentItemsProps) {
  const { t } = useLocalization();
  const groupLabelId = useId();

  return (
    <MenubarGroup aria-labelledby={groupLabelId}>
      <MenubarLabel id={groupLabelId}>{t(labelId)}</MenubarLabel>
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

const ENCODING_COMMAND_IDS = [
  "edit.encoding.file",
  "edit.encoding.utf8",
  "edit.encoding.utf8Bom",
] satisfies readonly AppCommandId[];

interface EncodingSubmenuProps {
  fileEncodingLabel: string | null;
  reopenWithEncoding: ReopenWithEncodingControl;
}

function EncodingSubmenu({ fileEncodingLabel, reopenWithEncoding }: EncodingSubmenuProps) {
  const { t } = useLocalization();
  const { commandState, onExecute } = useCommandMenu();
  const commandIds = ENCODING_COMMAND_IDS.filter(
    (id) => id !== "edit.encoding.file" || commandState(id).enabled,
  );
  const checkedId =
    commandIds.find((id) => {
      const state = commandState(id);
      return state.enabled && state.checked;
    }) ?? "";

  return (
    <MenubarSub>
      <MenubarSubTrigger>{t("menu.edit.encoding")}</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarGroup>
          <MenubarLabel>{t("menu.edit.saveWithEncoding")}</MenubarLabel>
          <MenubarRadioGroup
            value={checkedId}
            onValueChange={(commandId) => onExecute(commandId as AppCommandId)}
          >
            {commandIds.map((commandId) => (
              <CommandRadioItem
                commandId={commandId}
                key={commandId}
                label={
                  commandId === "edit.encoding.file" ? (fileEncodingLabel ?? undefined) : undefined
                }
              />
            ))}
          </MenubarRadioGroup>
        </MenubarGroup>
        <MenubarSeparator />
        <MenubarSub>
          <MenubarSubTrigger disabled={!reopenWithEncoding.state.enabled}>
            {t("menu.edit.reopenWithEncoding")}
          </MenubarSubTrigger>
          <MenubarSubContent className="overflow-hidden">
            <ScrollArea viewportClassName={DROPDOWN_MENU_SCROLL_VIEWPORT_CLASS}>
              <MenubarRadioGroup
                value={reopenWithEncoding.checkedEncoding ?? ""}
                onValueChange={(encoding: TextEncodingName) => reopenWithEncoding.reopen(encoding)}
              >
                {ENCODING_CHOICES.map((choice) => (
                  <MenubarRadioItem key={choice.name} value={choice.name}>
                    {t(choice.labelId)}
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            </ScrollArea>
          </MenubarSubContent>
        </MenubarSub>
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
  label?: string;
}

function CommandRadioItem({ commandId, label }: CommandRadioItemProps) {
  const { t } = useLocalization();
  const { commandState } = useCommandMenu();
  const state = commandState(commandId);

  return (
    <MenubarRadioItem value={commandId} disabled={!state.enabled}>
      {label ?? t(getCommandLabelId(commandId))}
    </MenubarRadioItem>
  );
}
