import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLinkIcon } from "lucide-react";
import { createContext, useContext, type ComponentProps, type Ref } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";

import { ScrollArea } from "@/components/ui/scroll-area";
import { notifyOperationFailure } from "@/lib/errors";
import { useLocalization } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { getHelpLinkTarget, type HelpPageId } from "../services/pages";

interface HelpMarkdownProps {
  source: string;
  onPageLink?: (page: HelpPageId) => void;
  ref?: Ref<HTMLElement>;
}

type MarkdownProps<Tag extends keyof React.JSX.IntrinsicElements> = ComponentProps<Tag> &
  ExtraProps;

const HelpPageLinkContext = createContext<((page: HelpPageId) => void) | null>(null);

function HelpLink({ href, children }: MarkdownProps<"a">) {
  const onPageLink = useContext(HelpPageLinkContext);
  const { t } = useLocalization();
  const target = href ? getHelpLinkTarget(href) : null;

  if (!target || (target.kind === "internal" && !onPageLink)) {
    return <span>{children}</span>;
  }

  const followLink = () => {
    if (target.kind === "internal") {
      onPageLink?.(target.page);
    } else {
      void openUrl(target.url).catch((error) =>
        notifyOperationFailure(
          t("commands.help.openLinkFailed"),
          error,
          "help.openDocumentationLink",
        ),
      );
    }
  };

  return (
    <button
      type="button"
      className="inline rounded-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onClick={followLink}
    >
      {children}
      {target.kind === "external" && (
        <ExternalLinkIcon aria-hidden className="ml-0.5 inline size-3 align-baseline" />
      )}
    </button>
  );
}

const HELP_MARKDOWN_COMPONENTS = {
  a: HelpLink,
  img: ({ alt }: MarkdownProps<"img">) => <span>{alt}</span>,
  h1: () => null,
  h2: ({ node: _node, ...props }: MarkdownProps<"h2">) => (
    <h3
      className="mt-8 mb-3 border-b pb-2 text-base font-semibold tracking-tight first:mt-0"
      {...props}
    />
  ),
  h3: ({ node: _node, ...props }: MarkdownProps<"h3">) => (
    <h4 className="mt-6 mb-2 font-semibold first:mt-0" {...props} />
  ),
  p: ({ node: _node, ...props }: MarkdownProps<"p">) => <p className="my-3" {...props} />,
  ul: ({ node: _node, ...props }: MarkdownProps<"ul">) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-muted-foreground" {...props} />
  ),
  ol: ({ node: _node, ...props }: MarkdownProps<"ol">) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:text-muted-foreground" {...props} />
  ),
  strong: ({ node: _node, ...props }: MarkdownProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  blockquote: ({ node: _node, ...props }: MarkdownProps<"blockquote">) => (
    <blockquote className="my-3 border-l-2 pl-3 text-muted-foreground" {...props} />
  ),
  code: ({ node: _node, className, ...props }: MarkdownProps<"code">) => (
    <code
      className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]", className)}
      {...props}
    />
  ),
  pre: ({ node: _node, ...props }: MarkdownProps<"pre">) => (
    <pre
      className="my-4 overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em]"
      {...props}
    />
  ),
} satisfies Components;

export function HelpMarkdown({ source, onPageLink, ref }: HelpMarkdownProps) {
  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="max-h-full">
      <article
        ref={ref}
        tabIndex={-1}
        className="pr-4 pb-3 text-sm leading-relaxed break-words text-foreground outline-none [&>p:first-child]:mt-0 [&>p:first-child]:text-base [&>p:first-child]:text-muted-foreground"
      >
        <HelpPageLinkContext.Provider value={onPageLink ?? null}>
          <ReactMarkdown skipHtml components={HELP_MARKDOWN_COMPONENTS}>
            {source}
          </ReactMarkdown>
        </HelpPageLinkContext.Provider>
      </article>
    </ScrollArea>
  );
}
