import { useCallback, useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getActiveDocumentKey,
  openMarkdownDocument,
  type ActiveDocumentState,
} from "@/features/document";
import {
  EMPTY_HEADING_OUTLINE,
  HeadingOutline,
  MilkdownEditor,
  type HeadingOutlineState,
  type MilkdownEditorBridge,
} from "@/features/editor";
import type { ArticleTreeNode } from "@/features/folder-context";
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

const handleOpenMarkdownPath = async (path: string, heading?: string) => {
  try {
    const opened = await openMarkdownFileAtPath(path);
    if (opened && heading) documentEditorBridge.requestHeading(path, heading);
    return opened;
  } catch (error) {
    notifyOpenMarkdownFileError(error);
    return false;
  }
};

const articlePaths = (nodes: ArticleTreeNode[]): string[] =>
  nodes.flatMap((node) => (node.kind === "file" ? [node.path] : articlePaths(node.children)));

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
  const outlineDepth = useSettingsStore((state) => state.outlineDepth);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const folderContext = useSessionStore((state) => state.folderContext);
  const folderContextPath = folderContext?.path ?? null;
  const wikiCompletionPaths = useMemo(
    () => (folderContext ? articlePaths(folderContext.tree.children) : []),
    [folderContext],
  );
  const setActiveDocumentContent = useSessionStore((state) => state.setActiveDocumentContent);
  const markActiveDocumentDirty = useSessionStore((state) => state.markActiveDocumentDirty);
  const loadId = useSessionStore((state) => state.activeDocumentLoadId);
  const initialViewState = useSessionStore((state) => state.activeDocumentViewState);
  const documentKey = getActiveDocumentKey(activeDocument);
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
        <CardContent className="relative min-h-0 flex-1 p-0">
          <ScrollArea className="min-h-0 flex-1" data-testid="document-surface-scroll-area">
            <MilkdownEditor
              key={editorKey}
              ref={setEditorBridgeRef}
              initialMarkdown={activeDocument.content}
              initialViewState={initialViewState}
              documentPath={activeDocument.status === "saved" ? activeDocument.path : null}
              folderContextPath={folderContextPath}
              onOpenMarkdownPath={handleOpenMarkdownPath}
              onReadMarkdownPath={async (path) => (await openMarkdownDocument(path)).content}
              wikiCompletionPaths={wikiCompletionPaths}
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
