import "./editor-link-preview.css";
import { EyeOffIcon, FileIcon, FileXIcon, HashIcon, SaveIcon, type LucideIcon } from "lucide-react";

import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { useLocalization } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { useEditorPreviewAnchor } from "../hooks/useEditorPreviewAnchor";
import type { LinkPreviewRequest } from "../plugins/linkPreview";
import { isLinkPreviewTextTruncated } from "../utils/linkPreview";

export interface EditorLinkPreviewProps {
  request: LinkPreviewRequest | null;
}

function LinkPreviewMessage({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <span className="flex items-start gap-2 text-muted-foreground">
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </span>
  );
}

function LinkPreviewBody({ request }: { request: LinkPreviewRequest }) {
  const { t } = useLocalization();
  const { content, heading } = request;

  switch (content.kind) {
    case "excerpt":
      if (content.text) {
        return (
          <span
            className="leafdown-link-preview-excerpt break-words"
            data-truncated={isLinkPreviewTextTruncated(content.text) || undefined}
          >
            {content.text}
          </span>
        );
      }

      return (
        <LinkPreviewMessage icon={FileIcon}>
          {heading === null
            ? t("editor.linkPreview.emptyDocument")
            : t("editor.linkPreview.emptySection")}
        </LinkPreviewMessage>
      );

    case "missingDocument":
      return (
        <LinkPreviewMessage icon={FileXIcon}>
          {t("editor.linkPreview.missingDocument")}
        </LinkPreviewMessage>
      );

    case "missingHeading":
      return (
        <LinkPreviewMessage icon={HashIcon}>
          {t("editor.linkPreview.missingHeading")}
        </LinkPreviewMessage>
      );

    case "unavailable":
      return (
        <LinkPreviewMessage icon={EyeOffIcon}>
          {t("editor.linkPreview.unavailable")}
        </LinkPreviewMessage>
      );

    case "unsavedDocument":
      return (
        <LinkPreviewMessage icon={SaveIcon}>
          {t("editor.linkPreview.unsavedDocument")}
        </LinkPreviewMessage>
      );
  }
}

export function EditorLinkPreview({ request }: EditorLinkPreviewProps) {
  const anchor = useEditorPreviewAnchor(request);

  return (
    <Tooltip open={request !== null}>
      <TooltipContent
        anchor={anchor}
        arrow={false}
        // As for the footnote preview, the role carries the semantic an anchored preview has no
        // trigger to describe, and the live region announces a preview that takes no focus.
        aria-live="polite"
        className="leafdown-link-preview block w-68 max-w-none rounded-none bg-transparent p-0 text-left text-popover-foreground"
        role="tooltip"
        side="top"
        sideOffset={6}
      >
        {request && (
          <div className="leafdown-link-preview-edge">
            <div className="leafdown-link-preview-sheet text-[0.8125rem]/relaxed">
              <span aria-hidden className="leafdown-link-preview-flap" />
              {request.documentName !== null && (
                <span className="mb-1.5 max-w-[calc(100%-1.25rem)] truncate text-xs text-muted-foreground">
                  {request.documentName}
                </span>
              )}
              {request.heading !== null && (
                <span
                  className={cn(
                    "mb-1 max-w-full truncate text-sm leading-snug font-semibold",
                    request.documentName === null && "max-w-[calc(100%-1.25rem)]",
                    request.content.kind !== "excerpt" && "text-muted-foreground",
                  )}
                >
                  {request.heading}
                </span>
              )}
              <LinkPreviewBody request={request} />
            </div>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
