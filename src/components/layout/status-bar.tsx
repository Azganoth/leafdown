import { useSyncExternalStore } from "react";

import {
  COMMAND_DEFINITIONS,
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
  type DocumentEncoding,
  type LineEnding,
} from "@/features/document";
import type { EditorDocumentStatus, TextStatistics } from "@/features/editor";
import { useSettingsStore } from "@/features/preferences";
import { documentEditorBridge } from "@/features/session";

const WORDS_PER_MINUTE = 200;
const BLOCK_PATH_SEPARATOR = " › ";
const LINE_ENDING_COMMAND_IDS = [
  "edit.lineEnding.crlf",
  "edit.lineEnding.lf",
] as const satisfies readonly AppCommandId[];
const ENCODING_LABELS = {
  "UTF-8": "UTF-8",
  "UTF-16LE": "UTF-16 LE",
  "UTF-16BE": "UTF-16 BE",
} as const satisfies Record<DocumentEncoding["name"], string>;

const numberFormat = new Intl.NumberFormat();

const subscribeToDocumentStatusChanges = (listener: () => void) => {
  const listenerDisposable = documentEditorBridge.onDidChangeDocumentStatus(listener);

  return () => listenerDisposable.dispose();
};

const formatCount = (count: number, singular: string, plural: string) =>
  `${numberFormat.format(count)} ${count === 1 ? singular : plural}`;

const formatPartialCount = (
  selected: number | null,
  total: number,
  singular: string,
  plural: string,
) =>
  selected === null
    ? formatCount(total, singular, plural)
    : `${numberFormat.format(selected)} of ${formatCount(total, singular, plural)}`;

const formatWordCount = (document: TextStatistics, selection: TextStatistics | null) =>
  formatPartialCount(selection?.words ?? null, document.words, "word", "words");

const formatCharacterCount = (document: TextStatistics, selection: TextStatistics | null) => {
  const characters = formatPartialCount(
    selection?.characters ?? null,
    document.characters,
    "character",
    "characters",
  );
  const charactersWithoutSpaces = formatPartialCount(
    selection?.charactersWithoutSpaces ?? null,
    document.charactersWithoutSpaces,
    "character",
    "characters",
  );

  return `${characters}, ${charactersWithoutSpaces} without spaces`;
};

const formatReadingTime = (words: number) => {
  const minutes = Math.round(words / WORDS_PER_MINUTE);

  return minutes < 1 ? "<1 min read" : `~${numberFormat.format(minutes)} min read`;
};

const formatEncoding = ({ name, bom }: DocumentEncoding) =>
  name === "UTF-8" && bom ? "UTF-8 with BOM" : ENCODING_LABELS[name];

interface StatusBarControlProps {
  commandState: (commandId: AppCommandId) => CommandState;
  onExecute: (commandId: AppCommandId) => void;
}

interface StatusBarProps extends StatusBarControlProps {
  activeDocument: ActiveDocumentState;
}

export function StatusBar({ activeDocument, commandState, onExecute }: StatusBarProps) {
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
      aria-label="Status bar"
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
        <span data-testid="status-bar-encoding">{formatEncoding(activeDocument.encoding)}</span>
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
  const characterCount = formatCharacterCount(status.document, status.selection);

  return (
    <>
      <span>{formatReadingTime(status.document.words)}</span>
      <Tooltip>
        <TooltipTrigger render={<span data-testid="status-bar-word-count" />}>
          {formatWordCount(status.document, status.selection)}
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
            aria-label={`Line ending: ${label}`}
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
              {COMMAND_DEFINITIONS[commandId].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ZoomReset({ commandState, onExecute }: StatusBarControlProps) {
  const zoom = useCommandUIStore((state) => state.zoom);

  if (!commandState("view.resetZoom").enabled) {
    return null;
  }

  const label = `${Math.round(zoom * 100)}%`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`Zoom ${label}, reset zoom`}
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
      <TooltipContent side="top">{COMMAND_DEFINITIONS["view.resetZoom"].label}</TooltipContent>
    </Tooltip>
  );
}
