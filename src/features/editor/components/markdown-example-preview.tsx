import "katex/dist/katex.min.css";
import "./milkdown-editor.css";
import "./markdown-example-preview.css";
import { editorViewCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import { useEffect, useRef } from "react";

import { handleUnexpectedError } from "@/lib/errors";
import { useLocalization } from "@/lib/i18n";

import { SOURCE_PROJECTION_ENTRY_SUPPRESSION_META } from "../plugins/sourceProjection";
import { createMilkdownEditor, type MilkdownEditorInstance } from "../utils/createMilkdownEditor";

export function MarkdownExamplePreview({ source }: { source: string }) {
  const { t } = useLocalization();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = root.current!;
    const host = document.createElement("div");
    container.append(host);
    let disposed = false;
    let instance: MilkdownEditorInstance | undefined;
    const start = async () => {
      const editor = await createMilkdownEditor({ root: host, initialMarkdown: source });
      editor.config((ctx) => {
        ctx.update(editorViewOptionsCtx, (options) => ({ ...options, editable: () => false }));
      });
      try {
        await editor.create();
      } catch (error) {
        await editor.destroy();
        throw error;
      }
      if (disposed) {
        await editor.destroy();
        return;
      }
      instance = editor;
      const view = editor.ctx.get(editorViewCtx);
      const transaction = view.state.tr.insert(
        view.state.doc.content.size,
        view.state.schema.nodes.paragraph.create(),
      );
      transaction.setSelection(TextSelection.atEnd(transaction.doc));
      view.dispatch(transaction.setMeta(SOURCE_PROJECTION_ENTRY_SUPPRESSION_META, true));
      view.setProps({
        dispatchTransaction: (next) => {
          if (!next.docChanged && !next.selectionSet) {
            view.updateState(view.state.apply(next));
          }
        },
      });
      host.dataset.ready = "true";
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void start().catch((error) => {
          if (!disposed) {
            host.dataset.failed = "true";
            host.textContent = t("editor.example.failed");
          }
          handleUnexpectedError(error, "editor.markdownExamplePreview");
        });
      }
    });
    observer.observe(container);
    return () => {
      disposed = true;
      observer.disconnect();
      host.remove();
      void instance?.destroy();
    };
  }, [source, t]);

  return <div ref={root} inert aria-hidden className="leafdown-editor leafdown-example-preview" />;
}
