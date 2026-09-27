import type { MessageId, Translate } from "@/lib/i18n";

import type { BlockPathSegment } from "./documentStatus";

const BLOCK_PATH_LABEL_IDS = {
  blockquote: "editor.blockPath.blockquote",
  destination: "editor.blockPath.destination",
  footnoteDefinition: "editor.blockPath.footnoteDefinition",
  label: "editor.blockPath.label",
  orderedList: "editor.blockPath.orderedList",
  paragraph: "editor.blockPath.paragraph",
  referenceDefinition: "editor.blockPath.referenceDefinition",
  table: "editor.blockPath.table",
  taskList: "editor.blockPath.taskList",
  title: "editor.blockPath.title",
  unorderedList: "editor.blockPath.unorderedList",
} as const satisfies Record<
  Exclude<BlockPathSegment["kind"], "codeBlock" | "heading" | "tableCell">,
  MessageId
>;

export const formatBlockPathSegment = (segment: BlockPathSegment, t: Translate) => {
  switch (segment.kind) {
    case "codeBlock":
      return segment.language
        ? t("editor.blockPath.codeBlockWithLanguage", { language: segment.language })
        : t("editor.blockPath.codeBlock");
    case "heading":
      return t("editor.blockPath.heading", { level: segment.level });
    case "tableCell":
      return t("editor.blockPath.tableCell", { row: segment.row, column: segment.column });
    default:
      return t(BLOCK_PATH_LABEL_IDS[segment.kind]);
  }
};
