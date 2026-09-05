import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { Serializer } from "@milkdown/kit/transformer";

import {
  createLiteralSourceProjectionSlice,
  decodeSourceProjectionEscapes,
  findSourceProjectionEscapeOffsets,
  mapLiteralDocumentOffsetToSource,
  mapLiteralSourceOffsetToDocument,
  type LiteralSourceCommit,
  type SourceProjectionAdapter,
  type SourceProjectionParseResult,
  type SourceProjectionSessionRange,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";
import { getTextBetween, type TextRange } from "./textRanges";

const ESCAPE_ADAPTER_ID = "escape";
const TRAILING_BLOCK_SEPARATOR_PATTERN = /\n+$/u;

interface EscapeSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: typeof ESCAPE_ADAPTER_ID;
}

type FindLiteralSourceCommit = (state: EditorState, range: TextRange) => LiteralSourceCommit | null;

interface EscapeSourceProjectionAdapterDependencies {
  findLiteralSourceCommit: FindLiteralSourceCommit;
  serializer: Serializer;
}

const serializeEscapedRun = (state: EditorState, serializer: Serializer, text: string) => {
  const paragraph = state.schema.nodes.paragraph.create(null, state.schema.text(text));

  return serializer(state.schema.nodes.doc.create(null, paragraph)).replace(
    TRAILING_BLOCK_SEPARATOR_PATTERN,
    "",
  );
};

const findEscapeTarget = (
  state: EditorState,
  serializer: Serializer,
  findLiteralSourceCommit: FindLiteralSourceCommit,
): EscapeSourceProjectionTarget | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || selection.$from.parent !== selection.$to.parent) {
    return null;
  }

  const commit = findLiteralSourceCommit(state, { from: selection.from, to: selection.to });

  if (!commit) {
    return null;
  }

  const text = getTextBetween(state.doc, commit.from, commit.to);
  const source = serializeEscapedRun(state, serializer, text);

  // Do not offer a gesture that would commit serialization changes beyond escaping.
  if (source === text || decodeSourceProjectionEscapes(source) !== text) {
    return null;
  }

  return {
    adapterId: ESCAPE_ADAPTER_ID,
    from: commit.from,
    originalContent: state.doc.slice(commit.from, commit.to),
    originalContentSize: commit.to - commit.from,
    originalSource: source,
    to: commit.to,
  };
};

const mapSelectionPositionToSource = (position: number, target: EscapeSourceProjectionTarget) => {
  if (position <= target.from) {
    return position;
  }

  if (position >= target.to) {
    return target.from + target.originalSource.length + (position - target.to);
  }

  return (
    target.from + mapLiteralDocumentOffsetToSource(target.originalSource, position - target.from)
  );
};

const mapSelectionPositionFromSource = (
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

  const offset = mapLiteralSourceOffsetToDocument(result.source, position - session.from);

  return session.from + Math.min(offset, result.replacementSize);
};

export const createEscapeSourceProjectionAdapter = ({
  findLiteralSourceCommit,
  serializer,
}: EscapeSourceProjectionAdapterDependencies): SourceProjectionAdapter<EscapeSourceProjectionTarget> => ({
  id: ESCAPE_ADAPTER_ID,
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  findTarget: (state) => findEscapeTarget(state, serializer, findLiteralSourceCommit),
  getPresentation: (_target, source) => ({
    previews: [],
    sourceTypes: [ESCAPE_ADAPTER_ID],
    spans: findSourceProjectionEscapeOffsets(source).map((offset) => ({
      className: "leafdown-source-projection__marker",
      from: offset,
      to: offset + 1,
    })),
  }),
  mapSelectionFromSource: (selection: Selection, session, result) => ({
    anchor: mapSelectionPositionFromSource(selection.anchor, session, result),
    head: mapSelectionPositionFromSource(selection.head, session, result),
  }),
  mapSelectionToSource: (selection: Selection, target) => ({
    anchor: mapSelectionPositionToSource(selection.anchor, target),
    head: mapSelectionPositionToSource(selection.head, target),
  }),
  // Object adapters can parse the projected document text directly.
  parseSource: (state, source, target) => {
    const commit = findLiteralSourceCommit(state, { from: target.from, to: target.from });

    if (commit && commit.from === target.from && commit.to === target.from + source.length) {
      return {
        replacement: commit.replacement,
        replacementSize: commit.replacement.content.size,
        source,
      };
    }

    const literal = decodeSourceProjectionEscapes(source);

    return {
      replacement: createLiteralSourceProjectionSlice(state, literal),
      replacementSize: literal.length,
      source,
    };
  },
  restoreCleanTarget: (state, session) =>
    state.tr.replace(session.from, session.to, session.target.originalContent),
  shouldFinalizeInPlace: (state, session) => {
    const commit = findLiteralSourceCommit(state, { from: session.from, to: session.from });

    return commit?.from === session.from && commit.to === session.to;
  },
});
