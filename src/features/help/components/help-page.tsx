import { useState, type ComponentProps, type ReactNode, type Ref } from "react";

import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocalization } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type { HelpPageSection } from "../services/pages";

export type HelpPageKind = "guide" | "release" | "reference";

// Each width is the page's measure plus the body's padding, and for guides the section list
// beside it, so a wide window leaves no empty space at the sides of the text.
const DIALOG_WIDTHS: Record<HelpPageKind, string> = {
  guide: "sm:max-w-[min(59rem,calc(100%-3rem))]",
  release: "sm:max-w-[min(50rem,calc(100%-3rem))]",
  reference: "sm:max-w-[min(62rem,calc(100%-3rem))]",
};

const ARTICLE_WIDTHS: Record<HelpPageKind, string> = {
  guide: "max-w-[40rem]",
  release: "max-w-[46rem]",
  reference: "max-w-[58rem]",
};

// Pages below this many sections are short enough that a list of them adds nothing.
const MIN_LISTED_SECTIONS = 3;
const ACTIVE_SECTION_OFFSET = 96;

export function HelpPageContent({
  kind,
  fitContent = false,
  className,
  ...props
}: ComponentProps<typeof DialogContent> & { kind: HelpPageKind; fitContent?: boolean }) {
  return (
    <DialogContent
      className={cn(
        // The window's titlebar stays above the dialog, so the dialog keeps its height clear of it.
        "top-[calc(50%+0.75rem)] flex max-h-[calc(100dvh-4.5rem)] min-h-0 flex-col gap-0 overflow-hidden p-0",
        !fitContent && "h-[min(55rem,calc(100dvh-4.5rem))]",
        DIALOG_WIDTHS[kind],
        className,
      )}
      {...props}
    />
  );
}

export function HelpPageHeader({
  title,
  description,
  descriptionClassName,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  descriptionClassName?: string;
  children?: ReactNode;
}) {
  return (
    <DialogHeader className="shrink-0 gap-1 border-b px-5 pt-5 pb-4 sm:px-8">
      <DialogTitle className="pr-10 text-lg leading-tight font-semibold tracking-tight">
        {title}
      </DialogTitle>
      {description && (
        <DialogDescription className={cn("pr-10", descriptionClassName)}>
          {description}
        </DialogDescription>
      )}
      {children && <div className="mt-3">{children}</div>}
    </DialogHeader>
  );
}

export const revealHelpSection = (container: Element | null, id: string) => {
  const heading = container
    ?.closest("[data-help-page-body]")
    ?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
  if (!heading) {
    return;
  }
  heading.scrollIntoView({ block: "start" });
  heading.focus({ preventScroll: true });
};

function SectionList({
  sections,
  active,
  onReveal,
}: {
  sections: readonly HelpPageSection[];
  active: string | null;
  onReveal: (id: string, button: HTMLElement) => void;
}) {
  const { t } = useLocalization();
  return (
    <aside className="hidden w-48 shrink-0 @min-[54rem]/help-body:block">
      <nav aria-label={t("help.onThisPage")} className="sticky top-7">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t("help.onThisPage")}</p>
        <ul className="border-l">
          {sections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                aria-current={active === section.id ? "location" : undefined}
                className="-ml-px block w-full border-l-2 border-transparent py-1 pr-2 pl-3 text-left text-[0.8125rem] leading-snug text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=location]:border-primary aria-[current=location]:font-medium aria-[current=location]:text-foreground"
                onClick={(event) => onReveal(section.id, event.currentTarget)}
              >
                {section.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export function HelpPageBody({
  kind,
  sections = [],
  articleRef,
  viewportRef,
  children,
}: {
  kind: HelpPageKind;
  sections?: readonly HelpPageSection[];
  articleRef?: Ref<HTMLElement>;
  viewportRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const listed = sections.length >= MIN_LISTED_SECTIONS;
  const [active, setActive] = useState<string | null>(null);
  const activeSection = active ?? sections[0]?.id ?? null;

  const trackActiveSection = (viewport: HTMLElement) => {
    if (!listed) {
      return;
    }
    const top = viewport.getBoundingClientRect().top;
    let current = sections[0].id;
    for (const section of sections) {
      const heading = viewport.querySelector(`[id="${CSS.escape(section.id)}"]`);
      if (heading && heading.getBoundingClientRect().top - top <= ACTIVE_SECTION_OFFSET) {
        current = section.id;
      }
    }
    if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 1) {
      current = sections[sections.length - 1].id;
    }
    setActive(current);
  };

  return (
    <ScrollArea
      data-help-page-body=""
      className="min-h-0 flex-1"
      viewportClassName="max-h-full"
      viewportRef={viewportRef}
      viewportProps={{ onScroll: (event) => trackActiveSection(event.currentTarget) }}
    >
      <div className="@container/help-body">
        <div className="flex gap-12 px-5 pt-6 pb-12 sm:px-8 sm:pt-7">
          <article
            ref={articleRef}
            tabIndex={-1}
            className={cn(
              "@container/help-article min-w-0 flex-1 text-[0.9375rem] leading-[1.7] break-words text-foreground outline-none [&>p:first-child]:mt-0 [&>p:first-child]:mb-8 [&>p:first-child]:text-base [&>p:first-child]:text-muted-foreground",
              ARTICLE_WIDTHS[kind],
            )}
          >
            {children}
          </article>
          {listed && (
            <SectionList
              sections={sections}
              active={activeSection}
              onReveal={(id, button) => {
                revealHelpSection(button, id);
                setActive(id);
              }}
            />
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
