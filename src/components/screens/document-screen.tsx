import { useCallback } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getActiveDocumentKey,
  getOpenMarkdownFileErrorMessage,
  type ActiveDocumentState,
} from "@/features/document";
import { MilkdownEditor, type MilkdownEditorBridge } from "@/features/editor";
import { useSettingsStore } from "@/features/preferences";
import { documentEditorBridge, openMarkdownFileAtPath, useSessionStore } from "@/features/session";
import { notifyError } from "@/lib/toast";

interface DocumentScreenProps {
  activeDocument: ActiveDocumentState;
}

const handleOpenMarkdownPath = async (path: string) => {
  try {
    return await openMarkdownFileAtPath(path);
  } catch (error) {
    notifyError(getOpenMarkdownFileErrorMessage(error));
    return false;
  }
};

export function DocumentScreen({ activeDocument }: DocumentScreenProps) {
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);
  const folderContextPath = useSessionStore((state) => state.folderContext?.path ?? null);
  const setActiveDocumentContent = useSessionStore((state) => state.setActiveDocumentContent);
  const markActiveDocumentDirty = useSessionStore((state) => state.markActiveDocumentDirty);
  const documentKey = getActiveDocumentKey(activeDocument);
  // Prevents MilkdownEditor from remounting plugins due to ref identity changes across renders.
  const setEditorBridgeRef = useCallback(
    (bridge: MilkdownEditorBridge | null) => {
      documentEditorBridge.set(documentKey, bridge);
    },
    [documentKey],
  );
  return (
    <ScrollArea className="h-full w-full" data-testid="document-surface-scroll-area">
      <section
        aria-label="Active document"
        data-testid="active-document-host"
        className="min-h-full w-full bg-background"
      >
        <MilkdownEditor
          key={documentKey}
          ref={setEditorBridgeRef}
          initialMarkdown={activeDocument.content}
          documentPath={activeDocument.status === "saved" ? activeDocument.path : null}
          folderContextPath={folderContextPath}
          onOpenMarkdownPath={handleOpenMarkdownPath}
          autoPairBracketsAndQuotes={autoPairBracketsAndQuotes}
          softWrapCodeBlocks={softWrapCodeBlocks}
          onMarkdownUpdated={(update) => setActiveDocumentContent(documentKey, update.markdown)}
          onContentChanged={() => markActiveDocumentDirty(documentKey)}
          onCommandStateChanged={documentEditorBridge.fireCommandStateChanged}
        />
      </section>
    </ScrollArea>
  );
}
