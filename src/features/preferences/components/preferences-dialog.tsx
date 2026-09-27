import { FileTextIcon, PaletteIcon, PencilIcon, SlidersHorizontalIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
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
import type { DocumentFont, DocumentLineSpacing, DocumentTypography } from "@/features/editor";
import type { ArticleSortOrder } from "@/features/folder-context";
import { notifyOperationFailure } from "@/lib/errors";
import {
  getAvailableLocales,
  getChosenLocale,
  getLanguageDisplayName,
  getSystemLanguages,
  resolveLocale,
  SYSTEM_LANGUAGE,
  useLocalization,
  type MessageId,
} from "@/lib/i18n";

import { restoreDefaultSettings } from "../services/windowPreferences";
import {
  type AppearanceAccentColor,
  type AppearanceTheme,
  DOCUMENT_TEXT_SIZES,
  type DropBehavior,
  useSettingsStore,
} from "../stores/settings";
import {
  type ChoiceOption,
  ListPreferenceField,
  PreferenceChoice,
  PreferenceSwitch,
} from "./preference-controls";

interface LocalizedOption<Value extends string> {
  labelId: MessageId;
  value: Value;
}

const APPEARANCE_THEME_OPTIONS: LocalizedOption<AppearanceTheme>[] = [
  { labelId: "preferences.theme.system", value: "system" },
  { labelId: "preferences.theme.light", value: "light" },
  { labelId: "preferences.theme.dark", value: "dark" },
];

const APPEARANCE_ACCENT_COLOR_OPTIONS: LocalizedOption<AppearanceAccentColor>[] = [
  { labelId: "preferences.accentColor.neutral", value: "neutral" },
  { labelId: "preferences.accentColor.red", value: "red" },
  { labelId: "preferences.accentColor.orange", value: "orange" },
  { labelId: "preferences.accentColor.amber", value: "amber" },
  { labelId: "preferences.accentColor.emerald", value: "emerald" },
  { labelId: "preferences.accentColor.cyan", value: "cyan" },
  { labelId: "preferences.accentColor.blue", value: "blue" },
  { labelId: "preferences.accentColor.violet", value: "violet" },
  { labelId: "preferences.accentColor.fuchsia", value: "fuchsia" },
];

type DocumentFontOption = { value: DocumentFont; className: string } & (
  | { label: string }
  | { labelId: MessageId }
);

const DOCUMENT_FONT_OPTIONS: DocumentFontOption[] = [
  { label: "Inter", value: "inter", className: "font-sans" },
  { label: "IBM Plex Sans", value: "ibm-plex-sans", className: "font-ibm-plex-sans" },
  {
    label: "Atkinson Hyperlegible Next",
    value: "atkinson-hyperlegible",
    className: "font-atkinson-hyperlegible",
  },
  { label: "Literata", value: "literata", className: "font-literata" },
  { labelId: "preferences.documentFont.system", value: "system", className: "font-system" },
];

const LINE_SPACING_OPTIONS: LocalizedOption<DocumentLineSpacing>[] = [
  { labelId: "preferences.lineSpacing.compact", value: "compact" },
  { labelId: "preferences.lineSpacing.default", value: "default" },
  { labelId: "preferences.lineSpacing.relaxed", value: "relaxed" },
];

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

const ARTICLE_SORT_OPTIONS: LocalizedOption<ArticleSortOrder>[] = [
  { labelId: "preferences.articleSortOrder.name", value: "name" },
  { labelId: "preferences.articleSortOrder.modifiedDate", value: "modifiedDate" },
  { labelId: "preferences.articleSortOrder.type", value: "type" },
];

const NEW_DOCUMENT_EXTENSION_OPTIONS: ChoiceOption<MarkdownFileExtension>[] = [
  { label: ".md", value: ".md" },
  { label: ".markdown", value: ".markdown" },
];

const LINE_ENDING_OPTIONS: ChoiceOption<LineEnding>[] = [
  { label: "LF", value: "lf" },
  { label: "CRLF", value: "crlf" },
];

const FOLDER_DROP_BEHAVIOR_OPTIONS: LocalizedOption<DropBehavior>[] = [
  { labelId: "preferences.dropBehavior.open", value: "open" },
  { labelId: "preferences.dropBehavior.insertFolderLink", value: "insertLink" },
];

const MARKDOWN_FILE_DROP_BEHAVIOR_OPTIONS: LocalizedOption<DropBehavior>[] = [
  { labelId: "preferences.dropBehavior.open", value: "open" },
  { labelId: "preferences.dropBehavior.insertFileLink", value: "insertLink" },
];

const PREFERENCE_TABS = [
  { value: "general", labelId: "preferences.tab.general", icon: SlidersHorizontalIcon },
  { value: "files", labelId: "preferences.tab.files", icon: FileTextIcon },
  { value: "editor", labelId: "preferences.tab.editor", icon: PencilIcon },
  { value: "appearance", labelId: "preferences.tab.appearance", icon: PaletteIcon },
] satisfies { value: string; labelId: MessageId; icon: LucideIcon }[];

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderTypographyPreview?: (typography: DocumentTypography) => ReactNode;
}

