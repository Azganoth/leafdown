import { useSyncExternalStore } from "react";

import {
  COMMAND_DEFINITIONS,
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
import type { EditorDocumentStatus, TextStatistics } from "@/features/editor";
import { useSettingsStore } from "@/features/preferences";
import { documentEditorBridge } from "@/features/session";

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

function EncodingMenu({
  activeDocument,
  commandState,
  onExecute,
  reopenWithEncoding,
}: StatusBarProps) {
  const label = formatDocumentEncoding(activeDocument.encoding);
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
      ? formatDocumentEncoding(activeDocument.fileEncoding)
      : COMMAND_DEFINITIONS[commandId].label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Encoding: ${label}`}
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
          <DropdownMenuLabel>Save with encoding</DropdownMenuLabel>
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
            Reopen with encoding
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="overflow-hidden">
            <ScrollArea viewportClassName={DROPDOWN_MENU_SCROLL_VIEWPORT_CLASS}>
              <DropdownMenuRadioGroup
                value={reopenWithEncoding.checkedEncoding ?? ""}
                onValueChange={(encoding: TextEncodingName) => reopenWithEncoding.reopen(encoding)}
              >
                {ENCODING_CHOICES.map((choice) => (
                  <DropdownMenuRadioItem key={choice.name} value={choice.name}>
                    {choice.label}
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
