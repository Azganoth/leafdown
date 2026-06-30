import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Separator } from "@/components/ui/Separator";
import type { LineEnding, MarkdownFileExtension } from "@/features/document";
import type { ArticleSortOrder } from "@/features/folder-context";

import { type AppearanceTheme, useSettingsStore } from "../stores/settings";
import {
  ListPreferenceField,
  PreferenceRadioGroup,
  PreferenceSection,
  PreferenceSwitch,
  type RadioOption,
} from "./PreferenceControls";

const APPEARANCE_THEME_OPTIONS: RadioOption<AppearanceTheme>[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const ARTICLE_SORT_OPTIONS: RadioOption<ArticleSortOrder>[] = [
  { label: "Name", value: "name" },
  { label: "Modified date", value: "modifiedDate" },
  { label: "Type", value: "type" },
];

const NEW_DOCUMENT_EXTENSION_OPTIONS: RadioOption<MarkdownFileExtension>[] = [
  { label: ".md", value: ".md" },
  { label: ".markdown", value: ".markdown" },
];

const LINE_ENDING_OPTIONS: RadioOption<LineEnding>[] = [
  { label: "LF", value: "lf" },
  { label: "CRLF", value: "crlf" },
];

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreferencesDialog({ open, onOpenChange }: PreferencesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader className="pr-10">
          <DialogTitle>Preferences</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[min(40rem,calc(100vh-12rem))] pr-4 pl-2">
          <div className="grid gap-5 pb-8">
            <GeneralPreferencesSection />
            <Separator />
            <FilePreferencesSection />
            <Separator />
            <EditorPreferencesSection />
            <Separator />
            <AppearancePreferencesSection />
          </div>
        </ScrollArea>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function GeneralPreferencesSection() {
  const articleSortOrder = useSettingsStore((state) => state.articleSortOrder);
  const recordRecentItems = useSettingsStore((state) => state.recordRecentItems);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <PreferenceSection title="General">
      <PreferenceSwitch
        label="Record recent files and folders"
        checked={recordRecentItems}
        onCheckedChange={(checked) => updateSetting("recordRecentItems", checked)}
      />
      <PreferenceSwitch
        label="Sidebar visibility"
        checked={sidebarVisible}
        onCheckedChange={(checked) => updateSetting("sidebarVisible", checked)}
      />
      <PreferenceRadioGroup
        label="Sort articles by"
        value={articleSortOrder}
        options={ARTICLE_SORT_OPTIONS}
        onValueChange={(value) => updateSetting("articleSortOrder", value)}
      />
    </PreferenceSection>
  );
}

function FilePreferencesSection() {
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
    <PreferenceSection title="Files">
      <PreferenceRadioGroup
        label="Default extension for new documents"
        value={defaultNewDocumentExtension}
        options={NEW_DOCUMENT_EXTENSION_OPTIONS}
        onValueChange={(value) => updateSetting("defaultNewDocumentExtension", value)}
      />
      <PreferenceRadioGroup
        label="Default line ending for new documents"
        value={defaultNewDocumentLineEnding}
        options={LINE_ENDING_OPTIONS}
        onValueChange={(value) => updateSetting("defaultNewDocumentLineEnding", value)}
      />
      <PreferenceSwitch
        label="Insert final newline on save"
        checked={insertFinalNewline}
        onCheckedChange={(checked) => updateSetting("insertFinalNewline", checked)}
      />
      <ListPreferenceField
        label="Index file names for automatic folder open"
        items={indexFileNames}
        onItemsChange={(items) => updateSetting("indexFileNames", items)}
      />
      <ListPreferenceField
        label="Ignored directories for folder scans"
        items={ignoredDirectories}
        onItemsChange={(items) => updateSetting("ignoredDirectories", items)}
      />
    </PreferenceSection>
  );
}

function EditorPreferencesSection() {
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <PreferenceSection title="Editor">
      <PreferenceSwitch
        label="Auto pair brackets and quotes"
        checked={autoPairBracketsAndQuotes}
        onCheckedChange={(checked) => updateSetting("autoPairBracketsAndQuotes", checked)}
      />
      <PreferenceSwitch
        label="Soft wrap for code blocks"
        checked={softWrapCodeBlocks}
        onCheckedChange={(checked) => updateSetting("softWrapCodeBlocks", checked)}
      />
    </PreferenceSection>
  );
}

function AppearancePreferencesSection() {
  const theme = useSettingsStore((state) => state.theme);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <PreferenceSection title="Appearance">
      <PreferenceRadioGroup
        label="Appearance theme"
        value={theme}
        options={APPEARANCE_THEME_OPTIONS}
        onValueChange={(value) => updateSetting("theme", value)}
      />
    </PreferenceSection>
  );
}
