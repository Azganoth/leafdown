import { Fragment, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { getNodeType } from "../utils/milkdown";
import { BlockSelection, getSelectedBlockTargets } from "./blockSelection";
import {
  CALLOUT_NODE_NAME,
  CALLOUT_TYPES,
  createCalloutForm,
  type CalloutDialect,
} from "./callout";

export type CalloutTypeTarget =
  | { type: "change"; position: number }
  | { type: "insert"; boundary: number };

interface CalloutTypeState {
  target: CalloutTypeTarget | null;
}

type CalloutTypeMeta = { type: "open"; target: CalloutTypeTarget } | { type: "close" };

export interface CalloutTypeRequest {
  /** The callout's type badge, or for an insertion the block the callout will follow. */
  anchor: Element;
  dialect: CalloutDialect;
  /** The document the request was opened on; an edit to it retires the request. */
  document: ProseMirrorNode;
  target: CalloutTypeTarget;
  /** The callout's type as written, or `null` for a callout still to be inserted. */
  token: string | null;
}

export interface LeafdownCalloutTypePluginOptions {
  onClose?: () => void;
  onRequest?: (request: CalloutTypeRequest) => void;
}

export const CALLOUT_TYPE_BADGE_SELECTOR = "[data-leafdown-callout-type]";
const DEFAULT_CALLOUT_DIALECT: CalloutDialect = "github";

export const leafdownCalloutTypePluginKey = new PluginKey<CalloutTypeState>("leafdownCalloutType");

const CLOSED_STATE: CalloutTypeState = { target: null };

export const setCalloutTypeRequestMeta = (tr: Transaction, meta: CalloutTypeMeta) =>
  tr.setMeta(leafdownCalloutTypePluginKey, meta);

export const getCalloutTypeRequestTarget = (state: EditorState) =>
  leafdownCalloutTypePluginKey.getState(state)?.target ?? null;

/** The innermost callout holding the whole selection, or the one callout a block selection selects. */
export const findSelectedCalloutPosition = (state: EditorState): number | null => {
  const { selection } = state;

  if (selection instanceof BlockSelection) {
    const targets = getSelectedBlockTargets(selection);
    const [target] = targets;

    if (targets.length === 1 && target.node.type.name === CALLOUT_NODE_NAME) {
      return target.pos;
    }
  }

  if (selection instanceof NodeSelection && selection.node.type.name === CALLOUT_NODE_NAME) {
    return selection.from;
  }

  const { $from } = selection;

  for (let depth = $from.sharedDepth(selection.to); depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === CALLOUT_NODE_NAME) {
      return $from.before(depth);
    }
  }

  return null;
};

export const findNewCalloutDialect = (doc: ProseMirrorNode): CalloutDialect => {
  const dialects = new Set<CalloutDialect>();

  doc.descendants((node) => {
    if (node.type.name === CALLOUT_NODE_NAME) {
      dialects.add(node.attrs.dialect as CalloutDialect);
    }
  });

  return dialects.size === 1 ? [...dialects][0] : DEFAULT_CALLOUT_DIALECT;
};

export const createCalloutNode = (state: EditorState, dialect: CalloutDialect, token: string) => {
  const paragraph = getNodeType(state, "paragraph")?.create();

  return paragraph
    ? (getNodeType(state, CALLOUT_NODE_NAME)?.create(
        createCalloutForm(dialect, token),
        paragraph,
      ) ?? null)
    : null;
};

// The parser reads callouts only among the document's own blocks and in the bodies of colon
// fences long enough to hold another, so one written anywhere else reopens as something else.
export const canInsertCalloutAt = (state: EditorState, boundary: number) => {
  if (boundary < 0 || boundary > state.doc.content.size) {
    return false;
  }

  const $boundary = state.doc.resolve(boundary);
  // Command state asks on every transaction, and where a callout fits does not depend on its
  // dialect, so this skips the document walk choosing one.
  const callout = createCalloutNode(
    state,
    DEFAULT_CALLOUT_DIALECT,
    CALLOUT_TYPES[DEFAULT_CALLOUT_DIALECT][0],
  );

  return (
    callout !== null &&
    $boundary.depth === 0 &&
    state.doc.canReplace($boundary.index(), $boundary.index(), Fragment.from(callout))
  );
};

/** After the document block that holds the end of the selection. */
export const findCalloutInsertionBoundary = (state: EditorState) => {
  const { doc, selection } = state;
  const $end = doc.resolve(
    selection.empty ? selection.to : Math.max(selection.from, selection.to - 1),
  );
  const boundary = $end.depth === 0 ? selection.to : $end.after(1);

  return canInsertCalloutAt(state, boundary) ? boundary : null;
};

const findAnchor = (
  doc: ProseMirrorNode,
  target: CalloutTypeTarget,
  nodeDOM: (position: number) => Node | null,
) => {
  if (target.type === "change") {
    const callout = nodeDOM(target.position);

    return callout instanceof Element ? callout.querySelector(CALLOUT_TYPE_BADGE_SELECTOR) : null;
  }

  const $boundary = doc.resolve(target.boundary);
  const block = $boundary.nodeBefore
    ? nodeDOM(target.boundary - $boundary.nodeBefore.nodeSize)
    : nodeDOM(target.boundary);

  return block instanceof Element ? block : null;
};

export const createLeafdownCalloutTypePlugin = (options: LeafdownCalloutTypePluginOptions = {}) =>
  $prose(
    () =>
      new Plugin<CalloutTypeState>({
        key: leafdownCalloutTypePluginKey,
        state: {
          init: () => CLOSED_STATE,
          apply: (tr, value) => {
            const meta = tr.getMeta(leafdownCalloutTypePluginKey) as CalloutTypeMeta | undefined;

            if (meta?.type === "open") {
              return { target: meta.target };
            }

            if (meta?.type === "close") {
              return CLOSED_STATE;
            }

            // A staged type belongs to the document as it stood when the picker opened.
            return tr.docChanged && value.target !== null ? CLOSED_STATE : value;
          },
        },
        view: (editorView) => ({
          update: (view, previousState) => {
            const previous = getCalloutTypeRequestTarget(previousState);
            const target = getCalloutTypeRequestTarget(view.state);

            if (target === previous) {
              return;
            }

            const { doc } = view.state;
            const callout = target?.type === "change" ? doc.nodeAt(target.position) : null;
            const anchor = target
              ? findAnchor(doc, target, (position) => view.nodeDOM(position))
              : null;

            if (
              !target ||
              !anchor ||
              (target.type === "change" && callout?.type.name !== CALLOUT_NODE_NAME)
            ) {
              if (previous) {
                options.onClose?.();
              }

              return;
            }

            options.onRequest?.({
              anchor,
              dialect: callout
                ? (callout.attrs.dialect as CalloutDialect)
                : findNewCalloutDialect(doc),
              document: doc,
              target,
              token: callout ? (callout.attrs.token as string) : null,
            });
          },
          destroy: () => {
            if (getCalloutTypeRequestTarget(editorView.state)) {
              options.onClose?.();
            }
          },
        }),
      }),
  );
