import { ScrollArea } from "@/components/ui/ScrollArea";
import {
  getActiveDocumentKey,
  getOpenMarkdownFileErrorMessage,
  showDocumentIoErrorToast,
  type ActiveDocumentState,
} from "@/features/document";
import { MilkdownEditor } from "@/features/editor";
import { useSettingsStore } from "@/features/preferences";
import {
  notifyActiveDocumentEditorCommandStateChanged,
  openMarkdownFilePath,
  setActiveDocumentEditorBridge,
  useSessionStore,
} from "@/features/session";
import { useCallback } from "react";
import { toast } from "sonner";

interface DocumentScreenProps {
  document: ActiveDocumentState;
}

export function DocumentScreen({ document }: DocumentScreenProps) {
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);
  const folderContextPath = useSessionStore((state) => state.folderContext?.path ?? null);
  const setActiveDocumentContent = useSessionStore((state) => state.setActiveDocumentContent);
  const markActiveDocumentDirty = useSessionStore((state) => state.markActiveDocumentDirty);
  const documentKey = getActiveDocumentKey(document);
  const setEditorBridgeRef = useCallback(
    (bridge: Parameters<typeof setActiveDocumentEditorBridge>[1]) => {
      setActiveDocumentEditorBridge(documentKey, bridge);
    },
    [documentKey],
  );
  const handleOpenMarkdownPath = async (path: string) => {
    try {
      return await openMarkdownFilePath(path);
    } catch (error: unknown) {
      showDocumentIoErrorToast(toast.error, getOpenMarkdownFileErrorMessage(error));
      return false;
    }
  };

  return (
    <ScrollArea className="h-full w-full" data-testid="document-surface-scroll-area" type="scroll">
      <section
        aria-label="Active document"
        data-testid="active-document-host"
        className="min-h-full w-full bg-background"
      >
        <MilkdownEditor
          ref={setEditorBridgeRef}
          documentKey={documentKey}
          initialMarkdown={document.content}
          documentPath={document.status === "saved" ? document.path : null}
          folderContextPath={folderContextPath}
          onOpenMarkdownPath={handleOpenMarkdownPath}
          autoPairBracketsAndQuotes={autoPairBracketsAndQuotes}
          softWrapCodeBlocks={softWrapCodeBlocks}
          onMarkdownUpdated={(update) => setActiveDocumentContent(documentKey, update.markdown)}
          onContentTransaction={() => markActiveDocumentDirty(documentKey)}
          onCommandStateChanged={notifyActiveDocumentEditorCommandStateChanged}
        />
      </section>
    </ScrollArea>
  );
}
