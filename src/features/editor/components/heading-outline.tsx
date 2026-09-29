import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocalization } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type { HeadingOutlineState } from "../utils/headingOutline";

interface HeadingOutlineProps {
  outline: HeadingOutlineState;
  onNavigate: (position: number) => void;
}

export function HeadingOutline({ outline, onNavigate }: HeadingOutlineProps) {
  const { t } = useLocalization();
  const contextNames = {
    blockquote: t("editor.blockPath.blockquote"),
    bullet_list: t("editor.blockPath.unorderedList"),
    ordered_list: t("editor.blockPath.orderedList"),
    callout: t("headingOutline.callout"),
  };

  return (
    <Card size="sm" className="min-h-0 min-w-0 flex-1">
      <CardHeader className="shrink-0">
        <CardTitle>{t("headingOutline.title")}</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {outline.headings.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t("headingOutline.empty")}</p>
        ) : (
          <nav
            aria-label={t("headingOutline.title")}
            className="min-h-0 flex-1 overflow-y-auto p-1"
          >
            <ol className="space-y-0.5 pb-2">
              {outline.headings.map((heading) => {
                const label = heading.text.trim() || t("headingOutline.untitled");
                const context = heading.context.map((kind) => contextNames[kind]).join(" › ");
                const accessibleLabel = t("headingOutline.rowLabel", {
                  level: heading.level,
                  label,
                });
                return (
                  <li key={heading.position}>
                    <button
                      aria-current={
                        outline.activePosition === heading.position ? "location" : undefined
                      }
                      aria-label={
                        context
                          ? t("headingOutline.rowWithContext", {
                              heading: accessibleLabel,
                              context,
                            })
                          : accessibleLabel
                      }
                      data-outline-position={heading.position}
                      className={cn(
                        "flex min-h-8 w-full flex-col justify-center rounded-md py-1 pr-2 text-left text-sm outline-hidden hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
                        outline.activePosition === heading.position &&
                          "bg-accent text-accent-foreground",
                      )}
                      onClick={() => onNavigate(heading.position)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onNavigate(heading.position);
                      }}
                      style={{ paddingInlineStart: `${8 + (heading.level - 1) * 12}px` }}
                      title={context ? `${context} › ${label}` : label}
                      type="button"
                    >
                      <span className="w-full truncate">{label}</span>
                      {context && (
                        <span className="w-full truncate text-xs text-muted-foreground">
                          {context}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
      </CardContent>
    </Card>
  );
}
