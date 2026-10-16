import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { useLocalization } from "@/lib/i18n";

import { useEditorPreviewAnchor } from "../hooks/useEditorPreviewAnchor";
import type { FootnotePreviewRequest } from "../plugins/footnotePreview";

export interface EditorFootnotePreviewProps {
  request: FootnotePreviewRequest | null;
}

export function EditorFootnotePreview({ request }: EditorFootnotePreviewProps) {
  const { t } = useLocalization();
  const anchor = useEditorPreviewAnchor(request);

  return (
    <Tooltip open={request !== null}>
      <TooltipContent
        anchor={anchor}
        // Base UI names the popup through a trigger's `aria-describedby`, which an anchored,
        // caret-driven preview has none of. The role carries the semantic instead, and the live
        // region is what announces a preview that opens without taking focus.
        aria-live="polite"
        className="max-w-sm px-3 py-2 text-left"
        role="tooltip"
        side="top"
      >
        {request?.definition === null ? (
          <span className="italic">{t("editor.footnotePreview.missingDefinition")}</span>
        ) : (
          <span className="whitespace-pre-wrap">{request?.definition}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
