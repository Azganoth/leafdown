import type { MilkdownEditorBridge } from "@/features/editor";
// Deep import rather than the `@/features/editor` root: the root exports `MilkdownEditor`,
// so importing the command contract through it would pull Milkdown and Shiki into every
// consumer of `@/features/session`, most of which never touch the editor.
// `commands/contract` is the Milkdown-free half of that API.
import {
  INACTIVE_EDITOR_COMMAND_STATE,
  READY_DISABLED_EDITOR_COMMAND_STATE,
  type EditorCommandId,
  type EditorCommandState,
} from "@/features/editor/commands/contract";
import { SignalSource } from "@/lib/signal";

interface ActiveDocumentEditorBridgeEntry {
  bridge: MilkdownEditorBridge;
  documentKey: string;
}

class DocumentEditorBridgeStore {
  private activeBridgeEntry: ActiveDocumentEditorBridgeEntry | null = null;
  private commandStateVersion = 0;
  private readonly commandStateChanged = new SignalSource<void>();

  readonly onDidChangeCommandState = this.commandStateChanged.signal;

  set = (documentKey: string, bridge: MilkdownEditorBridge | null) => {
    if (!bridge) {
      if (this.activeBridgeEntry?.documentKey === documentKey) {
        this.activeBridgeEntry = null;
        this.fireCommandStateChanged();
      }

      return;
    }

    this.activeBridgeEntry = { bridge, documentKey };
    this.fireCommandStateChanged();
  };

  getMarkdown = (documentKey: string) => {
    if (this.activeBridgeEntry?.documentKey !== documentKey) {
      return null;
    }

    return this.activeBridgeEntry.bridge.getMarkdown();
  };

  getCommandState = (documentKey: string): EditorCommandState =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.getCommandState?.() ?? READY_DISABLED_EDITOR_COMMAND_STATE)
      : INACTIVE_EDITOR_COMMAND_STATE;

  runCommand = (documentKey: string, commandId: EditorCommandId) => {
    if (this.activeBridgeEntry?.documentKey !== documentKey) {
      return false;
    }

    return this.activeBridgeEntry.bridge.runCommand?.(commandId) ?? false;
  };

  clear = () => {
    this.activeBridgeEntry = null;
    this.fireCommandStateChanged();
  };

  fireCommandStateChanged = () => {
    this.commandStateVersion += 1;
    this.commandStateChanged.notify();
  };

  getCommandStateVersion = () => this.commandStateVersion;
}

export const documentEditorBridge = new DocumentEditorBridgeStore();
