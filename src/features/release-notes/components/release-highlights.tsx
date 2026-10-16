import { HelpMarkdownFragment } from "@/features/help";
import { useLocalization } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type { ReleaseHighlight } from "../services/bundledChangelog";

export function ReleaseHighlights({ highlights }: { highlights: readonly ReleaseHighlight[] }) {
  const { t } = useLocalization();

  return (
    <ul aria-label={t("releaseNotes.highlights")} className="@container space-y-3">
      {highlights.map((highlight) => (
        <li
          key={highlight.title}
          className="flex flex-col gap-3 rounded-xl border bg-card p-2.5 @md:flex-row @md:items-center @md:gap-4"
        >
          {highlight.illustration && (
            <div
              aria-hidden="true"
              className="flex shrink-0 justify-center overflow-hidden rounded-lg bg-art-tint @md:w-44 [&>svg]:h-28 [&>svg]:w-auto @md:[&>svg]:h-auto @md:[&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: highlight.illustration }}
            />
          )}
          <div
            className={cn(
              "min-w-0 px-2 pb-1 @md:py-1 @md:pr-3",
              highlight.illustration && "@md:pl-0",
            )}
          >
            <h3 className="text-[0.9375rem] font-semibold tracking-tight">{highlight.title}</h3>
            <div className="mt-1 text-muted-foreground [&>p]:my-0 [&>p+p]:mt-2">
              <HelpMarkdownFragment source={highlight.body} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
