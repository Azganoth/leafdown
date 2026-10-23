import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import type { Mark, Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { getDocumentLinkTarget } from "@/lib/path";

import {
  finalizeSourceProjection,
  getActiveSourceProjectionAdapterId,
  getSourceProjectionCanonicalState,
} from "../../plugins/sourceProjection";
import { selectLinkFilePath } from "../../services/linkFilePicker";
import { BARE_AUTOLINK_ATTRIBUTE_NAME } from "../../utils/bareAutolinkMarkdown";
import { AUTHORED_URL_ATTRIBUTE_NAME } from "../../utils/characterReferenceMarkdown";
import { markdownReferenceContextCtx } from "../../utils/markdownReferences";
import { getMarkRangeInDocument } from "../../utils/marks";
import { readReferenceType } from "../../utils/referenceLinkMarkdown";
import type { TextRange } from "../../utils/textRanges";
import { parseWikiLink, WIKI_LINK_NODE_NAME, type WikiLink } from "../../utils/wikiLinkMarkdown";

const LINK_MARK_NAME = "link";
// Formatting covering a whole link is written around it rather than inside its label.
const OUTER_LINK_MARK_NAMES = new Set(["emphasis", "strike_through", "strong"]);
// What `mdast-util-to-markdown` requires before it writes a link as `<destination>`.
const AUTOLINK_DESTINATION_PATTERN = /^[a-z][+\-.a-z]+:/iu;
const AUTOLINK_UNSAFE_CHARACTER_PATTERN = /[\0- <>\u007F]/u;

type MarkdownLinkForm = "autolink" | "inline" | "reference";

type LinkTarget = TextRange &
  (
    | { form: MarkdownLinkForm; mark: Mark }
    | { form: "wiki"; link: WikiLink; node: ProseMirrorNode }
  );

interface LinkScope extends TextRange {
  adapterId: string | null;
  doc: ProseMirrorNode;
  projected: boolean;
}

// An active projection's source is read as the document it stands for, so source that no longer
// spells one complete link names none.
const readLinkScope = (state: EditorState): LinkScope | null => {
  const canonical = getSourceProjectionCanonicalState(state);

  if (canonical) {
    return {
      adapterId: getActiveSourceProjectionAdapterId(state),
      doc: canonical.doc,
      from: Math.min(canonical.anchor, canonical.head),
      projected: true,
      to: Math.max(canonical.anchor, canonical.head),
    };
  }

  const { selection } = state;

  return selection instanceof TextSelection || selection instanceof NodeSelection
    ? { adapterId: null, doc: state.doc, from: selection.from, projected: false, to: selection.to }
    : null;
};

const isAutolink = (doc: ProseMirrorNode, { from, to }: TextRange, mark: Mark) => {
  if (mark.attrs[BARE_AUTOLINK_ATTRIBUTE_NAME] === true) {
    return true;
  }

  const href = mark.attrs.href as unknown;
  const node = doc.nodeAt(from);

  return (
    typeof href === "string" &&
    !mark.attrs.title &&
    AUTOLINK_DESTINATION_PATTERN.test(href) &&
    !AUTOLINK_UNSAFE_CHARACTER_PATTERN.test(href) &&
    node?.isText === true &&
    node.nodeSize === to - from &&
    node.marks.every(
      (candidate) => candidate.eq(mark) || OUTER_LINK_MARK_NAMES.has(candidate.type.name),
    ) &&
    (node.text === href || `mailto:${node.text}` === href)
  );
};

const readMarkdownLinkForm = (doc: ProseMirrorNode, range: TextRange, mark: Mark) => {
  if (readReferenceType(mark.attrs) !== null) {
    return "reference";
  }

  return isAutolink(doc, range, mark) ? "autolink" : "inline";
};

const findMarkdownLink = (doc: ProseMirrorNode, { from, to }: TextRange): LinkTarget | null => {
  const $from = doc.resolve(from);

  if (!$from.sameParent(doc.resolve(to))) {
    return null;
  }

  const candidates = [
    ...$from.marks(),
    ...($from.nodeBefore?.marks ?? []),
    ...($from.nodeAfter?.marks ?? []),
  ].filter((mark) => mark.type.name === LINK_MARK_NAME);

  for (const mark of candidates) {
    const range = getMarkRangeInDocument(doc, from, mark);

    if (range && range.from <= from && to <= range.to) {
      return {
        form: readMarkdownLinkForm(doc, range, mark),
        from: range.from,
        mark,
        to: range.to,
      };
    }
  }

  return null;
};

const createWikiLinkTarget = (node: ProseMirrorNode | null | undefined, from: number) => {
  const link =
    node?.type.name === WIKI_LINK_NODE_NAME ? parseWikiLink(String(node.attrs.source)) : null;

  return node && link
    ? { form: "wiki" as const, from, link, node, to: from + node.nodeSize }
    : null;
};

const findWikiLink = (doc: ProseMirrorNode, { from, to }: TextRange): LinkTarget | null => {
  const $from = doc.resolve(from);

  if (from !== to) {
    const target = createWikiLinkTarget(doc.nodeAt(from), from);

    return target?.to === to ? target : null;
  }

  return (
    createWikiLinkTarget($from.nodeAfter, from) ??
    createWikiLinkTarget($from.nodeBefore, from - ($from.nodeBefore?.nodeSize ?? 0))
  );
};

const findLinkInScope = (scope: LinkScope) => {
  if (scope.adapterId === "wiki-link") {
    return findWikiLink(scope.doc, scope);
  }

  if (scope.adapterId === "link") {
    return findMarkdownLink(scope.doc, scope);
  }

  return findMarkdownLink(scope.doc, scope) ?? findWikiLink(scope.doc, scope);
};

interface ResolvedLinkTarget {
  projected: boolean;
  target: LinkTarget;
}

// Command availability is asked for on every transaction, and reading a projection parses its
// source.
const resolvedTargets = new WeakMap<EditorState, ResolvedLinkTarget | null>();

const resolveLinkTarget = (state: EditorState): ResolvedLinkTarget | null => {
  if (resolvedTargets.has(state)) {
    return resolvedTargets.get(state) ?? null;
  }

  const scope = readLinkScope(state);
  const target = scope ? findLinkInScope(scope) : null;
  const resolved = scope && target ? { projected: scope.projected, target } : null;

  resolvedTargets.set(state, resolved);

  return resolved;
};

const getLinkDestination = (target: LinkTarget) => {
  if (target.form === "wiki") {
    const { heading, path } = target.link;

    return heading === null ? path : `${path}#${heading}`;
  }

  const href = target.mark.attrs.href as unknown;

  return typeof href === "string" ? href : "";
};

const isSameTarget = (left: LinkTarget, right: LinkTarget) =>
  left.form === right.form &&
  left.from === right.from &&
  left.to === right.to &&
  getLinkDestination(left) === getLinkDestination(right);

/**
 * Closes a projection the target was read through, and finds the same link in the document that
 * leaves. A link that does not come back where it was read is not the one the action was for.
 */
const settleLinkTarget = (view: EditorView, { projected, target }: ResolvedLinkTarget) => {
  if (!projected) {
    return target;
  }

  finalizeSourceProjection(view);

  const settled =
    target.form === "wiki"
      ? findWikiLink(view.state.doc, target)
      : findMarkdownLink(view.state.doc, target);

  return settled && isSameTarget(settled, target) ? settled : null;
};

export const canCopyLinkDestination = (state: EditorState) => {
  const resolved = resolveLinkTarget(state);

  return resolved !== null && getLinkDestination(resolved.target) !== "";
};

export const copyLinkDestination = async (view: EditorView) => {
  const resolved = resolveLinkTarget(view.state);
  const destination = resolved ? getLinkDestination(resolved.target) : "";
  const clipboard = navigator.clipboard as Clipboard | undefined;

  if (!destination || !clipboard) {
    return false;
  }

  await clipboard.writeText(destination);

  return true;
};

export const canRemoveLink = (state: EditorState) => {
  const form = resolveLinkTarget(state)?.target.form;

  return form !== undefined && form !== "autolink";
};

export const removeLink = (view: EditorView) => {
  const resolved = resolveLinkTarget(view.state);

  if (!resolved || resolved.target.form === "autolink") {
    return false;
  }

  const target = settleLinkTarget(view, resolved);

  if (!target) {
    return false;
  }

  const { state } = view;
  const transaction =
    target.form === "wiki"
      ? state.tr.replaceWith(
          target.from,
          target.to,
          state.schema.text(target.link.label, target.node.marks),
        )
      : state.tr.removeMark(target.from, target.to, target.mark);

  view.dispatch(transaction.scrollIntoView());
  view.focus();

  return true;
};

export const canChooseLinkFile = (state: EditorState) =>
  resolveLinkTarget(state)?.target.form === "inline";

// The picker is modal, so a document that changed meanwhile was changed by something else, and the
// link the choice was made for may no longer be there.
export const chooseLinkFile = async (editor: Editor) => {
  const view = editor.ctx.get(editorViewCtx);
  const readContext = editor.ctx.get(markdownReferenceContextCtx.key);
  const resolved = resolveLinkTarget(view.state);
  const document = view.state.doc;

  if (resolved?.target.form !== "inline") {
    return false;
  }

  const path = await selectLinkFilePath(readContext().documentPath);

  if (path === null || view.isDestroyed || view.state.doc !== document) {
    return false;
  }

  const target = settleLinkTarget(view, resolved);

  if (target?.form !== "inline") {
    return false;
  }

  const { mark } = target;
  const href = getDocumentLinkTarget(readContext().documentPath, path);

  view.dispatch(
    view.state.tr
      .addMark(
        target.from,
        target.to,
        mark.type.create({ ...mark.attrs, href, [AUTHORED_URL_ATTRIBUTE_NAME]: null }),
      )
      .scrollIntoView(),
  );
  view.focus();

  return true;
};
