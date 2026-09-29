import type { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

import { CALLOUT_MARKDOWN_TYPE, type CalloutDialect } from "../plugins/callout";

type RemarkStringifyHandlers = NonNullable<
  ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>["handlers"]
>;
type StringifyState = Parameters<NonNullable<RemarkStringifyHandlers["root"]>>[2];
type StringifyInfo = Parameters<NonNullable<RemarkStringifyHandlers["root"]>>[3];

interface CalloutMarkdownNode {
  type: typeof CALLOUT_MARKDOWN_TYPE;
  dialect: CalloutDialect;
  token: string;
  title: string | null;
  marker: string;
  gap: number;
  closingGap: number;
  children: unknown[];
}

export const serializeCallout = (
  node: CalloutMarkdownNode,
  _: unknown,
  state: StringifyState,
  info: StringifyInfo,
) => {
  const body = state.containerFlow(node as never, info).replace(/\n+$/u, "");

  switch (node.dialect) {
    case "github": {
      const head = `> [!${node.token}]`;
      return body
        ? `${head}\n${body
            .split("\n")
            .map((line) => (line ? `> ${line}` : "> "))
            .join("\n")}`
        : head;
    }
    case "mkdocs": {
      const head = `${node.marker} ${node.token}${node.title === null ? "" : ` "${node.title}"`}`;
      return body
        ? `${head}\n${"\n".repeat(node.gap)}${body
            .split("\n")
            .map((line) => (line ? `    ${line}` : ""))
            .join("\n")}`
        : head;
    }
    case "docusaurus": {
      const head = `${node.marker}${node.token}${node.title === null ? "" : `[${node.title}]`}`;
      return `${head}\n${"\n".repeat(node.gap)}${body}${body ? "\n" : ""}${"\n".repeat(node.closingGap)}${node.marker}`;
    }
    case "vitepress": {
      const head = `${node.marker} ${node.token}${node.title === null ? "" : ` ${node.title}`}`;
      return `${head}\n${"\n".repeat(node.gap)}${body}${body ? "\n" : ""}${"\n".repeat(node.closingGap)}${node.marker}`;
    }
  }
};
