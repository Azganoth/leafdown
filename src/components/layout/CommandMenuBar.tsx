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
import {
  commandDefinitions,
  commandMenuLabels,
  formatShortcut,
  getCommandShortcuts,
  type AppCommandId,
  type ResolvedCommandState,
} from "@/commands";

interface CommandMenuBarProps {
  commandState: (commandId: AppCommandId) => ResolvedCommandState;
  onExecute: (commandId: AppCommandId) => void;
  onOpenRecentFile: (path: string) => void;
  onOpenRecentFolder: (path: string) => void;
  recentFiles: string[];
  recentFolders: string[];
}

export function CommandMenuBar({
  commandState,
  onExecute,
  onOpenRecentFile,
  onOpenRecentFolder,
  recentFiles,
  recentFolders,
}: CommandMenuBarProps) {
  return (
    <Menubar className="border-0 bg-transparent p-0">
      <MenubarMenu>
        <MenubarTrigger>{commandMenuLabels.file}</MenubarTrigger>
        <MenubarContent>
          <CommandItems commandIds={["file.new"]} {...{ commandState, onExecute }} />
          <MenubarSeparator />
          <CommandItems
            commandIds={["file.open", "file.openFolder"]}
            {...{ commandState, onExecute }}
          />
          <RecentItemsSubmenu
            {...{
              commandState,
              onExecute,
              onOpenRecentFile,
              onOpenRecentFolder,
              recentFiles,
              recentFolders,
            }}
          />
          <MenubarSeparator />
          <CommandItems
            commandIds={["file.save", "file.saveAs"]}
            {...{ commandState, onExecute }}
          />
          <MenubarSeparator />
          <CommandItems
            commandIds={["file.openLocation", "file.revealInSidebar"]}
            {...{ commandState, onExecute }}
          />
          <MenubarSeparator />
          <CommandItems commandIds={["file.preferences"]} {...{ commandState, onExecute }} />
          <MenubarSeparator />
          <CommandItems
            commandIds={["file.closeDocument", "file.closeWindow"]}
            {...{ commandState, onExecute }}
          />
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{commandMenuLabels.edit}</MenubarTrigger>
        <MenubarContent>
          <CommandItems commandIds={["edit.undo", "edit.redo"]} {...{ commandState, onExecute }} />
          <MenubarSeparator />
          <CommandItems commandIds={["edit.cut", "edit.copy"]} {...{ commandState, onExecute }} />
          <CommandSubmenu
            commandIds={["edit.copyAsPlainText", "edit.copyAsMarkdown"]}
            label="Copy as"
            {...{ commandState, onExecute }}
          />
          <CommandItems commandIds={["edit.paste"]} {...{ commandState, onExecute }} />
          <CommandSubmenu
            commandIds={["edit.pasteAsPlainText", "edit.pasteAsMarkdown", "edit.pasteAsRichText"]}
            label="Paste as"
            {...{ commandState, onExecute }}
          />
          <MenubarSeparator />
          <CommandSubmenu
            commandIds={["edit.delete", "edit.deleteWordBackward", "edit.deleteWordForward"]}
            label="Delete"
            {...{ commandState, onExecute }}
          />
          <CommandSubmenu
            commandIds={["edit.selectAll", "edit.selectWord"]}
            label="Select"
            {...{ commandState, onExecute }}
          />
          <CommandSubmenu
            commandIds={[
              "edit.jumpToTop",
              "edit.jumpToBottom",
              "edit.jumpToSelection",
              "edit.jumpToLineStart",
              "edit.jumpToLineEnd",
            ]}
            label="Jump"
            {...{ commandState, onExecute }}
          />
          <MenubarSeparator />
          <LineEndingSubmenu {...{ commandState, onExecute }} />
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{commandMenuLabels.insert}</MenubarTrigger>
        <MenubarContent>
          <CommandItems commandIds={["insert.paragraph"]} {...{ commandState, onExecute }} />
          <HeadingSubmenu prefix="insert" {...{ commandState, onExecute }} />
          <MenubarSeparator />
          <CommandItems commandIds={insertCommandIds} {...{ commandState, onExecute }} />
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{commandMenuLabels.format}</MenubarTrigger>
        <MenubarContent>
          <CommandItems commandIds={inlineFormatCommandIds} {...{ commandState, onExecute }} />
          <MenubarSeparator />
          <CommandItems commandIds={["format.paragraph"]} {...{ commandState, onExecute }} />
          <HeadingSubmenu prefix="format" {...{ commandState, onExecute }} />
          <CommandItems
            commandIds={["format.increaseHeading", "format.decreaseHeading"]}
            {...{ commandState, onExecute }}
          />
          <MenubarSeparator />
          <CommandItems commandIds={blockFormatCommandIds} {...{ commandState, onExecute }} />
          <CommandSubmenu
            commandIds={tableCommandIds}
            label="Table"
            {...{ commandState, onExecute }}
          />
          <CommandItems commandIds={["format.clearBlock"]} {...{ commandState, onExecute }} />
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{commandMenuLabels.view}</MenubarTrigger>
        <MenubarContent>
          <CommandCheckboxItem
            commandId="view.toggleSidebar"
            state={commandState("view.toggleSidebar")}
            onExecute={onExecute}
          />
          <MenubarSeparator />
          <CommandItems
            commandIds={["view.zoomIn", "view.zoomOut", "view.resetZoom"]}
            {...{ commandState, onExecute }}
          />
          <CommandCheckboxItem
            commandId="view.fullscreen"
            state={commandState("view.fullscreen")}
            onExecute={onExecute}
          />
          <MenubarSeparator />
          <RadioSubmenu
            commandIds={["view.appearance.system", "view.appearance.light", "view.appearance.dark"]}
            label="Appearance"
            {...{ commandState, onExecute }}
          />
          <RadioSubmenu
            commandIds={["view.sort.name", "view.sort.modifiedDate", "view.sort.type"]}
            label="Sort articles by"
            {...{ commandState, onExecute }}
          />
          <CommandItems
            commandIds={["view.collapseAllFolders", "view.expandAllFolders"]}
            {...{ commandState, onExecute }}
          />
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{commandMenuLabels.help}</MenubarTrigger>
        <MenubarContent>
          <CommandItems commandIds={["help.about"]} {...{ commandState, onExecute }} />
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}

const insertCommandIds: AppCommandId[] = [
  "insert.link",
  "insert.image",
  "insert.orderedList",
  "insert.unorderedList",
  "insert.taskList",
  "insert.blockquote",
  "insert.codeBlock",
  "insert.table",
  "insert.horizontalRule",
];

const inlineFormatCommandIds: AppCommandId[] = [
  "format.strong",
  "format.emphasis",
  "format.strikethrough",
  "format.inlineCode",
  "format.clearInline",
];

const blockFormatCommandIds: AppCommandId[] = [
  "format.orderedList",
  "format.unorderedList",
  "format.taskList",
  "format.increaseListIndent",
  "format.decreaseListIndent",
  "format.toggleTaskChecked",
  "format.blockquote",
  "format.codeBlock",
];

const tableCommandIds: AppCommandId[] = [
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
];

interface CommandGroupProps {
  commandState: CommandMenuBarProps["commandState"];
  onExecute: CommandMenuBarProps["onExecute"];
}

interface CommandItemsProps extends CommandGroupProps {
  commandIds: AppCommandId[];
}

function CommandItems({ commandIds, commandState, onExecute }: CommandItemsProps) {
  return commandIds.map((commandId) => (
    <CommandMenuItem
      commandId={commandId}
      key={commandId}
      onExecute={onExecute}
      state={commandState(commandId)}
    />
  ));
}

interface CommandItemProps {
  commandId: AppCommandId;
  onExecute: CommandMenuBarProps["onExecute"];
  state: ResolvedCommandState;
}

function CommandMenuItem({ commandId, onExecute, state }: CommandItemProps) {
  const command = commandDefinitions[commandId];
  const primaryShortcut = getCommandShortcuts(command)[0];

  return (
    <MenubarItem disabled={!state.enabled} onSelect={() => onExecute(commandId)}>
      {command.label}
      {primaryShortcut && <MenubarShortcut>{formatShortcut(primaryShortcut)}</MenubarShortcut>}
    </MenubarItem>
  );
}

function CommandCheckboxItem({ commandId, onExecute, state }: CommandItemProps) {
  const command = commandDefinitions[commandId];
  const primaryShortcut = getCommandShortcuts(command)[0];

  return (
    <MenubarCheckboxItem
      checked={Boolean(state.checked)}
      disabled={!state.enabled}
      onSelect={() => onExecute(commandId)}
    >
      {command.label}
      {primaryShortcut && <MenubarShortcut>{formatShortcut(primaryShortcut)}</MenubarShortcut>}
    </MenubarCheckboxItem>
  );
}

interface RecentItemsSubmenuProps extends CommandGroupProps {
  onOpenRecentFile: CommandMenuBarProps["onOpenRecentFile"];
  onOpenRecentFolder: CommandMenuBarProps["onOpenRecentFolder"];
  recentFiles: string[];
  recentFolders: string[];
}

function RecentItemsSubmenu({
  commandState,
  onExecute,
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
        <CommandMenuItem
          commandId="file.clearRecentItems"
          onExecute={onExecute}
          state={commandState("file.clearRecentItems")}
        />
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

function CommandSubmenu({ commandIds, commandState, label, onExecute }: CommandSubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>{label}</MenubarSubTrigger>
      <MenubarSubContent>
        <CommandItems {...{ commandIds, commandState, onExecute }} />
      </MenubarSubContent>
    </MenubarSub>
  );
}

interface HeadingSubmenuProps extends CommandGroupProps {
  prefix: "format" | "insert";
}

function HeadingSubmenu({ commandState, onExecute, prefix }: HeadingSubmenuProps) {
  const commandIds = [1, 2, 3, 4, 5, 6].map((level) => `${prefix}.heading${level}` as AppCommandId);

  return <CommandSubmenu label="Heading" {...{ commandIds, commandState, onExecute }} />;
}

function LineEndingSubmenu({ commandState, onExecute }: CommandGroupProps) {
  const commandIds: AppCommandId[] = ["edit.lineEnding.crlf", "edit.lineEnding.lf"];

  return (
    <MenubarSub>
      <MenubarSubTrigger>Line ending</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={getCheckedCommandId(commandIds, commandState)}
          onValueChange={(commandId) => onExecute(commandId as AppCommandId)}
        >
          {commandIds.map((commandId) => (
            <CommandRadioItem
              commandId={commandId}
              key={commandId}
              state={commandState(commandId)}
            />
          ))}
        </MenubarRadioGroup>
        <CommandCheckboxItem
          commandId="edit.insertFinalNewline"
          onExecute={onExecute}
          state={commandState("edit.insertFinalNewline")}
        />
      </MenubarSubContent>
    </MenubarSub>
  );
}

interface RadioSubmenuProps extends CommandItemsProps {
  label: string;
}

function RadioSubmenu({ commandIds, commandState, label, onExecute }: RadioSubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger>{label}</MenubarSubTrigger>
      <MenubarSubContent>
        <MenubarRadioGroup
          value={getCheckedCommandId(commandIds, commandState)}
          onValueChange={(commandId) => onExecute(commandId as AppCommandId)}
        >
          {commandIds.map((commandId) => (
            <CommandRadioItem
              commandId={commandId}
              key={commandId}
              state={commandState(commandId)}
            />
          ))}
        </MenubarRadioGroup>
      </MenubarSubContent>
    </MenubarSub>
  );
}

interface CommandRadioItemProps {
  commandId: AppCommandId;
  state: ResolvedCommandState;
}

function CommandRadioItem({ commandId, state }: CommandRadioItemProps) {
  return (
    <MenubarRadioItem value={commandId} disabled={!state.enabled}>
      {commandDefinitions[commandId].label}
    </MenubarRadioItem>
  );
}

const getCheckedCommandId = (
  commandIds: AppCommandId[],
  commandState: CommandMenuBarProps["commandState"],
) => commandIds.find((commandId) => commandState(commandId).checked) ?? "";
