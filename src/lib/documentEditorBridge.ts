import type { MilkdownEditorBridge } from "@/features/editor";

interface ActiveEditorBridgeState {
  bridge: MilkdownEditorBridge;
  documentKey: string;
}

let activeEditorBridge: ActiveEditorBridgeState | null = null;

export const setActiveDocumentEditorBridge = (
  documentKey: string,
  bridge: MilkdownEditorBridge | null,
) => {
  if (!bridge) {
    if (activeEditorBridge?.documentKey === documentKey) {
      activeEditorBridge = null;
    }

    return;
  }

  activeEditorBridge = { bridge, documentKey };
};

export const getActiveDocumentEditorMarkdown = (documentKey: string) => {
  if (activeEditorBridge?.documentKey !== documentKey) {
    return null;
  }

  return activeEditorBridge.bridge.getMarkdown();
};

export const resetActiveDocumentEditorBridge = () => {
  activeEditorBridge = null;
};
