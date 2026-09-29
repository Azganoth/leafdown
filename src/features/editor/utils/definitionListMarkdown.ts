import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

import { BLOCK_ADJACENT_ATTRIBUTE_NAME } from "./blockSeparatorMarkdown";
import { readPrefixColumns } from "./linePrefixMarkdown";

type Handlers = NonNullable<ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]>;

interface DefinitionDescription {
  type: string;
  children: { type: string }[];
  marker?: string;
  spacing?: string;
  indent?: string;
}

export const joinDefinitionDescriptionBlocks = (
  left: { type: string },
  right: { type: string; [BLOCK_ADJACENT_ATTRIBUTE_NAME]?: boolean },
  parent: { type: string },
) =>
  parent.type === "defListDescription"
    ? right[BLOCK_ADJACENT_ATTRIBUTE_NAME] === true
      ? 0
      : 1
    : undefined;

export const serializeDefinitionList: NonNullable<Handlers["list"]> = (
  node,
  _parent,
  state,
  info,
) => {
  const exit = state.enter("defList");
  const value = state.containerFlow(node as Parameters<typeof state.containerFlow>[0], info);
  exit();
  return value;
};

export const serializeDefinitionTerm: NonNullable<Handlers["paragraph"]> = (
  node,
  _parent,
  state,
  info,
) => {
  const exit = state.enter("defListTerm");
  const phrasing = state.enter("phrasing");
  const value = state.containerPhrasing(node as Parameters<typeof state.containerPhrasing>[0], {
    ...info,
    before: "\n",
    after: "\n",
  });
  phrasing();
  exit();
  return value;
};

export const serializeDefinitionDescription: NonNullable<Handlers["listItem"]> = (
  node,
  _parent,
  state,
  info,
) => {
  const description = node as DefinitionDescription;
  const marker = description.marker === "~" ? "~" : ":";
  const indent = /^ {0,3}$/u.test(description.indent ?? "") ? description.indent! : "";
  const authoredSpacing = /^[\t ]+$/u.test(description.spacing ?? "") ? description.spacing! : " ";
  const padding =
    readPrefixColumns(`${indent}${marker}${authoredSpacing}`) -
    readPrefixColumns(`${indent}${marker}`);
  const spacing = description.children[0]?.type !== "code" && padding > 4 ? " " : authoredSpacing;
  const prefix = `${indent}${marker}${spacing}`;
  const width = readPrefixColumns(prefix);
  const exit = state.enter("defListDescription");
  const value = state.indentLines(
    state.containerFlow(node as Parameters<typeof state.containerFlow>[0], info),
    (line, index, blank) => {
      if (index === 0) return blank ? prefix.trimEnd() : prefix + line;
      return blank ? "" : " ".repeat(width) + line;
    },
  );
  exit();
  return value;
};
