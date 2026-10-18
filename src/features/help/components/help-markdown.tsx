import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLinkIcon } from "lucide-react";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";

import { ShortcutKeys } from "@/components/ui/shortcut-keys";
import { notifyOperationFailure } from "@/lib/errors";
import { useLocalization } from "@/lib/i18n";
import { parseKeyboardKeys } from "@/lib/keyboardShortcut";
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

interface ExampleNode extends TextNode {
  children?: ExampleNode[];
  meta?: string | null;
  data?: { hProperties?: Record<string, string> };
}

const nodeText = (node: TextNode | undefined): string =>
  node?.type === "text" ? (node.value ?? "") : (node?.children ?? []).map(nodeText).join("");

const HelpPageLinkContext = createContext<((page: HelpPageId) => void) | null>(null);
const CodeBlockContext = createContext(false);
const MarkdownExamplePreview = lazy(async () => ({
  default: (await import("@/features/editor")).MarkdownExamplePreview,
}));

const HELP_ILLUSTRATIONS = import.meta.glob<string>("../../../../docs/help/illustrations/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
});

const remarkExamples = () => (tree: ExampleNode) => {
  const visit = (node: ExampleNode) => {
    if (node.type === "code") {
      const kind = /^example=(commonmark|gfm|leafdown)$/u.exec(node.meta ?? "")?.[1];
      if (kind) node.data = { hProperties: { "data-example": kind } };
    }
    node.children?.forEach(visit);
  };
  visit(tree);
};

function HelpList({ node, ...props }: MarkdownProps<"ul">) {
  const items = node?.children.filter((child) => child.type === "element");
  const cards =
    items?.length &&
    items.every((item) => {
      const first = item.children.find((child) => child.type === "element");
      const link = first?.type === "element" && first.tagName === "p" ? first.children[0] : first;
      return (
        link?.type === "element" &&
        link.tagName === "a" &&
        typeof link.properties.href === "string" &&
        getHelpLinkTarget(link.properties.href)?.kind === "internal"
      );
    });
  return (
    <ul
      className={
        cards
          ? "my-5 grid gap-3 @xl/help-article:grid-cols-2 [&>li]:rounded-lg [&>li]:border [&>li]:p-4"
          : "my-3 list-disc space-y-2 pl-5 marker:text-muted-foreground"
      }
      {...props}
    />
  );
}

function HelpImage({ src, alt }: MarkdownProps<"img">) {
  const illustration =
    typeof src === "string" && /^illustrations\/[a-z-]+\.svg$/u.test(src)
      ? HELP_ILLUSTRATIONS[`../../../../docs/help/${src}`]
      : undefined;
  return illustration ? (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className="my-5 block rounded-xl bg-art-tint p-5 [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: illustration }}
    />
  ) : (
    <span>{alt}</span>
  );
}

function HelpPre({ node, children, ...props }: MarkdownProps<"pre">) {
  const { t } = useLocalization();
  const code = node?.children[0];
  const kind = code?.type === "element" ? code.properties["data-example"] : undefined;
  const source = nodeText(node).replace(/\n$/u, "");
  const sample = (
    <pre
      className="my-5 overflow-x-auto rounded-lg border bg-muted/40 px-4 py-3 font-mono text-[0.8125rem] leading-relaxed [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em]"
      {...props}
    >
      <CodeBlockContext.Provider value={true}>{children}</CodeBlockContext.Provider>
    </pre>
  );
  if (!kind) return sample;
  return (
    <figure className="my-5 overflow-hidden rounded-xl border" data-help-example={kind}>
      <figcaption className="border-b bg-muted/40 px-4 py-2 text-xs font-medium">
        {kind === "commonmark"
          ? "CommonMark"
          : kind === "gfm"
            ? "GFM"
            : t("help.example.extension")}
      </figcaption>
      <div className="grid @xl/help-article:grid-cols-2">
        <div className="min-w-0 p-4 [&>pre]:mb-0 [&>pre]:border-0 [&>pre]:p-0">
          <p className="text-xs font-medium text-muted-foreground">{t("help.example.source")}</p>
          {sample}
        </div>
        <div className="min-w-0 overflow-x-auto border-t p-4 @xl/help-article:border-t-0 @xl/help-article:border-l">
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            {t("help.example.result")}
          </p>
          <Suspense fallback={<div inert aria-hidden className="min-h-16" />}>
            <MarkdownExamplePreview source={source} />
          </Suspense>
        </div>
      </div>
    </figure>
  );
}

function HelpCode({ node: _node, className, children, ...props }: MarkdownProps<"code">) {
  const block = useContext(CodeBlockContext);
  const text = !block && typeof children === "string" ? children : "";
  const action = /\+(click|arrows)$/u.exec(text);
  const keys = parseKeyboardKeys(action ? text.slice(0, action.index) : text);
  return keys ? (
    <>
      <ShortcutKeys keys={keys} />
      {action && `+${action[1]}`}
    </>
  ) : (
    <code
      className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]", className)}
      {...props}
    >
      {children}
    </code>
  );
}

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
  img: HelpImage,
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
  ul: HelpList,
  ol: ({ node: _node, ...props }: MarkdownProps<"ol">) => (
    <ol className="my-3 list-decimal space-y-2 pl-5 marker:text-muted-foreground" {...props} />
  ),
  strong: ({ node: _node, ...props }: MarkdownProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  blockquote: ({ node: _node, ...props }: MarkdownProps<"blockquote">) => (
    <blockquote className="my-4 border-l-2 pl-4 text-muted-foreground" {...props} />
  ),
  code: HelpCode,
  pre: HelpPre,
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
    <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkExamples]}
      components={inline ? INLINE_COMPONENTS : HELP_MARKDOWN_COMPONENTS}
    >
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
