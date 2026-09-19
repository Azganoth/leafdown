import type { MilkdownEditorBridge } from "@/features/editor";
// Deep import by design; see @/features/editor/commands/contract.ts.
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
  private readonly commandStateChanged = new SignalSource();

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

  insertLink = (documentKey: string, label: string, target: string) => {
    if (this.activeBridgeEntry?.documentKey !== documentKey) {
      return false;
    }

    return this.activeBridgeEntry.bridge.insertLink?.(label, target) ?? false;
  };

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
    this.commandStateChanged.notify();
  };
}

export const documentEditorBridge = new DocumentEditorBridgeStore();
