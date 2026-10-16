import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { useLocalization } from "@/lib/i18n";

import { useEditorPreviewAnchor } from "../hooks/useEditorPreviewAnchor";
import type { LinkPreviewRequest } from "../plugins/linkPreview";

export interface EditorLinkPreviewProps {
  request: LinkPreviewRequest | null;
}

function LinkPreviewTitle({ request }: { request: LinkPreviewRequest }) {
  const { t } = useLocalization();
  const { documentName, heading } = request;

  if (documentName !== null && heading !== null) {
    return t("editor.linkPreview.documentHeading", { document: documentName, heading });
  }

  return documentName ?? heading;
}

function LinkPreviewBody({ request }: { request: LinkPreviewRequest }) {
  const { t } = useLocalization();
  const { content, heading } = request;

  switch (content.kind) {
    case "excerpt":
      if (content.text) {
        return <span className="break-words whitespace-pre-wrap">{content.text}</span>;
      }

      return (
        <span className="italic">
          {heading === null
            ? t("editor.linkPreview.emptyDocument")
            : t("editor.linkPreview.emptySection")}
        </span>
      );

    case "missingDocument":
      return <span className="italic">{t("editor.linkPreview.missingDocument")}</span>;

    case "missingHeading":
      return <span className="italic">{t("editor.linkPreview.missingHeading")}</span>;

    case "unavailable":
      return <span className="italic">{t("editor.linkPreview.unavailable")}</span>;

    case "unsavedDocument":
      return <span className="italic">{t("editor.linkPreview.unsavedDocument")}</span>;
  }
}

export function EditorLinkPreview({ request }: EditorLinkPreviewProps) {
  const anchor = useEditorPreviewAnchor(request);

  return (
    <Tooltip open={request !== null}>
      <TooltipContent
        anchor={anchor}
        // As for the footnote preview, the role carries the semantic an anchored preview has no
        // trigger to describe, and the live region announces a preview that takes no focus.
        aria-live="polite"
        className="max-w-sm flex-col items-start gap-1 px-3 py-2 text-left"
        role="tooltip"
        side="top"
      >
        {request && (
          <>
            <span className="max-w-full truncate font-semibold">
              <LinkPreviewTitle request={request} />
            </span>
            <LinkPreviewBody request={request} />
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
