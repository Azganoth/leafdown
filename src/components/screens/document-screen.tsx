import { useCallback } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getActiveDocumentKey, type ActiveDocumentState } from "@/features/document";
import { MilkdownEditor, type MilkdownEditorBridge } from "@/features/editor";
import { useSettingsStore } from "@/features/preferences";
import {
  documentEditorBridge,
  notifyOpenMarkdownFileError,
  openMarkdownFileAtPath,
  useSessionStore,
} from "@/features/session";
import { useLocalization } from "@/lib/i18n";

interface DocumentScreenProps {
  activeDocument: ActiveDocumentState;
}

const handleOpenMarkdownPath = async (path: string) => {
  try {
    return await openMarkdownFileAtPath(path);
  } catch (error) {
    notifyOpenMarkdownFileError(error);
    return false;
  }
};

export function DocumentScreen({ activeDocument }: DocumentScreenProps) {
  const { t } = useLocalization();
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const displayCodeBlockLineNumbers = useSettingsStore(
    (state) => state.displayCodeBlockLineNumbers,
  );
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);
  const documentFont = useSettingsStore((state) => state.documentFont);
  const textSize = useSettingsStore((state) => state.textSize);
  const lineSpacing = useSettingsStore((state) => state.lineSpacing);
  const folderContextPath = useSessionStore((state) => state.folderContext?.path ?? null);
  const setActiveDocumentContent = useSessionStore((state) => state.setActiveDocumentContent);
  const markActiveDocumentDirty = useSessionStore((state) => state.markActiveDocumentDirty);
  const loadId = useSessionStore((state) => state.activeDocumentLoadId);
  const initialViewState = useSessionStore((state) => state.activeDocumentViewState);
  const documentKey = getActiveDocumentKey(activeDocument);
  // Prevents MilkdownEditor from remounting plugins due to ref identity changes across renders.
  const setEditorBridgeRef = useCallback(
    (bridge: MilkdownEditorBridge | null) => {
      documentEditorBridge.set(documentKey, bridge);
    },
    [documentKey],
  );
  return (
    <section
      aria-label={t("documentScreen.label")}
      data-testid="active-document-host"
      className="flex size-full"
    >
      <Card className="min-h-0 min-w-0 flex-1 gap-0 py-0">
        <CardContent className="min-h-0 flex-1 p-0">
          <ScrollArea className="min-h-0 flex-1" data-testid="document-surface-scroll-area">
            <MilkdownEditor
              key={`${documentKey}:${loadId}`}
              ref={setEditorBridgeRef}
              initialMarkdown={activeDocument.content}
              initialViewState={initialViewState}
              documentPath={activeDocument.status === "saved" ? activeDocument.path : null}
              folderContextPath={folderContextPath}
              onOpenMarkdownPath={handleOpenMarkdownPath}
              autoPairBracketsAndQuotes={autoPairBracketsAndQuotes}
              displayCodeBlockLineNumbers={displayCodeBlockLineNumbers}
              softWrapCodeBlocks={softWrapCodeBlocks}
              documentFont={documentFont}
              textSize={textSize}
              lineSpacing={lineSpacing}
              onMarkdownUpdated={(update) => setActiveDocumentContent(documentKey, update.markdown)}
              onContentChanged={() => markActiveDocumentDirty(documentKey)}
              onCommandStateChanged={documentEditorBridge.fireCommandStateChanged}
              onDocumentStatusChanged={documentEditorBridge.fireDocumentStatusChanged}
            />
          </ScrollArea>
        </CardContent>
      </Card>
    </section>
  );
}
