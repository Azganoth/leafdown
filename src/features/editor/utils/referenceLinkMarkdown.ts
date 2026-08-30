import type { MarkdownNode, MarkSchema, NodeSchema } from "@milkdown/kit/transformer";

import { AUTHORED_URL_ATTRIBUTE_NAME } from "./characterReferenceMarkdown";
import {
  chooseTitleMarker,
  readTitleMarker,
  TITLE_MARKER_ATTRIBUTE_NAME,
  TITLE_MARKER_PAIRS,
  type TitleMarker,
} from "./markdownTitle";

export const DEFINITION_NODE_NAME = "definition";
export const DEFINITION_MARKDOWN_TYPE = "definition";
export const LINK_REFERENCE_MARKDOWN_TYPE = "linkReference";
export const IMAGE_REFERENCE_MARKDOWN_TYPE = "imageReference";

// A reference carries the form it was authored in and the label as it was written there, which is
// what `mdast-util-to-markdown` prefers over the normalized identifier when it writes the tail.
export const REFERENCE_TYPE_ATTRIBUTE_NAME = "referenceType";
export const REFERENCE_LABEL_ATTRIBUTE_NAME = "referenceLabel";

const DEFINITION_DOM_TYPE = "definition";
const LABEL_WHITESPACE_PATTERN = /[\t\n\r ]+/gu;
const REFERENCE_TYPES: readonly unknown[] = ["collapsed", "full", "shortcut"];

export type ReferenceType = "collapsed" | "full" | "shortcut";

export interface DefinitionAttrs {
  label: string;
  title: string;
  titleMarker: TitleMarker;
  url: string;
}

// CommonMark matches a reference to a definition on a label whose whitespace is collapsed, whose
// ends are trimmed, and whose case is ignored.
export const normalizeReferenceLabel = (label: string) =>
  label.replace(LABEL_WHITESPACE_PATTERN, " ").trim().toLowerCase();

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

// The definition handler writes an angle-bracket destination for an empty destination and for one
// holding a control character or whitespace, and a raw one otherwise, so the rendered block reads
// as the line the file is written with.
const needsAngleDestination = (url: string) => {
  for (let index = 0; index < url.length; index += 1) {
    const code = url.charCodeAt(index);

    if (code <= CONTROL_CHARACTER_MAX_CODE || code === DELETE_CHARACTER_CODE) {
      return true;
    }
  }

  return url === "";
};

export const serializeDefinitionMarkdown = ({
  label,
  title,
  titleMarker,
  url,
}: DefinitionAttrs) => {
  const destination = needsAngleDestination(url) ? `<${url}>` : url;

  if (!title) {
    return `[${label}]: ${destination}`;
  }

  const [opening, closing] = TITLE_MARKER_PAIRS[chooseTitleMarker(title, titleMarker)];

  return `[${label}]: ${destination} ${opening}${title}${closing}`;
};

export const readDefinitionAttrs = (attrs: Record<string, unknown>): DefinitionAttrs => ({
  label: readString(attrs, "label"),
  title: readString(attrs, "title"),
  titleMarker: readTitleMarker({ titleMarker: attrs[TITLE_MARKER_ATTRIBUTE_NAME] }),
  url: readString(attrs, "url"),
});

// A definition is a leaf: it holds a label, a destination, and an optional title, and nothing an
// author types inside it. It renders the permanent source the file will be written with, which is
// what a footnote definition's persistent marker does for a block that does hold content.
export const definitionNodeSchema: NodeSchema = {
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  isolating: true,
  attrs: {
    label: { default: "", validate: "string" },
    url: { default: "", validate: "string" },
    title: { default: "", validate: "string" },
    [TITLE_MARKER_ATTRIBUTE_NAME]: { default: '"', validate: "string" },
  },
  parseDOM: [
    {
      tag: `div[data-type="${DEFINITION_DOM_TYPE}"]`,
      getAttrs: (dom) => {
        const element = dom as HTMLElement;

        return {
          label: element.getAttribute("data-label") ?? "",
          url: element.getAttribute("data-url") ?? "",
          title: element.getAttribute("data-title") ?? "",
          [TITLE_MARKER_ATTRIBUTE_NAME]: element.getAttribute("data-title-marker") ?? '"',
        };
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
        "data-title-marker": attrs.titleMarker,
      },
      serializeDefinitionMarkdown(attrs),
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === DEFINITION_MARKDOWN_TYPE,
    runner: (state, node, type) => {
      state.addNode(type, {
        label: readReferenceLabel(node),
        url: readString(node, "url"),
        title: readString(node, "title"),
        [TITLE_MARKER_ATTRIBUTE_NAME]: readTitleMarker(node),
      });
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
        [TITLE_MARKER_ATTRIBUTE_NAME]: node.attrs[TITLE_MARKER_ATTRIBUTE_NAME],
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
          ...getReferenceProps(node.attrs),
        });
      },
    },
  };
};
