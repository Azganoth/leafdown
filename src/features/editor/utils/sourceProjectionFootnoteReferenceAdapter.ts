import { Fragment, Slice, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Parser, Serializer } from "@milkdown/kit/transformer";

import {
  createLiteralSourceProjectionSlice,
  type SourceProjectionAdapter,
  type SourceProjectionParseResult,
  type SourceProjectionSessionRange,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";

const FOOTNOTE_REFERENCE_ADAPTER_ID = "footnote-reference";
const FOOTNOTE_REFERENCE_NODE_NAME = "footnote_reference";
const FOOTNOTE_DEFINITION_NODE_NAME = "footnote_definition";
const FOOTNOTE_REFERENCE_OPENING = "[^";
const FOOTNOTE_REFERENCE_CLOSING = "]";
const VALIDATION_DEFINITION_CONTENT = "Leafdown";

interface FootnoteReferenceSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: typeof FOOTNOTE_REFERENCE_ADAPTER_ID;
}

interface FootnoteReferenceAdapterDependencies {
  parser: Parser;
  serializer: Serializer;
}

const getFootnoteReferenceTarget = (
  target: SourceProjectionTarget,
): FootnoteReferenceSourceProjectionTarget => {
  if (target.adapterId !== FOOTNOTE_REFERENCE_ADAPTER_ID) {
    throw new Error(
      `Expected a footnote-reference source-projection target, received '${target.adapterId}'`,
    );
  }

  return target as FootnoteReferenceSourceProjectionTarget;
};

const serializeFootnoteReference = (
  state: EditorState,
  serializer: Serializer,
  node: ProseMirrorNode,
) => {
  const paragraph = state.schema.nodes.paragraph.create(null, node);
  const document = state.schema.nodes.doc.create(null, paragraph);

  return serializer(document).replace(/\n$/u, "");
};

const createFootnoteReferenceTarget = (
  state: EditorState,
  serializer: Serializer,
  node: ProseMirrorNode,
  from: number,
): FootnoteReferenceSourceProjectionTarget => ({
  adapterId: FOOTNOTE_REFERENCE_ADAPTER_ID,
  from,
  originalContent: state.doc.slice(from, from + node.nodeSize),
  originalContentSize: node.nodeSize,
  originalSource: serializeFootnoteReference(state, serializer, node),
  to: from + node.nodeSize,
});

const findFootnoteReferenceTarget = (
  state: EditorState,
  serializer: Serializer,
): FootnoteReferenceSourceProjectionTarget | null => {
  const { selection } = state;

  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === FOOTNOTE_REFERENCE_NODE_NAME
  ) {
    return createFootnoteReferenceTarget(state, serializer, selection.node, selection.from);
  }

  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$cursor) {
    return null;
  }

  const nodeAfter = selection.$cursor.nodeAfter;

  if (nodeAfter?.type.name === FOOTNOTE_REFERENCE_NODE_NAME) {
    return createFootnoteReferenceTarget(state, serializer, nodeAfter, selection.from);
  }

  const nodeBefore = selection.$cursor.nodeBefore;

  return nodeBefore?.type.name === FOOTNOTE_REFERENCE_NODE_NAME
    ? createFootnoteReferenceTarget(
        state,
        serializer,
        nodeBefore,
        selection.from - nodeBefore.nodeSize,
      )
    : null;
};

const hasCompleteFootnoteReferenceWrapper = (source: string) => {
  if (
    !source.startsWith(FOOTNOTE_REFERENCE_OPENING) ||
    !source.endsWith(FOOTNOTE_REFERENCE_CLOSING) ||
    /[\r\n]/u.test(source)
  ) {
    return false;
  }

  return source.length > FOOTNOTE_REFERENCE_OPENING.length + FOOTNOTE_REFERENCE_CLOSING.length;
};

const parseFootnoteReferenceSource = (parser: Parser, source: string): ProseMirrorNode | null => {
  if (!hasCompleteFootnoteReferenceWrapper(source)) {
    return null;
  }

  let document: ProseMirrorNode;

  try {
    document = parser(`${source}\n\n${source}: ${VALIDATION_DEFINITION_CONTENT}`);
  } catch {
    return null;
  }

  if (document.childCount !== 2) {
    return null;
  }

  const paragraph = document.firstChild;
  const definition = document.lastChild;
  const reference = paragraph?.childCount === 1 ? paragraph.firstChild : null;

  if (
    paragraph?.type.name !== "paragraph" ||
    reference?.type.name !== FOOTNOTE_REFERENCE_NODE_NAME ||
    definition?.type.name !== FOOTNOTE_DEFINITION_NODE_NAME ||
    reference.attrs.label !== definition.attrs.label
  ) {
    return null;
  }

  return reference;
};

