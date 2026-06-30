import {
  INACTIVE_EDITOR_COMMAND_STATE,
  READY_DISABLED_EDITOR_COMMAND_STATE,
  type EditorCommandId,
  type EditorCommandState,
  type MilkdownEditorBridge,
} from "@/features/editor";
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
