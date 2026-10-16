import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection, type EditorState } from "@milkdown/kit/prose/state";

import { getSourceProjectionCanonicalState } from "../plugins/sourceProjection";
import { FOOTNOTE_DEFINITION_NODE_NAME } from "./footnoteDefinitionLabel";
import { decodeFragment, slugifyHeading } from "./headingAnchors";
import { getRenderedLinkAtTarget } from "./renderedLinks";
import { getWikiHeadings, plainHeadingText, type WikiHeading } from "./wikiHeadings";
import { parseWikiLink, WIKI_LINK_NODE_NAME, type WikiLink } from "./wikiLinkMarkdown";

export const LINK_PREVIEW_CHARACTER_LIMIT = 280;

const LINK_PREVIEW_ELLIPSIS = "…";
const WHITESPACE_RUN_PATTERN = /\s+/gu;
const WIKI_LINK_SELECTOR = '[data-type="wiki-link"]';

// Source the reader of the document does not see as its text.
const NODES_OUTSIDE_THE_TEXT = new Set([
  "frontmatter",
  "definition",
  FOOTNOTE_DEFINITION_NODE_NAME,
]);

export type LinkPreviewTarget =
  | { kind: "markdown"; target: string }
  | { kind: "wiki"; link: WikiLink };

export interface LinkPreviewElementTarget {
  element: Element;
  target: LinkPreviewTarget;
}

export interface LinkPreviewDestination {
  /** Empty where the link names a heading in the document holding it. */
  path: string;
  heading: string | null;
}

export const getLinkPreviewDestination = (target: LinkPreviewTarget): LinkPreviewDestination => {
  if (target.kind === "wiki") {
    return { path: target.link.path, heading: target.link.heading };
  }

  const trimmed = target.target.trim();
  const hash = trimmed.indexOf("#");

  if (hash < 0) {
    return { path: trimmed, heading: null };
  }

  const fragment = decodeFragment(trimmed.slice(hash + 1));

  return { path: trimmed.slice(0, hash), heading: fragment || null };
};

const readWikiLink = (node: ProseMirrorNode | null | undefined) =>
  node?.type.name === WIKI_LINK_NODE_NAME ? parseWikiLink(String(node.attrs.source ?? "")) : null;

const readLinkHref = (node: ProseMirrorNode | null | undefined) => {
  const href = node?.marks.find((mark) => mark.type.name === "link")?.attrs.href;

  return typeof href === "string" && href.trim() ? href : null;
};

const readTarget = (node: ProseMirrorNode | null | undefined): LinkPreviewTarget | null => {
  const link = readWikiLink(node);

  if (link) {
    return { kind: "wiki", link };
  }

  const href = readLinkHref(node);

  return href ? { kind: "markdown", target: href } : null;
};

/**
 * The link the caret reads, read from the document an active projection stands for, so a link
 * whose source the caret has opened previews the target its source spells.
 */
export const findLinkPreviewTargetAtSelection = (state: EditorState): LinkPreviewTarget | null => {
  const canonical = getSourceProjectionCanonicalState(state);

  if (!canonical && state.selection instanceof NodeSelection) {
    return readTarget(state.selection.node);
  }

  const doc = canonical?.doc ?? state.doc;
  const from = canonical ? Math.min(canonical.anchor, canonical.head) : state.selection.from;
  const $from = doc.resolve(from);

  return readTarget($from.nodeAfter) ?? readTarget($from.nodeBefore);
};

export const getLinkPreviewTargetAtElement = (
  root: HTMLElement,
  eventTarget: EventTarget | null,
): LinkPreviewElementTarget | null => {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const wikiElement = eventTarget.closest<HTMLElement>(WIKI_LINK_SELECTOR);

  if (wikiElement && root.contains(wikiElement)) {
    const link = parseWikiLink(wikiElement.dataset.source ?? "");

    return link ? { element: wikiElement, target: { kind: "wiki", link } } : null;
  }

  const rendered = getRenderedLinkAtTarget(root, eventTarget);

  return rendered
    ? { element: rendered.element, target: { kind: "markdown", target: rendered.target } }
    : null;
};

/**
 * The heading a Markdown `#fragment` reaches, by the anchors exported HTML gives headings and then
 * by their text, so a preview reaches the heading the exported page would.
 */
export const findFragmentPreviewHeading = (
  doc: ProseMirrorNode,
  fragment: string,
): WikiHeading | null => {
  const usedIds = new Set<string>();
  const headings = getWikiHeadings(doc).map((heading) => {
    const base = slugifyHeading(heading.text) || "section";
    let id = base;

    for (let suffix = 1; usedIds.has(id); suffix += 1) id = `${base}-${suffix}`;
    usedIds.add(id);

    return { heading, id };
  });
  const slug = slugifyHeading(fragment);

  return (
    headings.find(({ id }) => id === fragment)?.heading ??
    headings.find(({ heading }) => slug !== "" && slugifyHeading(heading.text) === slug)?.heading ??
    headings.find(({ heading }) => heading.text === fragment)?.heading ??
    null
  );
};

/** Where the text after a heading found by `getWikiHeadings` starts. */
export const getHeadingContentStart = (doc: ProseMirrorNode, heading: WikiHeading) => {
  const start = heading.position - 1;

  return start + (doc.nodeAt(start)?.nodeSize ?? 0);
};

/** The document's text from `from` on, on one run of words, cut short past the preview's limit. */
export const getDocumentPreviewText = (doc: ProseMirrorNode, from = 0) => {
  const blocks: string[] = [];
  let length = 0;

  doc.descendants((node, position) => {
    if (length > LINK_PREVIEW_CHARACTER_LIMIT || NODES_OUTSIDE_THE_TEXT.has(node.type.name)) {
      return false;
    }

    if (position + node.nodeSize <= from) {
      return false;
    }

    if (!node.isTextblock) {
      return true;
    }

    if (position >= from) {
      const text = plainHeadingText(node);

      blocks.push(text);
      length += text.length + 1;
    }

    return false;
  });

  const text = blocks.join(" ").replace(WHITESPACE_RUN_PATTERN, " ").trim();

  return text.length > LINK_PREVIEW_CHARACTER_LIMIT
    ? `${text.slice(0, LINK_PREVIEW_CHARACTER_LIMIT).trimEnd()}${LINK_PREVIEW_ELLIPSIS}`
    : text;
};