const mapSelectionPositionToSource = (
  position: number,
  target: FootnoteReferenceSourceProjectionTarget,
) => {
  if (position <= target.from) {
    return position;
  }

  if (position >= target.to) {
    return target.from + target.originalSource.length + (position - target.to);
  }

  return target.from;
};

const mapLiteralSelectionPositionFromSource = (
  position: number,
  session: SourceProjectionSessionRange,
  result: SourceProjectionParseResult,
) => {
  if (position <= session.from) {
    return position;
  }

  if (position >= session.to) {
    return session.from + result.replacementSize + (position - session.to);
  }

  return position;
};

const mapAtomicSelectionPositionFromSource = (
  position: number,
  session: SourceProjectionSessionRange,
  result: SourceProjectionParseResult,
) => {
  if (position <= session.from) {
    return position;
  }

  if (position >= session.to) {
    return session.from + result.replacementSize + (position - session.to);
  }

  const sourceOffset = position - session.from;
  const labelFrom = FOOTNOTE_REFERENCE_OPENING.length;
  const labelTo = result.source.length - FOOTNOTE_REFERENCE_CLOSING.length;

  if (sourceOffset <= labelFrom) {
    return session.from;
  }

  if (sourceOffset >= labelTo) {
    return session.from + result.replacementSize;
  }

  return sourceOffset - labelFrom < labelTo - sourceOffset
    ? session.from
    : session.from + result.replacementSize;
};

const mapSelectionFromSource = (
  parser: Parser,
  selection: Selection,
  session: SourceProjectionSessionRange,
  result: SourceProjectionParseResult,
) => {
  const parsed = parseFootnoteReferenceSource(parser, result.source);
  const mapPosition = parsed
    ? (position: number) => mapAtomicSelectionPositionFromSource(position, session, result)
    : (position: number) => mapLiteralSelectionPositionFromSource(position, session, result);

  return {
    anchor: mapPosition(selection.anchor),
    head: mapPosition(selection.head),
  };
};

const getFootnoteReferencePresentation = (source: string) => {
  if (!hasCompleteFootnoteReferenceWrapper(source)) {
    return [];
  }

  const labelFrom = FOOTNOTE_REFERENCE_OPENING.length;
  const labelTo = source.length - FOOTNOTE_REFERENCE_CLOSING.length;

  return [
    {
      className: "leafdown-source-projection__marker",
      from: 0,
      to: labelFrom,
    },
    {
      className:
        "leafdown-source-projection__content leafdown-source-projection__content--footnote-reference",
      from: labelFrom,
      to: labelTo,
    },
    {
      className: "leafdown-source-projection__marker",
      from: labelTo,
      to: source.length,
    },
  ];
};

export const createFootnoteReferenceSourceProjectionAdapter = ({
  parser,
  serializer,
}: FootnoteReferenceAdapterDependencies): SourceProjectionAdapter => ({
  id: FOOTNOTE_REFERENCE_ADAPTER_ID,
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  findTarget: (state) => findFootnoteReferenceTarget(state, serializer),
  getPresentation: (_target, source) => ({
    sourceTypes: [FOOTNOTE_REFERENCE_ADAPTER_ID],
    spans: getFootnoteReferencePresentation(source),
  }),
  mapSelectionFromSource: (selection, session, result) =>
    mapSelectionFromSource(parser, selection, session, result),
  mapSelectionToSource: (selection, target) => {
    const footnoteTarget = getFootnoteReferenceTarget(target);

    if (selection instanceof NodeSelection) {
      return {
        anchor: footnoteTarget.from + FOOTNOTE_REFERENCE_OPENING.length,
        head:
          footnoteTarget.from +
          footnoteTarget.originalSource.length -
          FOOTNOTE_REFERENCE_CLOSING.length,
      };
    }

    return {
      anchor: mapSelectionPositionToSource(selection.anchor, footnoteTarget),
      head: mapSelectionPositionToSource(selection.head, footnoteTarget),
    };
  },
  parseSource: (state, source) => {
    const reference = parseFootnoteReferenceSource(parser, source);

    return reference
      ? {
          replacement: new Slice(Fragment.from(reference), 0, 0),
          replacementSize: reference.nodeSize,
          source,
        }
      : {
          replacement: createLiteralSourceProjectionSlice(state, source),
          replacementSize: source.length,
          source,
        };
  },
  restoreCleanTarget: (state, session) =>
    state.tr.replace(
      session.from,
      session.to,
      getFootnoteReferenceTarget(session.target).originalContent,
    ),
});
