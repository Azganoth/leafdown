import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { CALLOUT_NODE_NAME, isCalloutType } from "../../plugins/callout";
import {
  canInsertCalloutAt,
  createCalloutNode,
  findCalloutInsertionBoundary,
  findSelectedCalloutPosition,
  getCalloutTypeRequestTarget,
  setCalloutTypeRequestMeta,
  type CalloutTypeRequest,
} from "../../plugins/calloutType";
import { finalizeSourceProjection } from "../../plugins/sourceProjection";
import { setSelectionNear } from "../../utils/milkdown";

const COLLAPSED_MARKER = "???";
const EXPANDED_MARKER = "???+";
const CALLOUT_BODY_OFFSET = 2;

export const canChangeCalloutType = (state: EditorState) =>
  findSelectedCalloutPosition(state) !== null;

export const changeCalloutType = (view: EditorView) => {
  const position = findSelectedCalloutPosition(view.state);

  if (position === null) {
    return false;
  }

  view.dispatch(
    setCalloutTypeRequestMeta(view.state.tr, {
      type: "open",
      target: { type: "change", position },
    }),
  );

  return true;
};

export const canInsertCallout = (state: EditorState) =>
  findCalloutInsertionBoundary(state) !== null;

export const insertCallout = (view: EditorView) => {
  const boundary = findCalloutInsertionBoundary(view.state);

  return boundary !== null && insertCalloutAt(view, boundary);
};

/** Opens the type picker for a callout to be inserted at `boundary`; nothing is written yet. */
export const insertCalloutAt = (view: EditorView, boundary: number) => {
  if (!canInsertCalloutAt(view.state, boundary)) {
    return false;
  }

  view.dispatch(
    setCalloutTypeRequestMeta(view.state.tr, {
      type: "open",
      target: { type: "insert", boundary },
    }),
  );

  return true;
};

export const closeCalloutType = (view: EditorView) => {
  if (getCalloutTypeRequestTarget(view.state) === null) {
    return false;
  }

  view.dispatch(setCalloutTypeRequestMeta(view.state.tr, { type: "close" }));

  return true;
};

const readIndexPath = (doc: ProseMirrorNode, position: number) => {
  const $position = doc.resolve(position);

  return Array.from({ length: $position.depth + 1 }, (_, depth) => $position.index(depth));
};

const resolveIndexPath = (doc: ProseMirrorNode, path: readonly number[]) => {
  let node = doc;
  let position = 0;

  for (const [depth, index] of path.entries()) {
    if (index > node.childCount) {
      return null;
    }

    for (let child = 0; child < index; child += 1) {
      position += node.child(child).nodeSize;
    }

    if (depth < path.length - 1) {
      node = node.child(index);
      position += 1;
    }
  }

  return position;
};

// Settling a projection rewrites inline source back into the text it spells, which can move
// positions but never the blocks, so the target is found again by where it stands among them.
const settleProjectionAround = (view: EditorView, position: number) => {
  const path = readIndexPath(view.state.doc, position);

  return finalizeSourceProjection(view) ? resolveIndexPath(view.state.doc, path) : position;
};

export const applyCalloutType = (view: EditorView, request: CalloutTypeRequest, token: string) => {
  const { target } = request;

  if (
    !isCalloutType(request.dialect, token) ||
    view.state.doc !== request.document ||
    getCalloutTypeRequestTarget(view.state) !== target
  ) {
    return false;
  }

  if (target.type === "insert") {
    const boundary = settleProjectionAround(view, target.boundary);
    const { state } = view;
    const callout = createCalloutNode(state, request.dialect, token);

    if (boundary === null || !callout || !canInsertCalloutAt(state, boundary)) {
      return false;
    }

    const tr = state.tr.insert(boundary, callout);

    setSelectionNear(tr, boundary + CALLOUT_BODY_OFFSET);
    view.dispatch(tr.scrollIntoView());

    return true;
  }

  const current = view.state.doc.nodeAt(target.position);

  if (current?.type.name !== CALLOUT_NODE_NAME) {
    return false;
  }

  if (current.attrs.token === token) {
    return closeCalloutType(view);
  }

  const position = settleProjectionAround(view, target.position);
  const node = position === null ? null : view.state.doc.nodeAt(position);

  if (position === null || node?.type.name !== CALLOUT_NODE_NAME) {
    return false;
  }

  view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, token }));

  return true;
};

const findCollapsibleAdmonition = (state: EditorState) => {
  const position = findSelectedCalloutPosition(state);
  const node = position === null ? null : state.doc.nodeAt(position);

  return position !== null &&
    node?.attrs.dialect === "mkdocs" &&
    (node.attrs.marker === COLLAPSED_MARKER || node.attrs.marker === EXPANDED_MARKER)
    ? { node, position }
    : null;
};

export const canToggleCalloutExpanded = (state: EditorState) =>
  findCollapsibleAdmonition(state) !== null;

export const isCalloutExpanded = (state: EditorState) =>
  findCollapsibleAdmonition(state)?.node.attrs.marker === EXPANDED_MARKER;

export const toggleCalloutExpanded = (view: EditorView) => {
  const admonition = findCollapsibleAdmonition(view.state);

  if (!admonition) {
    return false;
  }

  const position = settleProjectionAround(view, admonition.position);
  const node = position === null ? null : view.state.doc.nodeAt(position);

  if (position === null || node?.type.name !== CALLOUT_NODE_NAME) {
    return false;
  }

  view.dispatch(
    view.state.tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      marker: node.attrs.marker === EXPANDED_MARKER ? COLLAPSED_MARKER : EXPANDED_MARKER,
    }),
  );

  return true;
};
