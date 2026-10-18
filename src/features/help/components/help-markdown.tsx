import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLinkIcon } from "lucide-react";
import { createContext, useContext, type ComponentProps, type ReactNode, type Ref } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";

import { notifyOperationFailure } from "@/lib/errors";
import { useLocalization } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import {
  getHelpLinkTarget,
  getHelpSectionId,
  type HelpPageId,
  type HelpPageSection,
} from "../services/pages";
import { HelpPageBody, revealHelpSection } from "./help-page";

interface HelpMarkdownProps {
  source: string;
  sections?: readonly HelpPageSection[];
  onPageLink?: (page: HelpPageId) => void;
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
}

type MarkdownProps<Tag extends keyof React.JSX.IntrinsicElements> = ComponentProps<Tag> &
  ExtraProps;

interface TextNode {
  type: string;
  value?: string;
  children?: TextNode[];
}

const nodeText = (node: TextNode | undefined): string =>
  node?.type === "text" ? (node.value ?? "") : (node?.children ?? []).map(nodeText).join("");

const HelpPageLinkContext = createContext<((page: HelpPageId) => void) | null>(null);

function HelpLink({ href, children }: MarkdownProps<"a">) {
  const onPageLink = useContext(HelpPageLinkContext);
  const { t } = useLocalization();
  const target = href ? getHelpLinkTarget(href) : null;

  if (!target || (target.kind === "internal" && !onPageLink)) {
    return <span>{children}</span>;
  }

  const followLink = (button: HTMLElement) => {
    if (target.kind === "section") {
      revealHelpSection(button, target.id);
    } else if (target.kind === "internal") {
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
      onClick={(event) => followLink(event.currentTarget)}
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
  h2: ({ node, ...props }: MarkdownProps<"h2">) => (
    <h3
      id={getHelpSectionId(nodeText(node))}
      tabIndex={-1}
      className="mt-11 mb-3 scroll-mt-6 text-lg font-semibold tracking-tight outline-none first:mt-0"
      {...props}
    />
  ),
  h3: ({ node: _node, ...props }: MarkdownProps<"h3">) => (
    <h4 className="mt-7 mb-2 font-semibold first:mt-0" {...props} />
  ),
  h4: ({ node: _node, ...props }: MarkdownProps<"h4">) => (
    <h5 className="mt-5 mb-1.5 font-semibold first:mt-0" {...props} />
  ),
  p: ({ node: _node, ...props }: MarkdownProps<"p">) => <p className="my-3" {...props} />,
  ul: ({ node: _node, ...props }: MarkdownProps<"ul">) => (
    <ul className="my-3 list-disc space-y-2 pl-5 marker:text-muted-foreground" {...props} />
  ),
  ol: ({ node: _node, ...props }: MarkdownProps<"ol">) => (
    <ol className="my-3 list-decimal space-y-2 pl-5 marker:text-muted-foreground" {...props} />
  ),
  strong: ({ node: _node, ...props }: MarkdownProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  blockquote: ({ node: _node, ...props }: MarkdownProps<"blockquote">) => (
    <blockquote className="my-4 border-l-2 pl-4 text-muted-foreground" {...props} />
  ),
  code: ({ node: _node, className, ...props }: MarkdownProps<"code">) => (
    <code
      className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]", className)}
      {...props}
    />
  ),
  pre: ({ node: _node, ...props }: MarkdownProps<"pre">) => (
    <pre
      className="my-5 overflow-x-auto rounded-lg border bg-muted/40 px-4 py-3 font-mono text-[0.8125rem] leading-relaxed [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em]"
      {...props}
    />
  ),
} satisfies Components;

const INLINE_COMPONENTS = {
  ...HELP_MARKDOWN_COMPONENTS,
  p: ({ children }: MarkdownProps<"p">) => <>{children}</>,
} satisfies Components;

export function HelpMarkdownFragment({
  source,
  inline = false,
}: {
  source: string;
  inline?: boolean;
}) {
  return (
    <ReactMarkdown skipHtml components={inline ? INLINE_COMPONENTS : HELP_MARKDOWN_COMPONENTS}>
      {source}
    </ReactMarkdown>
  );
}

export function HelpMarkdown({ source, sections, onPageLink, ref, children }: HelpMarkdownProps) {
  return (
    <HelpPageBody kind="guide" sections={sections} articleRef={ref}>
      <HelpPageLinkContext.Provider value={onPageLink ?? null}>
        {children}
        <HelpMarkdownFragment source={source} />
      </HelpPageLinkContext.Provider>
    </HelpPageBody>
  );
}
