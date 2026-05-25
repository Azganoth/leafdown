import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Separator } from "@/components/ui/Separator";
import {
  useSettingsStore,
  type AppearanceTheme,
  type DefaultNewDocumentExtension,
  type FileTreeSortOrder,
  type LineEndingPreference,
} from "@/stores/settings";
import { SettingsIcon } from "lucide-react";
import {
  ListPreferenceField,
  PreferenceRadioGroup,
  PreferenceSection,
  PreferenceSwitch,
  type RadioOption,
} from "./PreferenceControls";

interface PreferencesDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

const appearanceThemeOptions: RadioOption<AppearanceTheme>[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const fileTreeSortOptions: RadioOption<FileTreeSortOrder>[] = [
  { label: "Name", value: "name" },
  { label: "Modified date", value: "modifiedDate" },
  { label: "Type", value: "type" },
];

const newDocumentExtensionOptions: RadioOption<DefaultNewDocumentExtension>[] = [
  { label: ".md", value: ".md" },
  { label: ".markdown", value: ".markdown" },
];

const lineEndingOptions: RadioOption<LineEndingPreference>[] = [
  { label: "LF", value: "lf" },
  { label: "CRLF", value: "crlf" },
];

function PreferencesDialog({
  open,
  onOpenChange,
  showTrigger = true,
}: PreferencesDialogProps = {}) {
  const {
    autoPairBracketsAndQuotes,
    defaultNewDocumentExtension,
    defaultNewDocumentLineEnding,
    fileTreeSortOrder,
    ignoredDirectories,
    indexFileNames,
    insertFinalNewline,
    recordRecentItems,
    sidebarVisible,
    softWrapCodeBlocks,
    theme,
    updateSetting,
  } = useSettingsStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            <SettingsIcon aria-hidden="true" className="size-4" />
            Preferences
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader className="pr-10">
          <DialogTitle>Preferences</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[min(40rem,calc(100vh-12rem))] pr-4 pl-2">
          <div className="grid gap-5 pb-8">
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
                label="Sort file tree by"
                value={fileTreeSortOrder}
                options={fileTreeSortOptions}
                onValueChange={(value) => updateSetting("fileTreeSortOrder", value)}
              />
            </PreferenceSection>

            <Separator />

            <PreferenceSection title="Files">
              <PreferenceRadioGroup
                label="Default extension for new documents"
                value={defaultNewDocumentExtension}
                options={newDocumentExtensionOptions}
                onValueChange={(value) => updateSetting("defaultNewDocumentExtension", value)}
              />
              <PreferenceRadioGroup
                label="Default line ending for new documents"
                value={defaultNewDocumentLineEnding}
                options={lineEndingOptions}
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

            <Separator />

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

            <Separator />

            <PreferenceSection title="Appearance">
              <PreferenceRadioGroup
                label="Appearance theme"
                value={theme}
                options={appearanceThemeOptions}
                onValueChange={(value) => updateSetting("theme", value)}
              />
            </PreferenceSection>
          </div>
        </ScrollArea>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

export { PreferencesDialog };
