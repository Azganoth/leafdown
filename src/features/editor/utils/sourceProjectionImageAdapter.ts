import { Fragment, Slice, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Parser, Serializer } from "@milkdown/kit/transformer";
import { open } from "@tauri-apps/plugin-dialog";

import { getPathParts, getRelativePath, toSlashPath } from "@/lib/path";

import { AUTHORED_URL_ATTRIBUTE_NAME } from "./characterReferenceMarkdown";
import { readEnclosingInlineConstructs, serializeLinkRunSource } from "./logicalLinkMarkdown";
import type { MarkdownReferenceContext } from "./markdownReferences";
import {
  REFERENCE_LABEL_ATTRIBUTE_NAME,
  REFERENCE_TYPE_ATTRIBUTE_NAME,
} from "./referenceLinkMarkdown";
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

const IMAGE_ADAPTER_ID = "image";
const IMAGE_FILTERS = [
  { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp"] },
];

interface ImageSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: typeof IMAGE_ADAPTER_ID;
  definitions: readonly string[];
}

interface ImageAdapterDependencies {
  getMarkdownReferenceContext: () => MarkdownReferenceContext;
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
    ? session.from + result.replacementSize + (position - session.to)
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
    return session.from + result.replacementSize + (position - session.to);
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

const getSelectedImageTarget = (selectedPath: string, context: MarkdownReferenceContext) => {
  const slashPath = toSlashPath(selectedPath);

  if (!context.documentPath) {
    return slashPath;
  }

  return getRelativePath(getPathParts(context.documentPath).parent, slashPath) ?? slashPath;
};

const selectImageSource = async (
  view: EditorView,
  source: string,
  target: ImageSourceProjectionTarget,
  parser: Parser,
  serializer: Serializer,
  getMarkdownReferenceContext: () => MarkdownReferenceContext,
) => {
  const selectedPath = await open({
    directory: false,
    filters: IMAGE_FILTERS,
    multiple: false,
    title: "Choose image",
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return null;
  }

  const image = parseStandaloneImageSource(parser, source, target.definitions);

  if (!image) {
    return null;
  }

  const selectedTarget = getSelectedImageTarget(selectedPath, getMarkdownReferenceContext());
  const updated = image.type.create(
    {
      ...image.attrs,
      src: selectedTarget,
      [AUTHORED_URL_ATTRIBUTE_NAME]: null,
      [REFERENCE_LABEL_ATTRIBUTE_NAME]: "",
      [REFERENCE_TYPE_ATTRIBUTE_NAME]: null,
    },
    image.content,
    image.marks,
  );

  return serializeLinkRunSource(view.state, serializer, [updated]);
};

export const createImageSourceProjectionAdapter = ({
  getMarkdownReferenceContext,
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
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  findTarget: (state) => findImageTarget(state, serializer),
  getPresentation: (target, source) => ({
    actions: [
      {
        disabled: parseStandaloneImageSource(parser, source, target.definitions) === null,
        key: "choose-image",
        label: "Choose image",
        run: (view, currentSource) =>
          selectImageSource(
            view,
            currentSource,
            target,
            parser,
            serializer,
            getMarkdownReferenceContext,
          ),
      },
    ],
    previews: [],
    sourceTypes: [IMAGE_ADAPTER_ID],
    spans: [
      {
        className: "leafdown-source-projection__marker",
        from: 0,
        to: source.length,
      },
    ],
  }),
  mapSelectionFromSource: (selection, session, result) =>
    mapSelectionFromSource(parser, selection, session, result),
  mapSelectionToSource: (selection, target) => {
    if (selection instanceof NodeSelection) {
      return {
        anchor: target.from,
        head: target.from + target.originalSource.length,
      };
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
  restoreCleanTarget: (state, session) =>
    state.tr.replace(session.from, session.to, session.target.originalContent),
  serializeInlineSource: (state, fragment) => {
    const image = fragment.childCount === 1 ? fragment.firstChild : null;

    return isStandaloneImage(image) ? serializeLinkRunSource(state, serializer, [image]) : null;
  },
  shouldHandleTextInput: shouldHandleInlineObjectTextInput,
});