export function PreferencesDialog({
  open,
  onOpenChange,
  renderTypographyPreview,
}: PreferencesDialogProps) {
  const { t } = useLocalization();

  const restoreDefaults = () => {
    void restoreDefaultSettings().catch((error) =>
      notifyOperationFailure(
        t("preferences.restoreDefaults.alwaysOnTopFailed"),
        error,
        "restoreDefaultSettings",
      ),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-3xl">
        <DialogHeader className="pr-10">
          <DialogTitle>{t("preferences.title")}</DialogTitle>
        </DialogHeader>

        <Tabs
          orientation="vertical"
          defaultValue="general"
          className="mt-4 h-[min(34rem,calc(100vh-12rem))] gap-6"
        >
          <TabsList className="w-44 shrink-0" variant="line">
            {PREFERENCE_TABS.map(({ value, labelId, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="h-auto gap-2 py-2">
                <Icon data-icon="inline-start" />
                {t(labelId)}
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
                <AppearancePreferences renderTypographyPreview={renderTypographyPreview} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="ghost" onClick={restoreDefaults}>
            {t("preferences.restoreDefaults")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GeneralPreferences() {
  const { t } = useLocalization();
  const articleSortOrder = useSettingsStore((state) => state.articleSortOrder);
  const recordRecentItems = useSettingsStore((state) => state.recordRecentItems);
  const sidebarVisible = useSettingsStore((state) => state.sidebarVisible);
  const statusBarVisible = useSettingsStore((state) => state.statusBarVisible);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <FieldGroup className="gap-5">
      <LanguagePreference />
      <PreferenceSwitch
        label={t("preferences.recordRecentItems.label")}
        description={t("preferences.recordRecentItems.description")}
        checked={recordRecentItems}
        onCheckedChange={(checked) => updateSetting("recordRecentItems", checked)}
      />
      <PreferenceSwitch
        label={t("preferences.sidebarVisible.label")}
        description={t("preferences.sidebarVisible.description")}
        checked={sidebarVisible}
        onCheckedChange={(checked) => updateSetting("sidebarVisible", checked)}
      />
      <PreferenceSwitch
        label={t("preferences.statusBarVisible.label")}
        description={t("preferences.statusBarVisible.description")}
        checked={statusBarVisible}
        onCheckedChange={(checked) => updateSetting("statusBarVisible", checked)}
      />
      <PreferenceChoice
        label={t("preferences.articleSortOrder.label")}
        value={articleSortOrder}
        options={ARTICLE_SORT_OPTIONS.map(({ labelId, value }) => ({ label: t(labelId), value }))}
        onValueChange={(value) => updateSetting("articleSortOrder", value)}
      />
    </FieldGroup>
  );
}

interface LanguageOption {
  label: string;
  lang?: string;
  value: string;
}

function LanguagePreference() {
  const { locale, t } = useLocalization();
  const language = useSettingsStore((state) => state.language);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const availableLocales = getAvailableLocales();
  const systemLocale = resolveLocale(SYSTEM_LANGUAGE, getSystemLanguages());
  const options: LanguageOption[] = [
    {
      label: t("preferences.language.system", {
        language: getLanguageDisplayName(systemLocale, locale),
      }),
      value: SYSTEM_LANGUAGE,
    },
    ...availableLocales.map((availableLocale) => ({
      label: getLanguageDisplayName(availableLocale),
      lang: availableLocale,
      value: availableLocale,
    })),
  ];
  const selectedValue = getChosenLocale(language, availableLocales) ?? SYSTEM_LANGUAGE;

  return (
    <Field orientation="horizontal" className="has-[>[data-slot=field-content]]:items-center">
      <FieldContent>
        <FieldTitle>{t("preferences.language.label")}</FieldTitle>
        <FieldDescription>{t("preferences.language.description")}</FieldDescription>
      </FieldContent>
      <Select
        items={options}
        value={selectedValue}
        onValueChange={(value) => {
          if (value) {
            updateSetting("language", value);
          }
        }}
      >
        <SelectTrigger className="w-[180px]" aria-label={t("preferences.language.label")}>
          <SelectValue>
            {(value: string | null) => {
              const option = options.find((candidate) => candidate.value === value);

              return option ? <span lang={option.lang}>{option.label}</span> : null;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} lang={option.lang}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function FilePreferences() {
  const { t } = useLocalization();
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
        label={t("preferences.defaultNewDocumentExtension.label")}
        value={defaultNewDocumentExtension}
        options={NEW_DOCUMENT_EXTENSION_OPTIONS}
        onValueChange={(value) => updateSetting("defaultNewDocumentExtension", value)}
      />
      <PreferenceChoice
        label={t("preferences.defaultNewDocumentLineEnding.label")}
        value={defaultNewDocumentLineEnding}
        options={LINE_ENDING_OPTIONS}
        onValueChange={(value) => updateSetting("defaultNewDocumentLineEnding", value)}
      />
      <PreferenceSwitch
        label={t("preferences.insertFinalNewline.label")}
        description={t("preferences.insertFinalNewline.description")}
        checked={insertFinalNewline}
        onCheckedChange={(checked) => updateSetting("insertFinalNewline", checked)}
      />
      <PreferenceChoice
        label={t("preferences.whenDroppingFolder.label")}
        value={whenDroppingFolder}
        options={FOLDER_DROP_BEHAVIOR_OPTIONS.map(({ labelId, value }) => ({
          label: t(labelId),
          value,
        }))}
        onValueChange={(value) => updateSetting("whenDroppingFolder", value)}
      />
      <PreferenceChoice
        label={t("preferences.whenDroppingMarkdownFile.label")}
        value={whenDroppingMarkdownFile}
        options={MARKDOWN_FILE_DROP_BEHAVIOR_OPTIONS.map(({ labelId, value }) => ({
          label: t(labelId),
          value,
        }))}
        onValueChange={(value) => updateSetting("whenDroppingMarkdownFile", value)}
      />
      <ListPreferenceField
        label={t("preferences.indexFileNames.label")}
        description={t("preferences.indexFileNames.description")}
        items={indexFileNames}
        onItemsChange={(items) => updateSetting("indexFileNames", items)}
      />
      <ListPreferenceField
        label={t("preferences.ignoredDirectories.label")}
        description={t("preferences.ignoredDirectories.description")}
        items={ignoredDirectories}
        onItemsChange={(items) => updateSetting("ignoredDirectories", items)}
      />
    </FieldGroup>
  );
}

function EditorPreferences() {
  const { t } = useLocalization();
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const displayCodeBlockLineNumbers = useSettingsStore(
    (state) => state.displayCodeBlockLineNumbers,
  );
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <FieldGroup className="gap-5">
      <PreferenceSwitch
        label={t("preferences.autoPairBracketsAndQuotes.label")}
        description={t("preferences.autoPairBracketsAndQuotes.description")}
        checked={autoPairBracketsAndQuotes}
        onCheckedChange={(checked) => updateSetting("autoPairBracketsAndQuotes", checked)}
      />
      <PreferenceSwitch
        label={t("preferences.displayCodeBlockLineNumbers.label")}
        description={t("preferences.displayCodeBlockLineNumbers.description")}
        checked={displayCodeBlockLineNumbers}
        onCheckedChange={(checked) => updateSetting("displayCodeBlockLineNumbers", checked)}
      />
      <PreferenceSwitch
        label={t("preferences.softWrapCodeBlocks.label")}
        description={t("preferences.softWrapCodeBlocks.description")}
        checked={softWrapCodeBlocks}
        onCheckedChange={(checked) => updateSetting("softWrapCodeBlocks", checked)}
      />
    </FieldGroup>
  );
}

interface AppearancePreferencesProps {
  renderTypographyPreview?: (typography: DocumentTypography) => ReactNode;
}

function AppearancePreferences({ renderTypographyPreview }: AppearancePreferencesProps) {
  const { t } = useLocalization();
  const accentColor = useSettingsStore((state) => state.accentColor);
  const theme = useSettingsStore((state) => state.theme);
  const documentFont = useSettingsStore((state) => state.documentFont);
  const textSize = useSettingsStore((state) => state.textSize);
  const lineSpacing = useSettingsStore((state) => state.lineSpacing);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <FieldGroup className="gap-5">
      <AccentColorPreference
        accentColor={accentColor}
        onAccentColorChange={(value) => updateSetting("accentColor", value)}
      />
      <PreferenceChoice
        label={t("preferences.theme.label")}
        value={theme}
        options={APPEARANCE_THEME_OPTIONS.map(({ labelId, value }) => ({
          label: t(labelId),
          value,
        }))}
        onValueChange={(value) => updateSetting("theme", value)}
      />
      <DocumentFontPreference
        documentFont={documentFont}
        onDocumentFontChange={(value) => updateSetting("documentFont", value)}
      />
      <PreferenceChoice
        label={t("preferences.textSize.label")}
        description={t("preferences.textSize.description")}
        value={String(textSize)}
        options={DOCUMENT_TEXT_SIZES.map((size) => ({
          label: t("preferences.textSize.option", { size }),
          value: String(size),
        }))}
        onValueChange={(value) => {
          const size = DOCUMENT_TEXT_SIZES.find((candidate) => String(candidate) === value);

          if (size) {
            updateSetting("textSize", size);
          }
        }}
      />
      <PreferenceChoice
        label={t("preferences.lineSpacing.label")}
        description={t("preferences.lineSpacing.description")}
        value={lineSpacing}
        options={LINE_SPACING_OPTIONS.map(({ labelId, value }) => ({
          label: t(labelId),
          value,
        }))}
        onValueChange={(value) => updateSetting("lineSpacing", value)}
      />
      {renderTypographyPreview && (
        <Field>
          <FieldTitle>{t("preferences.typographyPreview.label")}</FieldTitle>
          <div className="rounded-lg border border-border bg-card px-5 py-4">
            {renderTypographyPreview({ font: documentFont, textSize, lineSpacing })}
          </div>
        </Field>
      )}
    </FieldGroup>
  );
}

interface DocumentFontPreferenceProps {
  documentFont: DocumentFont;
  onDocumentFontChange: (documentFont: DocumentFont) => void;
}

function DocumentFontPreference({
  documentFont,
  onDocumentFontChange,
}: DocumentFontPreferenceProps) {
  const { t } = useLocalization();
  const options = DOCUMENT_FONT_OPTIONS.map((option) => ({
    className: option.className,
    label: "labelId" in option ? t(option.labelId) : option.label,
    value: option.value,
  }));

  return (
    <Field orientation="horizontal" className="has-[>[data-slot=field-content]]:items-center">
      <FieldContent>
        <FieldTitle>{t("preferences.documentFont.label")}</FieldTitle>
        <FieldDescription>{t("preferences.documentFont.description")}</FieldDescription>
      </FieldContent>
      <Select
        items={options}
        value={documentFont}
        onValueChange={(value) => {
          if (value) {
            onDocumentFontChange(value);
          }
        }}
      >
        <SelectTrigger className="w-[220px]" aria-label={t("preferences.documentFont.label")}>
          <SelectValue>
            {(value: DocumentFont | null) => {
              const option = options.find((candidate) => candidate.value === value);

              return option ? <span className={option.className}>{option.label}</span> : null;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} className={option.className}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

interface AccentColorPreferenceProps {
  accentColor: AppearanceAccentColor;
  onAccentColorChange: (accentColor: AppearanceAccentColor) => void;
}

function AccentColorPreference({ accentColor, onAccentColorChange }: AccentColorPreferenceProps) {
  const { t } = useLocalization();
  const options = APPEARANCE_ACCENT_COLOR_OPTIONS.map(({ labelId, value }) => ({
    label: t(labelId),
    value,
  }));

  return (
    <Field orientation="horizontal" className="has-[>[data-slot=field-content]]:items-center">
      <FieldContent>
        <FieldTitle>{t("preferences.accentColor.label")}</FieldTitle>
      </FieldContent>
      <Select
        items={options}
        value={accentColor}
        onValueChange={(value) => {
          if (value) {
            onAccentColorChange(value);
          }
        }}
      >
        <SelectTrigger className="w-[180px]" aria-label={t("preferences.accentColor.label")}>
          <SelectValue>
            {(value: AppearanceAccentColor | null) => {
              const option = options.find((candidate) => candidate.value === value);

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
            {options.map((option) => (
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
