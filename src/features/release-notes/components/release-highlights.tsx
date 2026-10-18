import { HelpMarkdownFragment } from "@/features/help";
import { useLocalization } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type { ReleaseHighlight } from "../services/bundledChangelog";

export function ReleaseHighlights({ highlights }: { highlights: readonly ReleaseHighlight[] }) {
  const { t } = useLocalization();

  return (
    <ul aria-label={t("releaseNotes.highlights")} className="space-y-7">
      {highlights.map((highlight, index) => (
        <li
          key={highlight.title}
          className={cn(
            "grid items-center gap-4",
            highlight.illustration && "@xl/help-article:grid-cols-2 @xl/help-article:gap-8",
          )}
        >
          {highlight.illustration && (
            <div
              aria-hidden="true"
              className={cn(
                "flex justify-center rounded-xl bg-art-tint px-6 py-5 [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-[17rem]",
                index % 2 === 1 && "@xl/help-article:order-last",
              )}
              dangerouslySetInnerHTML={{ __html: highlight.illustration }}
            />
          )}
          <div className="min-w-0">
            <h3 className="text-lg leading-snug font-semibold tracking-tight">{highlight.title}</h3>
            <div className="mt-1.5 leading-relaxed text-muted-foreground [&>p]:my-0 [&>p+p]:mt-2">
              <HelpMarkdownFragment source={highlight.body} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
