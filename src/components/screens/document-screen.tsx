import { useCallback, useLayoutEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getActiveDocumentKey, openMarkdownDocument } from "@/features/document";
import {
  EMPTY_HEADING_OUTLINE,
  HeadingOutline,
  MilkdownEditor,
  type HeadingOutlineState,
  type MilkdownEditorBridge,
} from "@/features/editor";
import { useSettingsStore } from "@/features/preferences";
import {
  documentEditorBridge,
  getSessionFolderPath,
  notifyOpenMarkdownFileError,
  openMarkdownFileAtPath,
  retainEditorMarkdown,
  useSessionStore,
  type DocumentTab,
} from "@/features/session";
import { useLocalization } from "@/lib/i18n";
import { getPathIdentityKey } from "@/lib/path";

interface DocumentScreenProps {
  tab: DocumentTab;
  active: boolean;
  wikiCompletionPaths: string[];
}

const handleOpenMarkdownPath = async (path: string, heading?: string) => {
  try {
    const opened = await openMarkdownFileAtPath(path, { preview: true });
    if (opened && heading) documentEditorBridge.requestHeading(path, heading);
    return opened;
  } catch (error) {
    notifyOpenMarkdownFileError(error);
    return false;
  }
};

export function DocumentScreen({ active, tab, wikiCompletionPaths }: DocumentScreenProps) {
  const { t } = useLocalization();
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const displayCodeBlockLineNumbers = useSettingsStore(
    (state) => state.displayCodeBlockLineNumbers,
  );
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);
  const documentFont = useSettingsStore((state) => state.documentFont);
  const textSize = useSettingsStore((state) => state.textSize);
  const lineSpacing = useSettingsStore((state) => state.lineSpacing);
  const outlineDepth = useSettingsStore((state) => state.outlineDepth);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const folderContextPath = useSessionStore(getSessionFolderPath);
  const markDocumentDirty = useSessionStore((state) => state.markDocumentDirty);
  const { document, loadId, viewState } = tab;
  const documentKey = getActiveDocumentKey(document);
  const viewportKey = document.status === "saved" ? getPathIdentityKey(document.path) : document.id;
  const editorKey = `${documentKey}:${loadId}`;
  const [publishedOutline, setPublishedOutline] = useState<{
    editorKey: string;
    outline: HeadingOutlineState;
  } | null>(null);
  const headingOutline =
    publishedOutline?.editorKey === editorKey ? publishedOutline.outline : EMPTY_HEADING_OUTLINE;
  // Prevents MilkdownEditor from remounting plugins due to ref identity changes across renders.
  const setEditorBridgeRef = useCallback(
    (bridge: MilkdownEditorBridge | null) => {
      if (!bridge) retainEditorMarkdown(documentKey);
      documentEditorBridge.set(documentKey, bridge);
    },
    [documentKey],
  );

  useLayoutEffect(() => {
    if (active) {
      documentEditorBridge.show(documentKey);
    }
  }, [active, documentKey]);

  return (
    <section
      aria-label={t("documentScreen.label")}
      data-testid={active ? "active-document-host" : "inactive-document-host"}
      className="flex size-full"
    >
      <Card className="min-h-0 min-w-0 flex-1 gap-0 py-0">
        <CardContent className="relative min-h-0 flex-1 p-0">
          <ScrollArea
            key={viewportKey}
            className="min-h-0 flex-1"
            data-testid="document-surface-scroll-area"
          >
            <MilkdownEditor
              key={editorKey}
              ref={setEditorBridgeRef}
              initialMarkdown={document.content}
              initialViewState={viewState}
              documentPath={document.status === "saved" ? document.path : null}
              folderContextPath={folderContextPath}
              onOpenMarkdownPath={handleOpenMarkdownPath}
              onReadMarkdownPath={async (path) => (await openMarkdownDocument(path)).content}
              wikiCompletionPaths={wikiCompletionPaths}
              autoPairBracketsAndQuotes={autoPairBracketsAndQuotes}
              displayCodeBlockLineNumbers={displayCodeBlockLineNumbers}
              softWrapCodeBlocks={softWrapCodeBlocks}
              onCodeBlockSettingChange={updateSetting}
              documentFont={documentFont}
              textSize={textSize}
              lineSpacing={lineSpacing}
              onContentChanged={() => {
                markDocumentDirty(documentKey);
                documentEditorBridge.fireContentChanged(documentKey);
              }}
              onCommandStateChanged={documentEditorBridge.fireCommandStateChanged}
              onDocumentStatusChanged={documentEditorBridge.fireDocumentStatusChanged}
              onHeadingOutlineChanged={(outline) => setPublishedOutline({ editorKey, outline })}
            />
          </ScrollArea>
          <HeadingOutline
            depth={outlineDepth}
            onDepthChange={(depth) => updateSetting("outlineDepth", depth)}
            onNavigate={(position) =>
              documentEditorBridge.navigateToOutlineHeading(documentKey, position)
            }
            outline={headingOutline}
          />
        </CardContent>
      </Card>
    </section>
  );
}
