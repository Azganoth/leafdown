import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { MarkdownNode, MarkSchema, NodeSchema } from "@milkdown/kit/transformer";

import {
  BLOCK_ADJACENT_ATTRIBUTE_NAME,
  DEFAULT_BLOCK_ADJACENT,
  readBlockAdjacent,
} from "./blockSeparatorMarkdown";
import {
  AUTHORED_DESCRIPTION_ATTRIBUTE_NAME,
  AUTHORED_TITLE_ATTRIBUTE_NAME,
  AUTHORED_URL_ATTRIBUTE_NAME,
  readAuthoredDescription,
  readAuthoredTitle,
  readWrittenTitle,
} from "./characterReferenceMarkdown";
import {
  chooseTitleMarker,
  readTitleMarker,
  TITLE_MARKER_ATTRIBUTE_NAME,
  TITLE_MARKER_PAIRS,
  type TitleMarker,
} from "./markdownTitle";

export const DEFINITION_NODE_NAME = "definition";
export const DEFINITION_MARKDOWN_TYPE = "definition";
export const DEFINITION_LABEL_NODE_NAME = "definition_label";
export const DEFINITION_DESTINATION_NODE_NAME = "definition_destination";
export const DEFINITION_TITLE_NODE_NAME = "definition_title";
export const LINK_REFERENCE_MARKDOWN_TYPE = "linkReference";
export const IMAGE_REFERENCE_MARKDOWN_TYPE = "imageReference";

// A reference carries the form it was authored in and the label as it was spelled there.
export const REFERENCE_TYPE_ATTRIBUTE_NAME = "referenceType";
export const REFERENCE_LABEL_ATTRIBUTE_NAME = "referenceLabel";

// A definition carries the form its destination was written in and the whitespace runs its two
// optional line endings sit in, which is everything a definition holds that its label, destination,
// title, and title marker do not already answer for.
export const DESTINATION_MARKER_ATTRIBUTE_NAME = "destinationMarker";
export const DESTINATION_SEPARATOR_ATTRIBUTE_NAME = "destinationSeparator";
export const TITLE_SEPARATOR_ATTRIBUTE_NAME = "titleSeparator";

const DEFINITION_DOM_TYPE = "definition";
const DEFINITION_LABEL_DOM_TYPE = "definition-label";
const DEFINITION_DESTINATION_DOM_TYPE = "definition-destination";
const DEFINITION_TITLE_DOM_TYPE = "definition-title";
const LABEL_WHITESPACE_PATTERN = /[\t\n\r ]+/gu;
const REFERENCE_TYPES: readonly unknown[] = ["collapsed", "full", "shortcut"];

export type ReferenceType = "collapsed" | "full" | "shortcut";
export type DestinationMarker = "" | "<";

export interface AuthoredDefinitionForm {
  destinationMarker: DestinationMarker;
  destinationSeparator: string;
  titleSeparator: string;
}

export interface DefinitionAttrs extends AuthoredDefinitionForm {
  authoredTitle: string | null;
  label: string;
  title: string;
  titleMarker: TitleMarker;
  url: string;
}

export interface DefinitionFieldNodes {
  destination: ProseMirrorNode;
  label: ProseMirrorNode;
  title: ProseMirrorNode;
}

// CommonMark matches a reference to a definition on a label whose whitespace is collapsed, whose
// ends are trimmed, and whose case is ignored.
export const normalizeReferenceLabel = (label: string) =>
  label.replace(LABEL_WHITESPACE_PATTERN, " ").trim().toLowerCase();

const MAX_REFERENCE_LABEL_LENGTH = 999;
const WRITABLE_REFERENCE_LABEL_PATTERN = /^(?:[^\\[\]\r\n]|\\[^\r\n])+$/u;

export const isWritableReferenceDefinitionLabel = (label: string) =>
  label.length <= MAX_REFERENCE_LABEL_LENGTH &&
  normalizeReferenceLabel(label).length > 0 &&
  WRITABLE_REFERENCE_LABEL_PATTERN.test(label);

export const readReferenceType = (node: object): ReferenceType | null => {
  const referenceType = (node as { referenceType?: unknown }).referenceType;

  return REFERENCE_TYPES.includes(referenceType) ? (referenceType as ReferenceType) : null;
};

const readReferenceLabel = (node: object) => {
  const label = (node as { label?: unknown }).label;
  const identifier = (node as { identifier?: unknown }).identifier;

  if (typeof label === "string") {
    return label;
  }

  return typeof identifier === "string" ? identifier : "";
};

