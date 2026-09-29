import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  finalizeSourceProjection,
  getSourceProjectionCanonicalState,
} from "../plugins/sourceProjection";
import { parseWikiLink } from "./wikiLinkMarkdown";

export interface WikiHeading {
  text: string;
  position: number;
}

const plainHeadingText = (node: ProseMirrorNode): string => {
  if (node.isText) return node.text ?? "";
  if (node.type.name === "wiki_link")
    return parseWikiLink(node.attrs.source as string)?.label ?? "";
  if (node.type.name === "image") return String(node.attrs.alt ?? "");
  if (node.type.name === "hardbreak") return " ";
  let text = "";
  node.forEach((child) => {
    text += plainHeadingText(child);
  });
  return text;
};

export const getWikiHeadings = (document: ProseMirrorNode): WikiHeading[] => {
  const headings: WikiHeading[] = [];
  document.descendants((node, position) => {
    if (node.type.name === "heading") {
      headings.push({ text: plainHeadingText(node), position: position + 1 });
      return false;
    }
    return true;
  });
  return headings;
};

export const findWikiHeading = (document: ProseMirrorNode, text: string) =>
  getWikiHeadings(document).find((heading) => heading.text === text) ?? null;

export const getWikiHeadingsFromState = (state: EditorState) =>
  getWikiHeadings(getSourceProjectionCanonicalState(state)?.doc ?? state.doc);

export const findWikiHeadingFromState = (state: EditorState, text: string) =>
  getWikiHeadingsFromState(state).find((heading) => heading.text === text) ?? null;

export const jumpToWikiHeading = (view: EditorView, text: string) => {
  finalizeSourceProjection(view);
  const heading = findWikiHeading(view.state.doc, text);
  if (!heading) return false;
  const selection = TextSelection.near(view.state.doc.resolve(heading.position), 1);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
  return true;
};
