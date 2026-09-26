import { useSyncExternalStore } from "react";

import {
  getCommandLabelId,
  useCommandUIStore,
  type AppCommandId,
  type CommandState,
} from "@/commands";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getActiveDocumentKey,
  type ActiveDocumentState,
  type LineEnding,
} from "@/features/document";
import type { EditorDocumentStatus, TextStatistics } from "@/features/editor";
import { useSettingsStore } from "@/features/preferences";
import { documentEditorBridge } from "@/features/session";
import type { Translate } from "@/lib/i18n/localizer";
import { useLocalization } from "@/lib/i18n/useLocalization";

const WORDS_PER_MINUTE = 200;
const BLOCK_PATH_SEPARATOR = " › ";
const LINE_ENDING_COMMAND_IDS = [
  "edit.lineEnding.crlf",
  "edit.lineEnding.lf",
] as const satisfies readonly AppCommandId[];

const subscribeToDocumentStatusChanges = (listener: () => void) => {
  const listenerDisposable = documentEditorBridge.onDidChangeDocumentStatus(listener);

  return () => listenerDisposable.dispose();
};

const formatPartialCount = (
  t: Translate,
  countId: "statusBar.words" | "statusBar.characters",
  selected: number | null,
  total: number,
) =>
  selected === null
    ? t(countId, { count: total })
    : t("statusBar.partialCount", { selected, total: t(countId, { count: total }) });

const formatWordCount = (
  t: Translate,
  document: TextStatistics,
  selection: TextStatistics | null,
) => formatPartialCount(t, "statusBar.words", selection?.words ?? null, document.words);

const formatCharacterCount = (
  t: Translate,
  document: TextStatistics,
  selection: TextStatistics | null,
) =>
  t("statusBar.characterSummary", {
    characters: formatPartialCount(
      t,
      "statusBar.characters",
      selection?.characters ?? null,
      document.characters,
    ),
    charactersWithoutSpaces: formatPartialCount(
      t,
      "statusBar.characters",
      selection?.charactersWithoutSpaces ?? null,
      document.charactersWithoutSpaces,
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
}

export function StatusBar({ activeDocument, commandState, onExecute }: StatusBarProps) {
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
        {status && <DocumentMetrics status={status} />}
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
  blockPath: readonly string[];
}

function BlockPath({ blockPath }: BlockPathProps) {
  const path = blockPath.join(BLOCK_PATH_SEPARATOR);

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

function ZoomReset({ commandState, onExecute }: StatusBarControlProps) {
  const { t } = useLocalization();
  const zoom = useCommandUIStore((state) => state.zoom);

  if (!commandState("view.resetZoom").enabled) {
    return null;
  }

  const label = t("statusBar.zoom", { zoom: Math.round(zoom * 100) / 100 });

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