const readString = (source: object, key: string) => {
  const value = (source as Record<string, unknown>)[key];

  return typeof value === "string" ? value : "";
};

// `micromark` trims only the space its collapse leaves, and folds case through upper case as well,
// which is what matches `ß` with `SS`.
const toIdentifier = (label: string) =>
  label
    .replace(LABEL_WHITESPACE_PATTERN, " ")
    .replace(/^ | $/gu, "")
    .toLowerCase()
    .toUpperCase()
    .toLowerCase();

// A container writes its own prefix before a label's continuation line, and a paragraph drops the
// whitespace opening one, so neither belongs to the label. A `>` cannot open a continuation line a
// label reads on, because it would open a block quote there instead.
const CONTINUATION_PREFIX_PATTERN = /^[\t >]*/u;

const withoutContinuationPrefixes = (raw: string) =>
  raw
    .split("\n")
    .map((line, index) => (index === 0 ? line : line.replace(CONTINUATION_PREFIX_PATTERN, "")))
    .join("\n");

// A reference matches its definition on the label as the file spelled it, escapes included, so the
// spelling is what both are written back with. The slice is trusted only where it spells the
// identifier the parser matched on; otherwise the decoded label stands where it still spells it,
// and the identifier itself where it does not, which keeps the match at the cost of case and
// spacing.
const chooseLabelSpelling = (node: object, authored: string | null) => {
  const identifier = readString(node, "identifier");

  if (!identifier) {
    return null;
  }

  return (
    [authored, readString(node, "label")].find(
      (candidate) => candidate && toIdentifier(candidate) === identifier,
    ) ?? identifier
  );
};

const isEscaped = (source: string, index: number) => {
  let backslashes = 0;

  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }

  return backslashes % 2 === 1;
};

const COLLAPSED_REFERENCE_TAIL = "[]";

// A label holds no unescaped bracket, so a full reference's label opens at the last unescaped `[`,
// while the collapsed and shortcut forms spell their label as the text between the opening bracket
// and the tail.
const findReferenceLabelSource = (raw: string, node: object) => {
  const source = withoutContinuationPrefixes(raw);
  const opening = source.startsWith("!") ? 2 : 1;

  if (!source.endsWith("]")) {
    return null;
  }

  switch (readReferenceType(node)) {
    case "full": {
      for (let index = source.length - 2; index >= opening; index -= 1) {
        if (source[index] === "[" && !isEscaped(source, index)) {
          return source.slice(index + 1, -1);
        }
      }

      return null;
    }
    case "collapsed": {
      return source.endsWith(`]${COLLAPSED_REFERENCE_TAIL}`)
        ? source.slice(opening, -COLLAPSED_REFERENCE_TAIL.length - 1)
        : null;
    }
    case "shortcut": {
      return source.slice(opening, -1);
    }
    default: {
      return null;
    }
  }
};

const DEFINITION_LABEL_PATTERN = /^\[((?:[^\\\]]|\\[\S\s])*)\]:/u;

export const findReferenceLabelSpelling = (raw: string, node: object) =>
  chooseLabelSpelling(node, findReferenceLabelSource(raw, node));

export const findDefinitionLabelSpelling = (raw: string, node: object) =>
  chooseLabelSpelling(
    node,
    DEFINITION_LABEL_PATTERN.exec(withoutContinuationPrefixes(raw))?.[1] ?? null,
  );

const readReferenceAttrs = (node: MarkdownNode) => ({
  [REFERENCE_TYPE_ATTRIBUTE_NAME]: readReferenceType(node),
  [REFERENCE_LABEL_ATTRIBUTE_NAME]: readReferenceLabel(node),
});

const getReferenceProps = (attrs: Record<string, unknown>) => {
  const label = readString(attrs, REFERENCE_LABEL_ATTRIBUTE_NAME);

  return {
    identifier: label,
    label,
    [REFERENCE_TYPE_ATTRIBUTE_NAME]: readReferenceType(attrs),
  };
};

const REFERENCE_ATTRS = {
  [REFERENCE_TYPE_ATTRIBUTE_NAME]: { default: null, validate: "string|null" },
  [REFERENCE_LABEL_ATTRIBUTE_NAME]: { default: "", validate: "string" },
} as const;

