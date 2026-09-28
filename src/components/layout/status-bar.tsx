import { useSyncExternalStore } from "react";

import {
  getCommandLabelId,
  useCommandUIStore,
  type AppCommandId,
  type CommandState,
  type ReopenWithEncodingControl,
} from "@/commands";
import { Button } from "@/components/ui/button";
import {
  DROPDOWN_MENU_SCROLL_VIEWPORT_CLASS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ENCODING_CHOICES,
  formatDocumentEncoding,
  getActiveDocumentKey,
  type ActiveDocumentState,
  type TextEncodingName,
  type LineEnding,
} from "@/features/document";
import {
  formatBlockPathSegment,
  type BlockPathSegment,
  type EditorDocumentStatus,
  type TextStatistics,
} from "@/features/editor";
import { useSettingsStore } from "@/features/preferences";
import { documentEditorBridge } from "@/features/session";
import { useLocalization, type Translate } from "@/lib/i18n";

const WORDS_PER_MINUTE = 200;
const BLOCK_PATH_SEPARATOR = " › ";
const LINE_ENDING_COMMAND_IDS = [
  "edit.lineEnding.crlf",
  "edit.lineEnding.lf",
] as const satisfies readonly AppCommandId[];
const ENCODING_COMMAND_IDS = [
  "edit.encoding.file",
  "edit.encoding.utf8",
  "edit.encoding.utf8Bom",
] as const satisfies readonly AppCommandId[];

type DocumentFileState =
  | "changedOnDisk"
  | "missing"
  | "unsaved"
  | "unsavedChangedOnDisk"
  | "unsavedMissing";

const getDocumentFileState = (activeDocument: ActiveDocumentState): DocumentFileState | null => {
  const externalChange =
    activeDocument.status === "saved" ? activeDocument.externalChange?.kind : undefined;

  switch (externalChange) {
    case "missing":
      return activeDocument.isDirty ? "unsavedMissing" : "missing";
    case "modified":
      return activeDocument.isDirty ? "unsavedChangedOnDisk" : "changedOnDisk";
    case undefined:
      return activeDocument.isDirty ? "unsaved" : null;
  }
};

const subscribeToDocumentStatusChanges = (listener: () => void) => {
  const listenerDisposable = documentEditorBridge.onDidChangeDocumentStatus(listener);

  return () => listenerDisposable.dispose();
};

const formatWordCount = (
  t: Translate,
  document: TextStatistics,
  selection: TextStatistics | null,
) =>
  selection
    ? t("statusBar.selectedWords", { selected: selection.words, count: document.words })
    : t("statusBar.words", { count: document.words });

const formatCharacters = (t: Translate, count: number, selected: number | null) =>
  selected === null
    ? t("statusBar.characters", { count })
    : t("statusBar.selectedCharacters", { selected, count });

const formatCharacterCount = (
  t: Translate,
  document: TextStatistics,
  selection: TextStatistics | null,
) =>
  t("statusBar.characterSummary", {
    characters: formatCharacters(t, document.characters, selection?.characters ?? null),
    charactersWithoutSpaces: formatCharacters(
      t,
      document.charactersWithoutSpaces,
      selection?.charactersWithoutSpaces ?? null,
    ),
  });

const formatReadingTime = (t: Translate, words: number) => {
  const minutes = Math.round(words / WORDS_PER_MINUTE);

  return minutes < 1
    ? t("statusBar.readingTimeUnderMinute")
    : t("statusBar.readingTime", { minutes });
};

interface StatusBarControlProps {
  commandState: (commandId: AppCommandId) => CommandState;
  onExecute: (commandId: AppCommandId) => void;
}

interface StatusBarProps extends StatusBarControlProps {
  activeDocument: ActiveDocumentState;
  reopenWithEncoding: ReopenWithEncodingControl;
}

export function StatusBar({
  activeDocument,
  commandState,
  onExecute,
  reopenWithEncoding,
}: StatusBarProps) {
  const { t } = useLocalization();
  const defaultLineEnding = useSettingsStore((state) => state.defaultNewDocumentLineEnding);
  const documentKey = getActiveDocumentKey(activeDocument);
  const getDocumentStatus = () => documentEditorBridge.getDocumentStatus(documentKey);
  const status = useSyncExternalStore(
    subscribeToDocumentStatusChanges,
    getDocumentStatus,
    getDocumentStatus,
  );

  return (
    <footer
      aria-label={t("statusBar.label")}
      data-status-bar
      data-testid="status-bar"
      className="flex h-(--status-bar-height) min-w-0 shrink-0 items-center gap-4 px-4 text-xs text-muted-foreground"
    >
      <div className="flex min-w-0 flex-1 items-center">
        {status?.blockPath && status.blockPath.length > 0 && (
          <BlockPath blockPath={status.blockPath} />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4 whitespace-nowrap">
        <DocumentState activeDocument={activeDocument} />
        {status && <DocumentMetrics status={status} />}
        <EncodingMenu
          activeDocument={activeDocument}
          commandState={commandState}
          onExecute={onExecute}
          reopenWithEncoding={reopenWithEncoding}
        />
        <LineEndingMenu
          commandState={commandState}
          lineEnding={activeDocument.lineEnding ?? defaultLineEnding}
          onExecute={onExecute}
        />
        <ZoomReset commandState={commandState} onExecute={onExecute} />
      </div>
    </footer>
  );
}

interface BlockPathProps {
  blockPath: readonly BlockPathSegment[];
}

function BlockPath({ blockPath }: BlockPathProps) {
  const { t } = useLocalization();
  const path = blockPath
    .map((segment) => formatBlockPathSegment(segment, t))
    .join(BLOCK_PATH_SEPARATOR);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // Right-to-left flow puts the ellipsis before the path, keeping the innermost block
          // visible; the isolated inner run keeps the path itself reading left to right.
          <span
            data-testid="status-bar-block-path"
            className="min-w-0 truncate text-left [direction:rtl]"
          />
        }
      >
        <bdi dir="ltr">{path}</bdi>
      </TooltipTrigger>
      <TooltipContent side="top">{path}</TooltipContent>
    </Tooltip>
  );
}

