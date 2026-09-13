import { FileTextIcon, PaletteIcon, PencilIcon, SlidersHorizontalIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LineEnding, MarkdownFileExtension } from "@/features/document";
import type { ArticleSortOrder } from "@/features/folder-context";

import { type AppearanceTheme, useSettingsStore } from "../stores/settings";
import {
  type ChoiceOption,
  ListPreferenceField,
  PreferenceChoice,
  PreferenceSwitch,
} from "./preference-controls";

const APPEARANCE_THEME_OPTIONS: ChoiceOption<AppearanceTheme>[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const ARTICLE_SORT_OPTIONS: ChoiceOption<ArticleSortOrder>[] = [
  { label: "Name", value: "name" },
  { label: "Modified date", value: "modifiedDate" },
  { label: "Type", value: "type" },
];

const NEW_DOCUMENT_EXTENSION_OPTIONS: ChoiceOption<MarkdownFileExtension>[] = [
  { label: ".md", value: ".md" },
  { label: ".markdown", value: ".markdown" },
];

const LINE_ENDING_OPTIONS: ChoiceOption<LineEnding>[] = [
  { label: "LF", value: "lf" },
  { label: "CRLF", value: "crlf" },
];

const PREFERENCE_TABS = [
  { value: "general", label: "General", icon: SlidersHorizontalIcon },
  { value: "files", label: "Files", icon: FileTextIcon },
  { value: "editor", label: "Editor", icon: PencilIcon },
  { value: "appearance", label: "Appearance", icon: PaletteIcon },
] satisfies { value: string; label: string; icon: LucideIcon }[];

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreferencesDialog({ open, onOpenChange }: PreferencesDialogProps) {
  const reset = useSettingsStore((state) => state.reset);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-2xl">
        <DialogHeader className="pr-10">
          <DialogTitle>Preferences</DialogTitle>
        </DialogHeader>

        <Tabs
          orientation="vertical"
          defaultValue="general"
          className="h-[min(26rem,calc(100vh-16rem))] gap-5"
        >
          <TabsList className="w-36 shrink-0 items-stretch p-1">
            {PREFERENCE_TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-auto justify-start gap-2 px-2 py-1.5"
              >
                <Icon data-icon="inline-start" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="min-w-0 flex-1">
            <div className="pr-3 pb-1">
              <TabsContent value="general">
                <GeneralPreferences />
              </TabsContent>
              <TabsContent value="files">
                <FilePreferences />
              </TabsContent>
              <TabsContent value="editor">
                <EditorPreferences />
              </TabsContent>
              <TabsContent value="appearance">
                <AppearancePreferences />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="sm:justify-between" showCloseButton>
          <Button type="button" variant="ghost" onClick={reset}>
            Restore defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GeneralPreferences() {
  const articleSortOrder = useSettingsStore((state) => state.articleSortOrder);
  const recordRecentItems = useSettingsStore((state) => state.recordRecentItems);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <FieldGroup className="gap-5">
      <PreferenceSwitch
        label="Record recent files and folders"
        description="Session history records the paths you open."
        checked={recordRecentItems}
        onCheckedChange={(checked) => updateSetting("recordRecentItems", checked)}
      />
      <PreferenceSwitch
        label="Sidebar visibility"
        description="Applies while a folder context is open."
        checked={sidebarVisible}
        onCheckedChange={(checked) => updateSetting("sidebarVisible", checked)}
      />
      <PreferenceChoice
        label="Sort articles by"
        value={articleSortOrder}
        options={ARTICLE_SORT_OPTIONS}
        onValueChange={(value) => updateSetting("articleSortOrder", value)}
      />
    </FieldGroup>
  );
}

function FilePreferences() {
  const defaultNewDocumentExtension = useSettingsStore(
    (state) => state.defaultNewDocumentExtension,
  );
  const defaultNewDocumentLineEnding = useSettingsStore(
    (state) => state.defaultNewDocumentLineEnding,
  );
  const ignoredDirectories = useSettingsStore((state) => state.ignoredDirectories);
  const indexFileNames = useSettingsStore((state) => state.indexFileNames);
  const insertFinalNewline = useSettingsStore((state) => state.insertFinalNewline);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <FieldGroup className="gap-5">
      <PreferenceChoice
        label="Default extension for new documents"
        value={defaultNewDocumentExtension}
        options={NEW_DOCUMENT_EXTENSION_OPTIONS}
        onValueChange={(value) => updateSetting("defaultNewDocumentExtension", value)}
      />
      <PreferenceChoice
        label="Default line ending for new documents"
        value={defaultNewDocumentLineEnding}
        options={LINE_ENDING_OPTIONS}
        onValueChange={(value) => updateSetting("defaultNewDocumentLineEnding", value)}
      />
      <PreferenceSwitch
        label="Insert final newline on save"
        description="Ends the saved file with a line break."
        checked={insertFinalNewline}
        onCheckedChange={(checked) => updateSetting("insertFinalNewline", checked)}
      />
      <ListPreferenceField
        label="Index file names for automatic folder open"
        description="Base names, one per line, in the order they are tried."
        items={indexFileNames}
        onItemsChange={(items) => updateSetting("indexFileNames", items)}
      />
      <ListPreferenceField
        label="Ignored directories for folder scans"
        description="Directory names, one per line. Matches are skipped with their contents."
        items={ignoredDirectories}
        onItemsChange={(items) => updateSetting("ignoredDirectories", items)}
      />
    </FieldGroup>
  );
}

function EditorPreferences() {
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <FieldGroup className="gap-5">
      <PreferenceSwitch
        label="Auto pair brackets and quotes"
        description="Closes a bracket or quote as you open one."
        checked={autoPairBracketsAndQuotes}
        onCheckedChange={(checked) => updateSetting("autoPairBracketsAndQuotes", checked)}
      />
      <PreferenceSwitch
        label="Soft wrap for code blocks"
        description="Wraps long lines instead of scrolling them."
        checked={softWrapCodeBlocks}
        onCheckedChange={(checked) => updateSetting("softWrapCodeBlocks", checked)}
      />
    </FieldGroup>
  );
}

function AppearancePreferences() {
  const theme = useSettingsStore((state) => state.theme);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <FieldGroup className="gap-5">
      <PreferenceChoice
        label="Appearance theme"
        value={theme}
        options={APPEARANCE_THEME_OPTIONS}
        onValueChange={(value) => updateSetting("theme", value)}
      />
    </FieldGroup>
  );
}