const omitReferenceAttributes = (attributes: Record<string, unknown>) => {
  const rendered = { ...attributes };

  delete rendered[REFERENCE_TYPE_ATTRIBUTE_NAME];
  delete rendered[REFERENCE_LABEL_ATTRIBUTE_NAME];

  return rendered;
};

const CONTROL_CHARACTER_MAX_CODE = 0x20;
const DELETE_CHARACTER_CODE = 0x7f;

const ANGLE_DESTINATION_MARKER = "<";
const BARE_DESTINATION_MARKER = "";
// The form a definition is written in when it has none of its own: one the editor created, and one
// whose authored form cannot be recovered.
const DEFAULT_DEFINITION_SEPARATOR = " ";
const DEFAULT_DEFINITION_FORM: AuthoredDefinitionForm = {
  destinationMarker: BARE_DESTINATION_MARKER,
  destinationSeparator: DEFAULT_DEFINITION_SEPARATOR,
  titleSeparator: DEFAULT_DEFINITION_SEPARATOR,
};

// CommonMark lets each of a definition's two whitespace runs carry up to one line ending, which is
// what a definition written across two or three lines spends.
const DEFINITION_SEPARATOR_PATTERN = /^[\t ]*\n?[\t ]*$/u;
// The slice a definition was built from opens at its label's `[`. A label ends at its first
// unescaped `]`, and a destination either stands between angle brackets or runs to the whitespace
// after it, so one pass over the head names the first run and the form the destination was written
// in, and what remains opens with the second run wherever a title follows.
const DEFINITION_HEAD_PATTERN =
  /^\[(?:[^\\\]]|\\[\S\s])*\]:([\t ]*\n?[\t ]*)(<(?:[^\\<>]|\\[\S\s])*>|[^\s<]\S*)?/u;
