import type { EditorState } from "@milkdown/kit/prose/state";
import type { Parser, RemarkParser, Serializer } from "@milkdown/kit/transformer";

import {
  createMarkSourceProjectionAdapter,
  findSourceProjectionLiteralSourceCommit,
  findSourceProjectionTarget,
  type SourceProjectionAdapter,
} from "./sourceProjectionAdapters";
import { createBoundarySourceProjectionAdapter } from "./sourceProjectionBoundaryAdapter";
import { createCharacterReferenceSourceProjectionAdapter } from "./sourceProjectionCharacterReferenceAdapter";
import { createEscapeSourceProjectionAdapter } from "./sourceProjectionEscapeAdapter";
import { createFootnoteReferenceSourceProjectionAdapter } from "./sourceProjectionFootnoteReferenceAdapter";
import { createLinkSourceProjectionAdapter } from "./sourceProjectionLinkAdapter";
import type { TextRange } from "./textRanges";

export interface SourceProjectionAdapterDependencies {
  parser: Parser;
  remark: RemarkParser;
  serializer: Serializer;
}

export const createSourceProjectionAdapters = ({
  parser,
  remark,
  serializer,
}: SourceProjectionAdapterDependencies): readonly SourceProjectionAdapter[] => {
  const objectAdapters = [
    createLinkSourceProjectionAdapter({ parser, remark, serializer }),
    createMarkSourceProjectionAdapter({ parser, remark, serializer }),
    createFootnoteReferenceSourceProjectionAdapter({ parser, serializer }),
  ];

  const findLiteralSourceCommit = (state: EditorState, range: TextRange) =>
    findSourceProjectionLiteralSourceCommit(state, range, objectAdapters);

  const sideAdapters = [
    ...objectAdapters,
    createCharacterReferenceSourceProjectionAdapter(),
    createEscapeSourceProjectionAdapter({ findLiteralSourceCommit, serializer }),
  ];

  // A boundary owns the pair before either side owns itself, and it only claims a caret that two
  // objects meet on, so ordinary precedence still answers everywhere else.
  return [
    createBoundarySourceProjectionAdapter({
      findLiteralSourceCommit,
      findSideTarget: (state) => findSourceProjectionTarget(state, sideAdapters),
      parser,
      remark,
    }),
    ...sideAdapters,
  ];
};
