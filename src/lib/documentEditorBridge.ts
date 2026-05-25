import type { MilkdownEditorBridge } from "@/features/editor";
import type { AppCommandId, EditorCommandState } from "@/features/commands/types";

interface ActiveEditorBridgeState {
  bridge: MilkdownEditorBridge;
  documentKey: string;
}

let activeEditorBridge: ActiveEditorBridgeState | null = null;
let editorBridgeVersion = 0;
const editorBridgeListeners = new Set<() => void>();

export const inactiveEditorCommandState: EditorCommandState = {
  enabledCommands: {},
  hasActiveEditor: false,
  hasSelection: false,
  hasTableSelection: false,
};

export const setActiveDocumentEditorBridge = (
  documentKey: string,
  bridge: MilkdownEditorBridge | null,
) => {
  if (!bridge) {
    if (activeEditorBridge?.documentKey === documentKey) {
      activeEditorBridge = null;
      notifyActiveDocumentEditorCommandStateChanged();
    }

    return;
  }

  activeEditorBridge = { bridge, documentKey };
  notifyActiveDocumentEditorCommandStateChanged();
};

export const getActiveDocumentEditorMarkdown = (documentKey: string) => {
  if (activeEditorBridge?.documentKey !== documentKey) {
    return null;
  }

  return activeEditorBridge.bridge.getMarkdown();
};

export const getActiveDocumentEditorCommandState = (documentKey: string): EditorCommandState => {
  if (activeEditorBridge?.documentKey !== documentKey) {
    return inactiveEditorCommandState;
  }

  return (
    activeEditorBridge.bridge.getCommandState?.() ?? {
      ...inactiveEditorCommandState,
      hasActiveEditor: true,
    }
  );
};

export const runActiveDocumentEditorCommand = (documentKey: string, commandId: AppCommandId) => {
  if (activeEditorBridge?.documentKey !== documentKey) {
    return false;
  }

  return activeEditorBridge.bridge.runCommand?.(commandId) ?? false;
};

export const resetActiveDocumentEditorBridge = () => {
  activeEditorBridge = null;
  notifyActiveDocumentEditorCommandStateChanged();
};

export const notifyActiveDocumentEditorCommandStateChanged = () => {
  editorBridgeVersion += 1;

  for (const listener of editorBridgeListeners) {
    listener();
  }
};

export const subscribeActiveDocumentEditorCommandState = (listener: () => void) => {
  editorBridgeListeners.add(listener);

  return () => {
    editorBridgeListeners.delete(listener);
  };
};

export const getActiveDocumentEditorCommandStateVersion = () => editorBridgeVersion;
