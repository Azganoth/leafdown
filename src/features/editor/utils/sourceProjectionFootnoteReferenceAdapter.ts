import {
  Fragment,
  Slice,
  type Mark,
  type Node as ProseMirrorNode,
} from "@milkdown/kit/prose/model";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Parser, Serializer } from "@milkdown/kit/transformer";

import {
  createLiteralSourceProjectionSlice,
  decodeSourceProjectionEscapes,
  mapLiteralSourceOffsetToDocument,
  shouldHandleInlineObjectTextInput,
  type SourceProjectionAdapter,
  type SourceProjectionParseResult,
  type SourceProjectionSessionRange,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";
import {
  FOOTNOTE_REFERENCE_NODE_NAME,
  getFootnoteReferenceSourceBounds,
  mapFootnoteReferenceSourceOffsetToDocument,
  parseFootnoteReferenceSource,
  serializeFootnoteReference,
} from "./sourceProjectionFootnoteReferenceSyntax";

const FOOTNOTE_REFERENCE_ADAPTER_ID = "footnote-reference";
const AMBIENT_MARK_CLASS_NAMES: Readonly<Record<string, string>> = {
  emphasis: "leafdown-source-projection__content--emphasis",
  strike_through: "leafdown-source-projection__content--strikethrough",
  strong: "leafdown-source-projection__content--strong",
};

interface FootnoteReferenceSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: typeof FOOTNOTE_REFERENCE_ADAPTER_ID;
  ambientMarks: readonly Mark[];
}

interface FootnoteReferenceAdapterDependencies {
  parser: Parser;
  serializer: Serializer;
}

const createFootnoteReferenceTarget = (
  state: EditorState,
  serializer: Serializer,
  node: ProseMirrorNode,
  from: number,
): FootnoteReferenceSourceProjectionTarget => ({
  adapterId: FOOTNOTE_REFERENCE_ADAPTER_ID,
  ambientMarks: node.marks,
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

  return session.from + mapLiteralSourceOffsetToDocument(result.source, position - session.from);
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
  const bounds = getFootnoteReferenceSourceBounds(result.source);

  return bounds
    ? session.from + mapFootnoteReferenceSourceOffsetToDocument(sourceOffset, bounds)
    : session.from;
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

const getFootnoteReferencePresentation = (source: string, ambientMarks: readonly Mark[]) => {
  const bounds = getFootnoteReferenceSourceBounds(source);

  if (!bounds) {
    return [];
  }

  const { labelFrom, labelTo } = bounds;
  const ambientClassNames = ambientMarks.flatMap((mark) => {
    const className = AMBIENT_MARK_CLASS_NAMES[mark.type.name];

    return className ? [className] : [];
  });

  return [
    {
      className: "leafdown-source-projection__marker",
      from: 0,
      to: labelFrom,
    },
    {
      className: [
        "leafdown-source-projection__content",
        "leafdown-source-projection__content--footnote-reference",
        ...ambientClassNames,
      ].join(" "),
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

const createMarkedLiteralSlice = (state: EditorState, source: string, marks: readonly Mark[]) =>
  source ? new Slice(Fragment.from(state.schema.text(source, marks)), 0, 0) : Slice.empty;

export const createFootnoteReferenceSourceProjectionAdapter = ({
  parser,
  serializer,
}: FootnoteReferenceAdapterDependencies): SourceProjectionAdapter<FootnoteReferenceSourceProjectionTarget> => ({
  id: FOOTNOTE_REFERENCE_ADAPTER_ID,
  canCopySelectionSemantically: (selection, session, parsed) => {
    if (!parseFootnoteReferenceSource(parser, parsed.source)) {
      return true;
    }

    return selection.from === session.from && selection.to === session.to;
  },
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  findTarget: (state) => findFootnoteReferenceTarget(state, serializer),
  getPresentation: ({ ambientMarks }, source) => {
    return {
      previews: [],
      sourceTypes: [FOOTNOTE_REFERENCE_ADAPTER_ID, ...ambientMarks.map((mark) => mark.type.name)],
      spans: getFootnoteReferencePresentation(source, ambientMarks),
    };
  },
  mapSelectionFromSource: (selection, session, result) =>
    mapSelectionFromSource(parser, selection, session, result),
  mapSelectionToSource: (selection, footnoteTarget) => {
    if (selection instanceof NodeSelection) {
      const bounds = getFootnoteReferenceSourceBounds(footnoteTarget.originalSource);

      if (!bounds) {
        return {
          anchor: footnoteTarget.from,
          head: footnoteTarget.from,
        };
      }

      return {
        anchor: footnoteTarget.from + bounds.labelFrom,
        head: footnoteTarget.from + bounds.labelTo,
      };
    }

    return {
      anchor: mapSelectionPositionToSource(selection.anchor, footnoteTarget),
      head: mapSelectionPositionToSource(selection.head, footnoteTarget),
    };
  },
  parseSource: (state, source, { ambientMarks }) => {
    const reference = parseFootnoteReferenceSource(parser, source);

    if (reference) {
      return {
        replacement: new Slice(Fragment.from(reference.mark(ambientMarks)), 0, 0),
        replacementSize: reference.nodeSize,
        source,
      };
    }

    const literal = decodeSourceProjectionEscapes(source);

    return {
      replacement: createMarkedLiteralSlice(state, literal, ambientMarks),
      replacementSize: literal.length,
      source,
    };
  },
  restoreCleanTarget: (state, session) =>
    state.tr.replace(session.from, session.to, session.target.originalContent),
  shouldHandleTextInput: shouldHandleInlineObjectTextInput,
});
