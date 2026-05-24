import { MilkdownEditor } from "@/features/editor";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { setActiveDocumentEditorBridge } from "@/lib/documentEditorBridge";
import { getActiveDocumentKey, useSessionStore, type ActiveDocumentState } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useCallback } from "react";

interface DocumentScreenProps {
  document: ActiveDocumentState;
}

export function DocumentScreen({ document }: DocumentScreenProps) {
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);
  const setActiveDocumentContent = useSessionStore((state) => state.setActiveDocumentContent);
  const documentKey = getActiveDocumentKey(document);
  const setEditorBridgeRef = useCallback(
    (bridge: Parameters<typeof setActiveDocumentEditorBridge>[1]) => {
      setActiveDocumentEditorBridge(documentKey, bridge);
    },
    [documentKey],
  );

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
          autoPairBracketsAndQuotes={autoPairBracketsAndQuotes}
          softWrapCodeBlocks={softWrapCodeBlocks}
          onMarkdownUpdated={(update) => setActiveDocumentContent(documentKey, update.markdown)}
        />
      </section>
    </ScrollArea>
  );
}
