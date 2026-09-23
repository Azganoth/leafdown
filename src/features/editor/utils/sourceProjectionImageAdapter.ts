import { Fragment, Slice, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Parser, Serializer } from "@milkdown/kit/transformer";

import { readEnclosingInlineConstructs, serializeLinkRunSource } from "./logicalLinkMarkdown";
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
import { getDocumentDefinitionSources } from "./sourceProjectionDefinitions";
import { isStandaloneImage, parseStandaloneImageSource } from "./sourceProjectionImageSyntax";
import { getImageSourcePresentationSpans } from "./sourceProjectionLinkPresentation";

const IMAGE_ADAPTER_ID = "image";
const IMAGE_DESCRIPTION_START_OFFSET = 2;

interface ImageSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: typeof IMAGE_ADAPTER_ID;
  definitions: readonly string[];
}

interface ImageAdapterDependencies {
  parser: Parser;
  serializer: Serializer;
}

const createImageTarget = (
  state: EditorState,
  serializer: Serializer,
  node: ProseMirrorNode,
  from: number,
): ImageSourceProjectionTarget => ({
  adapterId: IMAGE_ADAPTER_ID,
  definitions: getDocumentDefinitionSources(state.doc),
  from,
  originalContent: state.doc.slice(from, from + node.nodeSize),
  originalContentSize: node.nodeSize,
  originalSource: serializeLinkRunSource(
    state,
    serializer,
    [node],
    readEnclosingInlineConstructs(state.doc.resolve(from)),
  ),
  to: from + node.nodeSize,
});

const findImageTarget = (
  state: EditorState,
  serializer: Serializer,
): ImageSourceProjectionTarget | null => {
  const { selection } = state;

  if (selection instanceof NodeSelection && isStandaloneImage(selection.node)) {
    return createImageTarget(state, serializer, selection.node, selection.from);
  }

  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$cursor) {
    return null;
  }

  const nodeAfter = selection.$cursor.nodeAfter;

  if (isStandaloneImage(nodeAfter)) {
    return createImageTarget(state, serializer, nodeAfter, selection.from);
  }

  const nodeBefore = selection.$cursor.nodeBefore;

  return isStandaloneImage(nodeBefore)
    ? createImageTarget(state, serializer, nodeBefore, selection.from - nodeBefore.nodeSize)
    : null;
};

const mapSelectionPositionToSource = (position: number, target: ImageSourceProjectionTarget) => {
  if (position <= target.from) {
    return position;
  }

  return position >= target.to
    ? target.from + target.originalSource.length + (position - target.to)
    : target.from;
};

const mapAtomicSelectionPositionFromSource = (
  position: number,
  session: SourceProjectionSessionRange,
  result: SourceProjectionParseResult,
) => {
  if (position <= session.from) {
    return position;
  }

  return position >= session.to
    ? session.from +
        result.replacementSize +
        Math.max(0, position - session.to - session.target.originalContentSize)
    : session.from;
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
    return (
      session.from +
      result.replacementSize +
      Math.max(0, position - session.to - session.target.originalContentSize)
    );
  }

  return session.from + mapLiteralSourceOffsetToDocument(result.source, position - session.from);
};

const mapSelectionFromSource = (
  parser: Parser,
  selection: Selection,
  session: SourceProjectionSessionRange<ImageSourceProjectionTarget>,
  result: SourceProjectionParseResult,
) => {
  const mapPosition = parseStandaloneImageSource(parser, result.source, session.target.definitions)
    ? mapAtomicSelectionPositionFromSource
    : mapLiteralSelectionPositionFromSource;

  return {
    anchor: mapPosition(selection.anchor, session, result),
    head: mapPosition(selection.head, session, result),
  };
};

export const createImageSourceProjectionAdapter = ({
  parser,
  serializer,
}: ImageAdapterDependencies): SourceProjectionAdapter<ImageSourceProjectionTarget> => ({
  id: IMAGE_ADAPTER_ID,
  canCopySelectionSemantically: (selection, session, parsed) =>
    !parseStandaloneImageSource(parser, parsed.source, session.target.definitions) ||
    (selection.from === session.from && selection.to === session.to),
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.from,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  findTarget: (state) => findImageTarget(state, serializer),
  getPresentation: (_target, source) => ({
    previews: [],
    sourceTypes: [IMAGE_ADAPTER_ID],
    spans: getImageSourcePresentationSpans(source),
  }),
  getRestoreRange: (session) => ({
    from: session.from,
    to: session.to + session.target.originalContentSize,
  }),
  mapSelectionFromSource: (selection, session, result) =>
    mapSelectionFromSource(parser, selection, session, result),
  mapSelectionToSource: (selection, target, context) => {
    if (context.direction === "forward") {
      return { anchor: target.from, head: target.from };
    }

    if (context.direction === "backward") {
      const sourceEnd = target.from + target.originalSource.length;

      return { anchor: sourceEnd, head: sourceEnd };
    }

    if (context.pointer && selection instanceof NodeSelection) {
      const descriptionStart = Math.min(
        target.from + IMAGE_DESCRIPTION_START_OFFSET,
        target.from + target.originalSource.length,
      );

      return {
        anchor: descriptionStart,
        head: descriptionStart,
      };
    }

    if (selection instanceof NodeSelection) {
      return { anchor: target.from, head: target.from };
    }

    return {
      anchor: mapSelectionPositionToSource(selection.anchor, target),
      head: mapSelectionPositionToSource(selection.head, target),
    };
  },
  parseSource: (state, source, target) => {
    const image = parseStandaloneImageSource(parser, source, target.definitions);

    if (image) {
      return {
        replacement: new Slice(Fragment.from(image), 0, 0),
        replacementSize: image.nodeSize,
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
  restoreCleanTarget: (state, session) => state.tr.delete(session.from, session.to),
  serializeInlineSource: (state, fragment) => {
    const image = fragment.childCount === 1 ? fragment.firstChild : null;

    return isStandaloneImage(image) ? serializeLinkRunSource(state, serializer, [image]) : null;
  },
  shouldHandleTextInput: shouldHandleInlineObjectTextInput,
});
