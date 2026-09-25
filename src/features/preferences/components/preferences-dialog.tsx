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
import { Field, FieldContent, FieldGroup, FieldTitle } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LineEnding, MarkdownFileExtension } from "@/features/document";
import type { ArticleSortOrder } from "@/features/folder-context";

import {
  type AppearanceAccentColor,
  type AppearanceTheme,
  type DropBehavior,
  useSettingsStore,
} from "../stores/settings";
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

const APPEARANCE_ACCENT_COLOR_OPTIONS = [
  { label: "Neutral", value: "neutral" },
  { label: "Red", value: "red" },
  { label: "Orange", value: "orange" },
  { label: "Amber", value: "amber" },
  { label: "Emerald", value: "emerald" },
  { label: "Cyan", value: "cyan" },
  { label: "Blue", value: "blue" },
  { label: "Violet", value: "violet" },
  { label: "Fuchsia", value: "fuchsia" },
] satisfies ChoiceOption<AppearanceAccentColor>[];

interface AccentColorPreviewProps {
  accentColor: AppearanceAccentColor;
}

function AccentColorPreview({ accentColor }: AccentColorPreviewProps) {
  return (
    <span
      aria-hidden
      data-accent-color-preview={accentColor}
      className="size-3 shrink-0 rounded-full border border-black/10 dark:border-white/15"
    />
  );
}

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

const createDropBehaviorOptions = (insertLabel: string): ChoiceOption<DropBehavior>[] => [
  { label: "Open", value: "open" },
  { label: insertLabel, value: "insertLink" },
];

const FOLDER_DROP_BEHAVIOR_OPTIONS = createDropBehaviorOptions("Insert folder link");
const MARKDOWN_FILE_DROP_BEHAVIOR_OPTIONS = createDropBehaviorOptions("Insert file link");

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
      <DialogContent className="gap-4 sm:max-w-3xl">
        <DialogHeader className="pr-10">
          <DialogTitle>Preferences</DialogTitle>
        </DialogHeader>

        <Tabs
          orientation="vertical"
          defaultValue="general"
          className="mt-4 h-[min(34rem,calc(100vh-12rem))] gap-6"
        >
          <TabsList className="w-44 shrink-0" variant="line">
            {PREFERENCE_TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="h-auto gap-2 py-2">
                <Icon data-icon="inline-start" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="min-w-0 flex-1">
            <div className="px-3 pb-1">
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

        <DialogFooter className="sm:justify-start">
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
  const statusBarVisible = useSettingsStore((state) => state.statusBarVisible);
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
      <PreferenceSwitch
        label="Status bar visibility"
        description="Applies while a document is open."
        checked={statusBarVisible}
        onCheckedChange={(checked) => updateSetting("statusBarVisible", checked)}
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
  const whenDroppingFolder = useSettingsStore((state) => state.whenDroppingFolder);
  const whenDroppingMarkdownFile = useSettingsStore((state) => state.whenDroppingMarkdownFile);
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
      <PreferenceChoice
        label="When dropping a folder"
        value={whenDroppingFolder}
        options={FOLDER_DROP_BEHAVIOR_OPTIONS}
        onValueChange={(value) => updateSetting("whenDroppingFolder", value)}
      />
      <PreferenceChoice
        label="When dropping a Markdown file"
        value={whenDroppingMarkdownFile}
        options={MARKDOWN_FILE_DROP_BEHAVIOR_OPTIONS}
        onValueChange={(value) => updateSetting("whenDroppingMarkdownFile", value)}
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
  const accentColor = useSettingsStore((state) => state.accentColor);
  const theme = useSettingsStore((state) => state.theme);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <FieldGroup className="gap-5">
      <AccentColorPreference
        accentColor={accentColor}
        onAccentColorChange={(value) => updateSetting("accentColor", value)}
      />
      <PreferenceChoice
        label="Appearance theme"
        value={theme}
        options={APPEARANCE_THEME_OPTIONS}
        onValueChange={(value) => updateSetting("theme", value)}
      />
    </FieldGroup>
  );
}

interface AccentColorPreferenceProps {
  accentColor: AppearanceAccentColor;
  onAccentColorChange: (accentColor: AppearanceAccentColor) => void;
}

function AccentColorPreference({ accentColor, onAccentColorChange }: AccentColorPreferenceProps) {
  return (
    <Field orientation="horizontal" className="has-[>[data-slot=field-content]]:items-center">
      <FieldContent>
        <FieldTitle>Accent color</FieldTitle>
      </FieldContent>
      <Select
        items={APPEARANCE_ACCENT_COLOR_OPTIONS}
        value={accentColor}
        onValueChange={(value) => {
          if (value) {
            onAccentColorChange(value);
          }
        }}
      >
        <SelectTrigger className="w-[180px]" aria-label="Accent color">
          <SelectValue>
            {(value: AppearanceAccentColor | null) => {
              const option = APPEARANCE_ACCENT_COLOR_OPTIONS.find(
                (candidate) => candidate.value === value,
              );

              return option ? (
                <>
                  <AccentColorPreview accentColor={option.value} />
                  <span>{option.label}</span>
                </>
              ) : null;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {APPEARANCE_ACCENT_COLOR_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <AccentColorPreview accentColor={option.value} />
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