const DEFINITION_TITLE_SEPARATOR_PATTERN = /^([\t ]*\n?[\t ]*)["'(]/u;

// A destination the bare form cannot spell: an empty one, and one holding whitespace or a control
// character, which is the branch `mdast-util-to-markdown` takes for the same reason.
const needsAngleDestination = (url: string) => {
  for (let index = 0; index < url.length; index += 1) {
    const code = url.charCodeAt(index);

    if (code <= CONTROL_CHARACTER_MAX_CODE || code === DELETE_CHARACTER_CODE) {
      return true;
    }
  }

  return url === "";
};

// A destination stands between angle brackets where it was authored between them, and wherever the
// bare form would not be read back as the destination the document holds. The recorded form only
// adds the brackets, so a destination that needs them keeps them however it was authored.
export const usesAngleDestination = (url: string, marker: DestinationMarker) =>
  marker === ANGLE_DESTINATION_MARKER || needsAngleDestination(url);

const ANGLE_DESTINATION_ESCAPE_PATTERN = /[<>]/gu;

export const readDestinationMarker = (source: object): DestinationMarker =>
  (source as { destinationMarker?: unknown }).destinationMarker === ANGLE_DESTINATION_MARKER
    ? ANGLE_DESTINATION_MARKER
    : BARE_DESTINATION_MARKER;

const readSeparator = (source: object, name: string) => {
  const run = (source as Record<string, unknown>)[name];

  return typeof run === "string" && DEFINITION_SEPARATOR_PATTERN.test(run)
    ? run
    : DEFAULT_DEFINITION_SEPARATOR;
};

export const readDestinationSeparator = (source: object) =>
  readSeparator(source, DESTINATION_SEPARATOR_ATTRIBUTE_NAME);

// A title is separated from the destination by whitespace, so an empty run is one no definition was
// read with and the default stands in its place.
export const readTitleSeparator = (source: object) =>
  readSeparator(source, TITLE_SEPARATOR_ATTRIBUTE_NAME) || DEFAULT_DEFINITION_SEPARATOR;

// A definition inside a container is sliced with whatever that container wrote before each of its
// continuation lines, and the serializer writes that prefix back around every line it makes, so the
// run a continuation line opens with is read past the columns the container owns rather than
// through them. A prefix the column count does not describe leaves a run the patterns reject, which
// is the default form rather than a guess.
const withoutContainerPrefix = (raw: string, width: number) =>
  width > 0
    ? raw
        .split("\n")
        .map((line, index) => (index === 0 ? line : line.slice(width)))
        .join("\n")
    : raw;

export const findDefinitionForm = (raw: string, containerWidth = 0): AuthoredDefinitionForm => {
  const source = withoutContainerPrefix(raw, containerWidth);
  const head = DEFINITION_HEAD_PATTERN.exec(source);

  if (!head) {
    return DEFAULT_DEFINITION_FORM;
  }

  const [matched, destinationSeparator, destination = ""] = head;
  const title = DEFINITION_TITLE_SEPARATOR_PATTERN.exec(source.slice(matched.length));

  return {
    destinationMarker: destination.startsWith(ANGLE_DESTINATION_MARKER)
      ? ANGLE_DESTINATION_MARKER
      : BARE_DESTINATION_MARKER,
    destinationSeparator,
    titleSeparator: title?.[1] ?? DEFAULT_DEFINITION_SEPARATOR,
  };
};

// The angle brackets close on the first unescaped `>`, so a destination spelling one of them gives
// up a backslash here as it does in the file the serializer writes.
export const serializeDefinitionMarkdown = ({
  authoredTitle,
  destinationMarker,
  destinationSeparator,
  label,
  title,
  titleMarker,
  titleSeparator,
  url,
}: DefinitionAttrs) => {
  const destination = usesAngleDestination(url, destinationMarker)
    ? `<${url.replace(ANGLE_DESTINATION_ESCAPE_PATTERN, String.raw`\$&`)}>`
    : url;
  const head = `[${label}]:${destinationSeparator}${destination}`;

  if (!title) {
    return head;
  }

  const written = readWrittenTitle({ authoredTitle }, title).title;
  const [opening, closing] = TITLE_MARKER_PAIRS[chooseTitleMarker(written, titleMarker)];

  return `${head}${titleSeparator}${opening}${written}${closing}`;
};

export const readDefinitionAttrs = (attrs: Record<string, unknown>): DefinitionAttrs => ({
  authoredTitle: readAuthoredTitle(attrs),
  destinationMarker: readDestinationMarker(attrs),
  destinationSeparator: readDestinationSeparator(attrs),
  label: readString(attrs, "label"),
  title: readString(attrs, "title"),
  titleMarker: readTitleMarker({ titleMarker: attrs[TITLE_MARKER_ATTRIBUTE_NAME] }),
  titleSeparator: readTitleSeparator(attrs),
  url: readString(attrs, "url"),
});

const createDefinitionFieldSchema = (domType: string, className: string): NodeSchema => ({
  content: "text*",
  marks: "",
  isolating: true,
  parseDOM: [{ tag: `span[data-type="${domType}"]` }],
  toDOM: () => ["span", { class: className, "data-type": domType }, 0],
  parseMarkdown: {
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: () => false,
    runner: () => {},
  },
});

export const definitionLabelNodeSchema = createDefinitionFieldSchema(
  DEFINITION_LABEL_DOM_TYPE,
  "leafdown-definition-label",
);

export const definitionDestinationNodeSchema = createDefinitionFieldSchema(
  DEFINITION_DESTINATION_DOM_TYPE,
  "leafdown-definition-destination",
);

export const definitionTitleNodeSchema = createDefinitionFieldSchema(
  DEFINITION_TITLE_DOM_TYPE,
  "leafdown-definition-title",
);

export const getDefinitionFieldNodes = (
  definition: ProseMirrorNode,
): DefinitionFieldNodes | null => {
  if (definition.childCount !== 3) {
    return null;
  }

  const label = definition.child(0);
  const destination = definition.child(1);
  const title = definition.child(2);

  return label.type.name === DEFINITION_LABEL_NODE_NAME &&
    destination.type.name === DEFINITION_DESTINATION_NODE_NAME &&
    title.type.name === DEFINITION_TITLE_NODE_NAME
    ? { destination, label, title }
    : null;
};

const addDefinitionField = (
  state: Parameters<NonNullable<NodeSchema["parseMarkdown"]>["runner"]>[0],
  type: Parameters<NonNullable<NodeSchema["parseMarkdown"]>["runner"]>[2],
  value: string,
) => {
  state.openNode(type);

  if (value) {
    state.addText(value);
  }

  state.closeNode();
};

// The three fields are document text while the syntax around them remains generated chrome. The
// parent keeps the committed values and authored form, which lets a plugin derive an in-flight edit
// from disagreement with its child text without maintaining a second editing session.
export const definitionNodeSchema: NodeSchema = {
  group: "block",
  content: `${DEFINITION_LABEL_NODE_NAME} ${DEFINITION_DESTINATION_NODE_NAME} ${DEFINITION_TITLE_NODE_NAME}`,
  selectable: true,
  draggable: true,
  defining: true,
  isolating: true,
  attrs: {
    label: { default: "", validate: "string" },
    url: { default: "", validate: "string" },
    title: { default: "", validate: "string" },
    [AUTHORED_TITLE_ATTRIBUTE_NAME]: { default: null, validate: "string|null" },
    [TITLE_MARKER_ATTRIBUTE_NAME]: { default: '"', validate: "string" },
    [DESTINATION_MARKER_ATTRIBUTE_NAME]: {
      default: DEFAULT_DEFINITION_FORM.destinationMarker,
      validate: "string",
    },
    [DESTINATION_SEPARATOR_ATTRIBUTE_NAME]: {
      default: DEFAULT_DEFINITION_FORM.destinationSeparator,
      validate: "string",
    },
    [TITLE_SEPARATOR_ATTRIBUTE_NAME]: {
      default: DEFAULT_DEFINITION_FORM.titleSeparator,
      validate: "string",
    },
    [BLOCK_ADJACENT_ATTRIBUTE_NAME]: {
      default: DEFAULT_BLOCK_ADJACENT,
      validate: "boolean",
    },
  },
  parseDOM: [
    {
      tag: `div[data-type="${DEFINITION_DOM_TYPE}"]`,
      getAttrs: (dom) => {
        const element = dom;

        return readDefinitionAttrs({
          label: element.getAttribute("data-label") ?? "",
          url: element.getAttribute("data-url") ?? "",
          title: element.getAttribute("data-title") ?? "",
          [AUTHORED_TITLE_ATTRIBUTE_NAME]: element.getAttribute("data-authored-title"),
          [TITLE_MARKER_ATTRIBUTE_NAME]: element.getAttribute("data-title-marker"),
          [DESTINATION_MARKER_ATTRIBUTE_NAME]: element.getAttribute("data-destination-marker"),
          [DESTINATION_SEPARATOR_ATTRIBUTE_NAME]: element.getAttribute(
            "data-destination-separator",
          ),
          [TITLE_SEPARATOR_ATTRIBUTE_NAME]: element.getAttribute("data-title-separator"),
        });
      },
    },
  ],
  toDOM: (node) => {
    const attrs = readDefinitionAttrs(node.attrs);

    return [
      "div",
      {
        class: "leafdown-definition",
        "data-type": DEFINITION_DOM_TYPE,
        "data-label": attrs.label,
        "data-url": attrs.url,
        "data-title": attrs.title,
        "data-authored-title": attrs.authoredTitle,
        "data-title-marker": attrs.titleMarker,
        "data-destination-marker": attrs.destinationMarker,
        "data-destination-separator": attrs.destinationSeparator,
        "data-title-separator": attrs.titleSeparator,
      },
      0,
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === DEFINITION_MARKDOWN_TYPE,
    runner: (state, node, type) => {
      const attrs = {
        ...readDefinitionAttrs({
          label: readReferenceLabel(node),
          url: readString(node, "url"),
          title: readString(node, "title"),
          [AUTHORED_TITLE_ATTRIBUTE_NAME]: readAuthoredTitle(node),
          [TITLE_MARKER_ATTRIBUTE_NAME]: readTitleMarker(node),
          [DESTINATION_MARKER_ATTRIBUTE_NAME]: readDestinationMarker(node),
          [DESTINATION_SEPARATOR_ATTRIBUTE_NAME]: readDestinationSeparator(node),
          [TITLE_SEPARATOR_ATTRIBUTE_NAME]: readTitleSeparator(node),
        }),
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node),
      };

      state.openNode(type, attrs);
      addDefinitionField(state, type.schema.nodes[DEFINITION_LABEL_NODE_NAME], attrs.label);
      addDefinitionField(state, type.schema.nodes[DEFINITION_DESTINATION_NODE_NAME], attrs.url);
      addDefinitionField(
        state,
        type.schema.nodes[DEFINITION_TITLE_NODE_NAME],
        readWrittenTitle(attrs, attrs.title).title,
      );
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === DEFINITION_NODE_NAME,
    runner: (state, node) => {
      state.addNode(DEFINITION_MARKDOWN_TYPE, undefined, undefined, {
        identifier: node.attrs.label,
        label: node.attrs.label,
        url: node.attrs.url,
        title: node.attrs.title || null,
        [AUTHORED_TITLE_ATTRIBUTE_NAME]: node.attrs[AUTHORED_TITLE_ATTRIBUTE_NAME],
        [TITLE_MARKER_ATTRIBUTE_NAME]: node.attrs[TITLE_MARKER_ATTRIBUTE_NAME],
        [DESTINATION_MARKER_ATTRIBUTE_NAME]: node.attrs[DESTINATION_MARKER_ATTRIBUTE_NAME],
        [DESTINATION_SEPARATOR_ATTRIBUTE_NAME]: node.attrs[DESTINATION_SEPARATOR_ATTRIBUTE_NAME],
        [TITLE_SEPARATOR_ATTRIBUTE_NAME]: node.attrs[TITLE_SEPARATOR_ATTRIBUTE_NAME],
        [BLOCK_ADJACENT_ATTRIBUTE_NAME]: readBlockAdjacent(node.attrs),
      });
    },
  },
};

// A reference link resolves to the destination its definition names, so it renders and opens like
// any other link and differs only in the form it is written back in. The resolved destination and
// title reach the node from the definition, put there by the plugin that walks the tree.
export const withLinkReferenceForm = (schema: MarkSchema): MarkSchema => {
  const { parseMarkdown, toDOM, toMarkdown } = schema;

  return {
    ...schema,
    attrs: { ...schema.attrs, ...REFERENCE_ATTRS },
    toDOM:
      toDOM &&
      ((mark, inline) => {
        const [tag, attributes, ...rest] = toDOM(mark, inline) as [
          string,
          Record<string, unknown>,
          ...unknown[],
        ];

        return [tag, omitReferenceAttributes(attributes), ...rest];
      }),
    parseMarkdown: {
      match: (node) => parseMarkdown.match(node) || node.type === LINK_REFERENCE_MARKDOWN_TYPE,
      runner: (state, node, markType) => {
        if (node.type !== LINK_REFERENCE_MARKDOWN_TYPE) {
          parseMarkdown.runner(state, node, markType);
          return;
        }

        state.openMark(markType, {
          href: readString(node, "url"),
          title: node.title,
          ...readReferenceAttrs(node),
        });
        state.next(node.children ?? []);
        state.closeMark(markType);
      },
    },
    toMarkdown: {
      ...toMarkdown,
      runner: (state, mark, node) => {
        if (readReferenceType(mark.attrs) === null) {
          toMarkdown.runner(state, mark, node);
          return;
        }

        state.withMark(
          mark,
          LINK_REFERENCE_MARKDOWN_TYPE,
          undefined,
          getReferenceProps(mark.attrs),
        );
      },
    },
  };
};

export const withImageReferenceForm = (schema: NodeSchema): NodeSchema => {
  const { parseMarkdown, toDOM, toMarkdown } = schema;

  return {
    ...schema,
    attrs: { ...schema.attrs, ...REFERENCE_ATTRS },
    toDOM:
      toDOM &&
      ((node) => {
        const [tag, attributes, ...rest] = toDOM(node) as [
          string,
          Record<string, unknown>,
          ...unknown[],
        ];

        return [tag, omitReferenceAttributes(attributes), ...rest];
      }),
    parseMarkdown: {
      match: (node) => parseMarkdown.match(node) || node.type === IMAGE_REFERENCE_MARKDOWN_TYPE,
      runner: (state, node, type) => {
        if (node.type !== IMAGE_REFERENCE_MARKDOWN_TYPE) {
          parseMarkdown.runner(state, node, type);
          return;
        }

        state.addNode(type, {
          src: readString(node, "url"),
          alt: readString(node, "alt"),
          title: node.title ?? "",
          [AUTHORED_URL_ATTRIBUTE_NAME]: null,
          [AUTHORED_DESCRIPTION_ATTRIBUTE_NAME]: readAuthoredDescription(node),
          [TITLE_MARKER_ATTRIBUTE_NAME]: readTitleMarker(node),
          ...readReferenceAttrs(node),
        });
      },
    },
    toMarkdown: {
      ...toMarkdown,
      runner: (state, node) => {
        if (readReferenceType(node.attrs) === null) {
          toMarkdown.runner(state, node);
          return;
        }

        state.addNode(IMAGE_REFERENCE_MARKDOWN_TYPE, undefined, undefined, {
          alt: node.attrs.alt,
          [AUTHORED_DESCRIPTION_ATTRIBUTE_NAME]: node.attrs[AUTHORED_DESCRIPTION_ATTRIBUTE_NAME],
          ...getReferenceProps(node.attrs),
        });
      },
    },
  };
};
