import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Separator } from "@/components/ui/Separator";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import {
  useSettingsStore,
  type AppearanceTheme,
  type DefaultNewDocumentExtension,
  type FileTreeSortOrder,
  type LineEndingPreference,
} from "@/stores/settings";
import { SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

interface PreferenceSwitchProps {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

interface RadioOption<Value extends string> {
  label: string;
  value: Value;
}

interface PreferenceRadioGroupProps<Value extends string> {
  label: string;
  onValueChange: (value: Value) => void;
  options: RadioOption<Value>[];
  value: Value;
}

interface ListPreferenceFieldProps {
  items: string[];
  label: string;
  onItemsChange: (items: string[]) => void;
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

const formatListValue = (items: string[]) => items.join("\n");

const parseListValue = (value: string) =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

function PreferenceSwitch({ checked, label, onCheckedChange }: PreferenceSwitchProps) {
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PreferenceRadioGroup<Value extends string>({
  label,
  onValueChange,
  options,
  value,
}: PreferenceRadioGroupProps<Value>) {
  const labelId = useId();

  return (
    <div className="grid gap-2">
      <Label id={labelId}>{label}</Label>
      <RadioGroup
        aria-labelledby={labelId}
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as Value)}
        className="grid gap-2 sm:grid-cols-3"
      >
        {options.map((option) => {
          const id = `${labelId}-${option.value}`;

          return (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem id={id} value={option.value} />
              <Label htmlFor={id} className="font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}

function ListPreferenceField({ items, label, onItemsChange }: ListPreferenceFieldProps) {
  const id = useId();
  const [prevItems, setPrevItems] = useState(items);
  const [draftValue, setDraftValue] = useState(() => formatListValue(items));

  if (items !== prevItems) {
    setPrevItems(items);
    setDraftValue(formatListValue(items));
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={draftValue}
        onChange={(event) => setDraftValue(event.currentTarget.value)}
        onBlur={() => onItemsChange(parseListValue(draftValue))}
        className="min-h-24 font-mono text-sm"
      />
    </div>
  );
}

function PreferenceSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section aria-labelledby={`${title.toLowerCase()}-preferences-title`} className="grid gap-4">
      <h3 id={`${title.toLowerCase()}-preferences-title`} className="text-sm font-semibold">
        {title}
      </h3>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function PreferencesDialog() {
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
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <SettingsIcon aria-hidden="true" className="size-4" />
          Preferences
        </Button>
      </DialogTrigger>
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
