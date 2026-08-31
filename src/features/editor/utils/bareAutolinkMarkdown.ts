import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { TagParseRule } from "@milkdown/kit/prose/model";
import type { MarkdownNode, MarkSchema } from "@milkdown/kit/transformer";

import {
  AUTHORED_URL_ATTRIBUTE_NAME,
  CHARACTER_REFERENCE_MARKDOWN_TYPE,
  decodeWholeCharacterReference,
  readAuthoredUrl,
  readCharacterReferenceRun,
  readCharacterReferenceText,
} from "./characterReferenceMarkdown";
import { TITLE_MARKER_ATTRIBUTE_NAME, readTitleMarker } from "./markdownTitle";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;

export const BARE_AUTOLINK_MARKDOWN_TYPE = "leafdownBareAutolink";

const LINK_MARKDOWN_TYPE = "link";
const BARE_AUTOLINK_ATTRIBUTE_NAME = "isBareAutolink";
const BARE_AUTOLINK_DOM_ATTRIBUTE_NAME = "data-bare-autolink";
const HTTP_URL_PATTERN = /^https?:\/\//iu;
const WWW_URL_PATTERN = /^www\./iu;
const EMAIL_PATTERN = /^[^@]+@[^@]+\.[^@]+$/u;
const PRECEDING_LETTER_PATTERN = /[A-Za-z]$/u;
const TRIMMED_FOLLOWING_PATTERN = /^[\s!"'*,.:;<?\]_~]?$/u;
// GFM gives these their meaning as delimiters, which is why the file escapes one standing in
// text, and the backslash it writes is taken into a literal target rather than trimmed off it.
const ESCAPED_MARKER_PATTERN = /^[*_~]/u;
const MAILTO_URL_PREFIX = "mailto:";
const NAMED_REFERENCE_SOURCE_PATTERN = /^&[A-Za-z0-9]+;$/u;
const ENTITY_SHAPED_RUN_PATTERN = /^&[A-Za-z0-9]+;/u;
const RUN_ENDING_TEXT_PATTERN = /^\s/u;

const getBareAutolinkUrl = (value: string) => {
  if (/[\s<]/u.test(value)) {
    return null;
  }

  if (HTTP_URL_PATTERN.test(value)) {
    return value;
  }

  if (WWW_URL_PATTERN.test(value)) {
    return `http://${value}`;
  }

  return EMAIL_PATTERN.test(value) ? `mailto:${value}` : null;
};

const getBareAutolinkValue = (node: MarkdownNode) => {
  const [child, ...rest] = node.children ?? [];

  if (rest.length > 0 || child?.type !== "text" || typeof child.value !== "string" || node.title) {
    return null;
  }

  return getBareAutolinkUrl(child.value) === node.url ? child.value : null;
};

const countCharacter = (value: string, character: string) => value.split(character).length - 1;

// A node the file writes back as the reference it was authored as, rather than as the character it
// names. A numeric reference is spelled with a `#`, which GFM does not read as one of the
// alphanumerics its trailing rule looks for.
const isWrittenBackAsNamedReference = (node: MarkdownNode) => {
  const source = (node as { source?: unknown }).source;

  return (
    node.type === CHARACTER_REFERENCE_MARKDOWN_TYPE &&
    typeof source === "string" &&
    NAMED_REFERENCE_SOURCE_PATTERN.test(source) &&
    readCharacterReferenceRun(source, readCharacterReferenceText(node)) !== null
  );
};

// GFM excludes a trailing `;` from a literal's target when `&` and alphanumerics precede it,
// without asking whether the name exists. What decides the run is therefore how the file writes it:
// text that names a character is written with a backslash, and the target takes that in instead.
const readTrimmedRuns = (value: string) => {
  let rest = value;
  let trimmed = false;
  let run = ENTITY_SHAPED_RUN_PATTERN.exec(rest);

  while (run !== null && decodeWholeCharacterReference(run[0]) === null) {
    rest = rest.slice(run[0].length);
    trimmed = true;
    run = ENTITY_SHAPED_RUN_PATTERN.exec(rest);
  }

  return { rest, trimmed };
};

// GFM trims every trailing entity-shaped run off a literal, so runs standing between the literal
// and the end of its run are outside the target. A literal's run reaches to the end of the block or
// to the whitespace that closes it, and takes in everything else.
const isFollowedByTrimmedRuns = (node: MarkdownNode, parent: MarkdownNode | undefined) => {
  const children = parent?.children ?? [];
  const start = children.indexOf(node) + 1;

  if (start === 0) {
    return false;
  }

  let trimmed = false;

  for (let index = start; index < children.length; index += 1) {
    const child = children[index];

    if (isWrittenBackAsNamedReference(child)) {
      trimmed = true;
      continue;
    }

    if (child.type !== "text" || typeof child.value !== "string") {
      return false;
    }

    const { rest, trimmed: trimmedHere } = readTrimmedRuns(child.value);

    trimmed ||= trimmedHere;

    if (rest.length > 0) {
      return trimmed && RUN_ENDING_TEXT_PATTERN.test(rest);
    }
  }

  return trimmed;
};

// The neighbour a literal actually meets is the sibling beside it. Where none follows, what comes
// next closes an enclosing construct, and a delimiter is never escaped where it stands.
const readFollowingSibling = (node: MarkdownNode, parent: MarkdownNode | undefined) => {
  const children = parent?.children ?? [];
  const index = children.indexOf(node);

  return index < 0 ? undefined : children[index + 1];
};

const isFollowedByEscapedMarker = (node: MarkdownNode, parent: MarkdownNode | undefined) => {
  const following = readFollowingSibling(node, parent);

  return (
    following?.type === "text" &&
    typeof following.value === "string" &&
    ESCAPED_MARKER_PATTERN.test(following.value)
  );
};

const isEmailAutolink = (node: MarkdownNode) =>
  typeof node.url === "string" && node.url.startsWith(MAILTO_URL_PREFIX);

const isReadableWhereItLands = (
  node: MarkdownNode,
  parent: MarkdownNode | undefined,
  value: string,
  before: string,
  after: string,
) => {
  const following = after.charAt(0);

  return (
    !PRECEDING_LETTER_PATTERN.test(before) &&
    !isFollowedByEscapedMarker(node, parent) &&
    (TRIMMED_FOLLOWING_PATTERN.test(following) ||
      // GFM leaves a trailing `)` out of the target only while the literal closes every
      // parenthesis it opens.
      (following === ")" && countCharacter(value, "(") <= countCharacter(value, ")")) ||
      // An email's domain admits no `>`, so the literal ends before the bracket instead of taking
      // it into the target the way a URL path does.
      (following === ">" && isEmailAutolink(node)) ||
      isFollowedByTrimmedRuns(node, parent))
  );
};

export const serializeBareAutolink: NonNullable<RemarkStringifyHandlers["link"]> = (
  node,
  parent,
  state,
  info,
) => {
  const value = getBareAutolinkValue(node as MarkdownNode);

  return value !== null &&
    isReadableWhereItLands(
      node as MarkdownNode,
      parent as MarkdownNode | undefined,
      value,
      info.before,
      info.after,
    )
    ? value
    : state.handle({ ...node, type: LINK_MARKDOWN_TYPE }, parent, state, info);
};

// Angle brackets sit outside the label, while a bare literal spans its target exactly.
const isBareAutolinkNode = (node: MarkdownNode) => {
  const start = node.position?.start.offset;

  return start !== undefined && start === node.children?.[0]?.position?.start.offset;
};

export const withBareAutolinkForm = (schema: MarkSchema): MarkSchema => {
  const { toDOM } = schema;

  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      [BARE_AUTOLINK_ATTRIBUTE_NAME]: { default: false, validate: "boolean" },
      [AUTHORED_URL_ATTRIBUTE_NAME]: { default: null, validate: "string|null" },
      [TITLE_MARKER_ATTRIBUTE_NAME]: { default: '"', validate: "string" },
    },
    // The link mark matches anchors, so every rule it declares is a tag rule.
    parseDOM: (schema.parseDOM as TagParseRule[] | undefined)?.map((rule) => ({
      ...rule,
      getAttrs: (dom: HTMLElement) => {
        const attrs = rule.getAttrs?.(dom);

        return attrs === false
          ? false
          : {
              ...attrs,
              [BARE_AUTOLINK_ATTRIBUTE_NAME]: dom.hasAttribute(BARE_AUTOLINK_DOM_ATTRIBUTE_NAME),
            };
      },
    })),
    toDOM:
      toDOM &&
      ((mark, inline) => {
        const [tag, attributes, ...rest] = toDOM(mark, inline) as [
          string,
          Record<string, unknown>,
          ...unknown[],
        ];
        const { [BARE_AUTOLINK_ATTRIBUTE_NAME]: isBareAutolink, ...rendered } = attributes;

        delete rendered[TITLE_MARKER_ATTRIBUTE_NAME];

        return [
          tag,
          isBareAutolink ? { ...rendered, [BARE_AUTOLINK_DOM_ATTRIBUTE_NAME]: "" } : rendered,
          ...rest,
        ];
      }),
    parseMarkdown: {
      ...schema.parseMarkdown,
      runner: (state, node, markType) => {
        state.openMark(markType, {
          href: node.url,
          [BARE_AUTOLINK_ATTRIBUTE_NAME]: isBareAutolinkNode(node),
          [AUTHORED_URL_ATTRIBUTE_NAME]: readAuthoredUrl(node),
          [TITLE_MARKER_ATTRIBUTE_NAME]: readTitleMarker(node),
          title: node.title,
        });
        state.next(node.children);
        state.closeMark(markType);
      },
    },
    toMarkdown: {
      ...schema.toMarkdown,
      runner: (state, mark) => {
        state.withMark(
          mark,
          mark.attrs[BARE_AUTOLINK_ATTRIBUTE_NAME]
            ? BARE_AUTOLINK_MARKDOWN_TYPE
            : LINK_MARKDOWN_TYPE,
          undefined,
          {
            title: mark.attrs.title,
            url: mark.attrs.href,
            [AUTHORED_URL_ATTRIBUTE_NAME]: mark.attrs[AUTHORED_URL_ATTRIBUTE_NAME],
            [TITLE_MARKER_ATTRIBUTE_NAME]: mark.attrs[TITLE_MARKER_ATTRIBUTE_NAME],
          },
        );
      },
    },
  };
};