interface DocumentStateProps {
  activeDocument: ActiveDocumentState;
}

function DocumentState({ activeDocument }: DocumentStateProps) {
  const { t } = useLocalization();
  const state = getDocumentFileState(activeDocument);

  if (!state) {
    return null;
  }

  return (
    <span data-testid="status-bar-document-state" className="flex items-center gap-1.5">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground" />
      {t("statusBar.documentState", { state })}
    </span>
  );
}

interface DocumentMetricsProps {
  status: EditorDocumentStatus;
}

function DocumentMetrics({ status }: DocumentMetricsProps) {
  const { t } = useLocalization();
  const characterCount = formatCharacterCount(t, status.document, status.selection);

  return (
    <>
      <span>{formatReadingTime(t, status.document.words)}</span>
      <Tooltip>
        <TooltipTrigger render={<span data-testid="status-bar-word-count" />}>
          {formatWordCount(t, status.document, status.selection)}
          <span className="sr-only">, {characterCount}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{characterCount}</TooltipContent>
      </Tooltip>
    </>
  );
}

interface LineEndingMenuProps extends StatusBarControlProps {
  lineEnding: LineEnding;
}

function LineEndingMenu({ commandState, lineEnding, onExecute }: LineEndingMenuProps) {
  const { t } = useLocalization();
  const label = lineEnding.toUpperCase();
  const checkedCommandId =
    LINE_ENDING_COMMAND_IDS.find((commandId) => {
      const state = commandState(commandId);
      return state.enabled && state.checked;
    }) ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("statusBar.lineEnding", { lineEnding: label })}
            size="xs"
            type="button"
            variant="ghost"
            className="-mx-2 font-normal text-muted-foreground"
          />
        }
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-auto">
        <DropdownMenuRadioGroup
          value={checkedCommandId}
          onValueChange={(commandId: AppCommandId) => onExecute(commandId)}
        >
          {LINE_ENDING_COMMAND_IDS.map((commandId) => (
            <DropdownMenuRadioItem
              key={commandId}
              value={commandId}
              disabled={!commandState(commandId).enabled}
            >
              {t(getCommandLabelId(commandId))}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EncodingMenu({
  activeDocument,
  commandState,
  onExecute,
  reopenWithEncoding,
}: StatusBarProps) {
  const localization = useLocalization();
  const { t } = localization;
  const label = formatDocumentEncoding(activeDocument.encoding, localization);
  const commandIds = ENCODING_COMMAND_IDS.filter(
    (commandId) => commandId !== "edit.encoding.file" || commandState(commandId).enabled,
  );
  const checkedCommandId =
    commandIds.find((commandId) => {
      const state = commandState(commandId);
      return state.enabled && state.checked;
    }) ?? "";
  const getItemLabel = (commandId: (typeof ENCODING_COMMAND_IDS)[number]) =>
    commandId === "edit.encoding.file" && activeDocument.status === "saved"
      ? formatDocumentEncoding(activeDocument.fileEncoding, localization)
      : t(getCommandLabelId(commandId));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("statusBar.encoding", { encoding: label })}
            data-testid="status-bar-encoding"
            size="xs"
            type="button"
            variant="ghost"
            className="-mx-2 font-normal text-muted-foreground"
          />
        }
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("statusBar.saveWithEncoding")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={checkedCommandId}
            onValueChange={(commandId: AppCommandId) => onExecute(commandId)}
          >
            {commandIds.map((commandId) => (
              <DropdownMenuRadioItem
                key={commandId}
                value={commandId}
                disabled={!commandState(commandId).enabled}
              >
                {getItemLabel(commandId)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!reopenWithEncoding.state.enabled}>
            {t("statusBar.reopenWithEncoding")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="overflow-hidden">
            <ScrollArea viewportClassName={DROPDOWN_MENU_SCROLL_VIEWPORT_CLASS}>
              <DropdownMenuRadioGroup
                value={reopenWithEncoding.checkedEncoding ?? ""}
                onValueChange={(encoding: TextEncodingName) => reopenWithEncoding.reopen(encoding)}
              >
                {ENCODING_CHOICES.map((choice) => (
                  <DropdownMenuRadioItem key={choice.name} value={choice.name}>
                    {t(choice.labelId)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </ScrollArea>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ZoomReset({ commandState, onExecute }: StatusBarControlProps) {
  const { formatNumber, t } = useLocalization();
  const zoom = useCommandUIStore((state) => state.zoom);

  if (!commandState("view.resetZoom").enabled) {
    return null;
  }

  const label = formatNumber(zoom, { style: "percent" });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={t("statusBar.zoomReset", { zoom: label })}
            size="xs"
            type="button"
            variant="ghost"
            className="-mx-2 font-normal text-muted-foreground"
            onClick={() => onExecute("view.resetZoom")}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent side="top">{t(getCommandLabelId("view.resetZoom"))}</TooltipContent>
    </Tooltip>
  );
}
