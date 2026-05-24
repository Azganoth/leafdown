import { MilkdownEditor } from "@/features/editor";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { SavedDocumentState } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";

interface DocumentScreenProps {
  document: SavedDocumentState;
}

export function DocumentScreen({ document }: DocumentScreenProps) {
  const autoPairBracketsAndQuotes = useSettingsStore((state) => state.autoPairBracketsAndQuotes);
  const softWrapCodeBlocks = useSettingsStore((state) => state.softWrapCodeBlocks);

  return (
    <ScrollArea className="h-full w-full" data-testid="document-surface-scroll-area" type="scroll">
      <section
        aria-label="Active document"
        data-testid="active-document-host"
        className="min-h-full w-full bg-background"
      >
        <MilkdownEditor
          documentKey={document.path}
          initialMarkdown={document.content}
          autoPairBracketsAndQuotes={autoPairBracketsAndQuotes}
          softWrapCodeBlocks={softWrapCodeBlocks}
        />
      </section>
    </ScrollArea>
  );
}
