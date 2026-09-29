import type {
  EditorDocumentStatus,
  EditorViewState,
  MilkdownEditorBridge,
} from "@/features/editor";
import {
  INACTIVE_EDITOR_COMMAND_STATE,
  READY_DISABLED_EDITOR_COMMAND_STATE,
  type EditorCommandId,
  type EditorCommandState,
} from "@/features/editor/commands/contract";
import { isSamePath } from "@/lib/path";
import { SignalSource } from "@/lib/signal";

interface ActiveDocumentEditorBridgeEntry {
  bridge: MilkdownEditorBridge;
  documentKey: string;
}

class DocumentEditorBridgeStore {
  private activeBridgeEntry: ActiveDocumentEditorBridgeEntry | null = null;
  private pendingHeading: { documentKey: string; heading: string } | null = null;
  private readonly commandStateChanged = new SignalSource();
  private readonly documentStatusChanged = new SignalSource();

  readonly onDidChangeCommandState = this.commandStateChanged.signal;
  readonly onDidChangeDocumentStatus = this.documentStatusChanged.signal;

  set = (documentKey: string, bridge: MilkdownEditorBridge | null) => {
    if (!bridge) {
      if (this.activeBridgeEntry?.documentKey === documentKey) {
        this.activeBridgeEntry = null;
        this.fireCommandStateChanged();
        this.fireDocumentStatusChanged();
      }

      return;
    }

    this.activeBridgeEntry = { bridge, documentKey };
    if (this.pendingHeading && isSamePath(this.pendingHeading.documentKey, documentKey)) {
      bridge.navigateToHeading?.(this.pendingHeading.heading);
      this.pendingHeading = null;
    }
    this.fireCommandStateChanged();
    this.fireDocumentStatusChanged();
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

  getDocumentStatus = (documentKey: string): EditorDocumentStatus | null =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.getDocumentStatus?.() ?? null)
      : null;

  getViewState = (documentKey: string): EditorViewState | null =>
    this.activeBridgeEntry?.documentKey === documentKey
      ? (this.activeBridgeEntry.bridge.getViewState?.() ?? null)
      : null;

  insertLink = (documentKey: string, label: string, target: string) => {
    if (this.activeBridgeEntry?.documentKey !== documentKey) {
      return false;
    }

    return this.activeBridgeEntry.bridge.insertLink?.(label, target) ?? false;
  };

  requestHeading = (documentKey: string, heading: string) => {
    if (this.activeBridgeEntry && isSamePath(this.activeBridgeEntry.documentKey, documentKey)) {
      this.activeBridgeEntry.bridge.navigateToHeading?.(heading);
      return;
    }
    this.pendingHeading = { documentKey, heading };
  };

  runCommand = (documentKey: string, commandId: EditorCommandId) => {
    if (this.activeBridgeEntry?.documentKey !== documentKey) {
      return false;
    }

    return this.activeBridgeEntry.bridge.runCommand?.(commandId) ?? false;
  };

  clear = () => {
    this.activeBridgeEntry = null;
    this.pendingHeading = null;
    this.fireCommandStateChanged();
    this.fireDocumentStatusChanged();
  };

  fireCommandStateChanged = () => {
    this.commandStateChanged.notify();
  };

  fireDocumentStatusChanged = () => {
    this.documentStatusChanged.notify();
  };
}

export const documentEditorBridge = new DocumentEditorBridgeStore();
