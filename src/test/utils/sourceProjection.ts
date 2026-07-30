import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection } from "@milkdown/kit/prose/state";
import { expect } from "vitest";

import { hasActiveSourceProjection } from "@/features/editor/plugins/sourceProjection";

import type { MountedMilkdownEditor } from "./milkdown";
import {
  getEditorDomElement,
  getEditorNodePosition,
  setSelectionAtElementTextEnd,
} from "./prosemirror";

export type SourceProjectionSelector = "a" | "code" | "del" | "em" | "strong";

export const enterProjection = (
  mounted: MountedMilkdownEditor,
  selector: SourceProjectionSelector,
) => {
  setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, selector));

  expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
};

export const selectFootnoteReference = (
  mounted: MountedMilkdownEditor,
  predicate: (node: ProseMirrorNode) => boolean = () => true,
) => {
  const position = getEditorNodePosition(mounted, "footnote_reference", predicate);

  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, position)),
  );
};

// Selecting a footnote reference does not always project it, so callers that depend on an
// active projection assert it and the rest use `selectFootnoteReference` directly.
export const enterFootnoteReferenceProjection = (
  mounted: MountedMilkdownEditor,
  predicate: (node: ProseMirrorNode) => boolean = () => true,
) => {
  selectFootnoteReference(mounted, predicate);

  expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
};
