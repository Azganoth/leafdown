import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import {
  DEFAULT_HEADING_SEPARATOR,
  HEADING_CLOSING_SEQUENCE_ATTRIBUTE_NAME,
  HEADING_SEPARATOR_ATTRIBUTE_NAME,
  HEADING_UNDERLINE_ATTRIBUTE_NAME,
  NO_HEADING_RUN,
  readAuthoredHeadingClosingSequence,
  readAuthoredHeadingSeparator,
  readAuthoredHeadingUnderline,
  SIZED_HEADING_UNDERLINE,
} from "../utils/headingMarkdown";
import {
  DEFAULT_BULLET_LIST_MARKER,
  DEFAULT_ORDERED_LIST_MARKER,
  LIST_MARKER_ATTRIBUTE_NAME,
  readAuthoredBulletListMarker,
  readAuthoredOrderedListMarker,
} from "../utils/listMarkdown";

const BULLET_LIST_NODE_NAME = "bullet_list";
const ORDERED_LIST_NODE_NAME = "ordered_list";
const HEADING_NODE_NAME = "heading";

// A setext underline spells level one or two and there is no run for the rest, so a heading past
// them is written ATX whatever the document holds and answers for nothing on that axis.
const MAXIMUM_SETEXT_HEADING_LEVEL = 2;
const HEADING_OPENING_SEQUENCE_CHARACTER = "#";
// CommonMark reads at least one space or tab between an ATX heading's content and the run closing
// it, and the run the editor writes spends one.
const CLOSING_SEQUENCE_SPACING = " ";
const MINIMUM_HEADING_LEVEL = 1;
const MAXIMUM_HEADING_LEVEL = 6;

interface NodeWithPos {
  node: ProseMirrorNode;
  pos: number;
}

// Each axis collects what the document answers for it, and the answers are held as a set because
// the count never matters: one voice is agreement as much as ten, and a second distinct one ends
// it. A document naming two forms is left to the default rather than having one of them chosen
// for its author.
interface FormVotes {
  bulletListMarkers: Set<string>;
  orderedListMarkers: Set<string>;
  headingSeparators: Set<string>;
  headingClosings: Set<boolean>;
  headingUnderlines: Set<boolean>;
}

interface PrevailingForms {
  bulletListMarker: string | undefined;
  orderedListMarker: string | undefined;
  headingSeparator: string | undefined;
  headingClosed: boolean | undefined;
  headingSetext: boolean | undefined;
}

interface DocumentForms {
  formless: NodeWithPos[];
  prevailing: PrevailingForms;
}

const findAgreedAnswer = <T>(votes: Set<T>) => (votes.size === 1 ? [...votes][0] : undefined);

const readHeadingLevel = (node: ProseMirrorNode) => {
  const level = Number(node.attrs.level);

  return Number.isInteger(level)
    ? Math.min(Math.max(level, MINIMUM_HEADING_LEVEL), MAXIMUM_HEADING_LEVEL)
    : MINIMUM_HEADING_LEVEL;
};

// A heading answers for the axes the form it is written in actually has. A setext heading opens on
// ordinary text and closes on its underline, so neither the separator nor the closing sequence is
// a run it holds, and an empty heading stands one space before content it does not have and could
// not have been underlined at all.
const countHeadingVotes = (node: ProseMirrorNode, votes: FormVotes) => {
  const underline = readAuthoredHeadingUnderline(node.attrs);
  const holdsContent = node.content.size > 0;

  if (
    underline !== null &&
    holdsContent &&
    readHeadingLevel(node) <= MAXIMUM_SETEXT_HEADING_LEVEL
  ) {
    votes.headingUnderlines.add(underline !== NO_HEADING_RUN);
  }

  // A heading carrying no record of its own is caught here too, because the axis it would answer
  // for is the one still being settled.
  if (underline !== NO_HEADING_RUN) {
    return;
  }

  const separator = readAuthoredHeadingSeparator(node.attrs);

  if (separator !== null && holdsContent) {
    votes.headingSeparators.add(separator);
  }

  const closingSequence = readAuthoredHeadingClosingSequence(node.attrs);

  if (closingSequence !== null) {
    votes.headingClosings.add(closingSequence !== NO_HEADING_RUN);
  }
};

// One walk both counts what the document holds and collects what has yet to be settled, since a
// construct carrying no record answers for nothing and cannot count its own vote either way.
const readDocumentForms = (doc: ProseMirrorNode): DocumentForms => {
  const votes: FormVotes = {
    bulletListMarkers: new Set(),
    orderedListMarkers: new Set(),
    headingSeparators: new Set(),
    headingClosings: new Set(),
    headingUnderlines: new Set(),
  };
  const formless: NodeWithPos[] = [];

  doc.descendants((node, pos) => {
    switch (node.type.name) {
      case BULLET_LIST_NODE_NAME: {
        const marker = readAuthoredBulletListMarker(node.attrs);

        if (marker === null) {
          formless.push({ node, pos });
        } else {
          votes.bulletListMarkers.add(marker);
        }

        return true;
      }
      case ORDERED_LIST_NODE_NAME: {
        const marker = readAuthoredOrderedListMarker(node.attrs);

        if (marker === null) {
          formless.push({ node, pos });
        } else {
          votes.orderedListMarkers.add(marker);
        }

        return true;
      }
      case HEADING_NODE_NAME: {
        countHeadingVotes(node, votes);

        if (
          readAuthoredHeadingSeparator(node.attrs) === null ||
          readAuthoredHeadingClosingSequence(node.attrs) === null ||
          readAuthoredHeadingUnderline(node.attrs) === null
        ) {
          formless.push({ node, pos });
        }

        return false;
      }
      default:
        return true;
    }
  });

  return {
    formless,
    prevailing: {
      bulletListMarker: findAgreedAnswer(votes.bulletListMarkers),
      orderedListMarker: findAgreedAnswer(votes.orderedListMarkers),
      headingSeparator: findAgreedAnswer(votes.headingSeparators),
      headingClosed: findAgreedAnswer(votes.headingClosings),
      headingSetext: findAgreedAnswer(votes.headingUnderlines),
    },
  };
};

// A closing sequence carries across as the run being there rather than as its length, because the
// length answers to the opening sequence it closes and every heading spells its own. The heading
// is therefore closed by the run its own level writes.
const createPrevailingHeadingAttrs = (node: ProseMirrorNode, prevailing: PrevailingForms) => {
  const attrs: Record<string, unknown> = {};

  if (readAuthoredHeadingSeparator(node.attrs) === null) {
    attrs[HEADING_SEPARATOR_ATTRIBUTE_NAME] =
      prevailing.headingSeparator ?? DEFAULT_HEADING_SEPARATOR;
  }

  if (readAuthoredHeadingClosingSequence(node.attrs) === null) {
    attrs[HEADING_CLOSING_SEQUENCE_ATTRIBUTE_NAME] = prevailing.headingClosed
      ? CLOSING_SEQUENCE_SPACING + HEADING_OPENING_SEQUENCE_CHARACTER.repeat(readHeadingLevel(node))
      : NO_HEADING_RUN;
  }

  if (readAuthoredHeadingUnderline(node.attrs) === null) {
    attrs[HEADING_UNDERLINE_ATTRIBUTE_NAME] = prevailing.headingSetext
      ? SIZED_HEADING_UNDERLINE
      : NO_HEADING_RUN;
  }

  return attrs;
};

const createPrevailingFormAttrs = (node: ProseMirrorNode, prevailing: PrevailingForms) => {
  switch (node.type.name) {
    case BULLET_LIST_NODE_NAME:
      return {
        [LIST_MARKER_ATTRIBUTE_NAME]: prevailing.bulletListMarker ?? DEFAULT_BULLET_LIST_MARKER,
      };
    case ORDERED_LIST_NODE_NAME:
      return {
        [LIST_MARKER_ATTRIBUTE_NAME]: prevailing.orderedListMarker ?? DEFAULT_ORDERED_LIST_MARKER,
      };
    default:
      return createPrevailingHeadingAttrs(node, prevailing);
  }
};

const settlePrevailingForms = (state: EditorState) => {
  const { formless, prevailing } = readDocumentForms(state.doc);

  if (formless.length === 0) {
    return null;
  }

  const tr: Transaction = state.tr;

  // Rewriting a node's attributes leaves its size alone, so every position read in the walk still
  // names the node it was read from.
  for (const { node, pos } of formless) {
    tr.setNodeMarkup(
      pos,
      undefined,
      { ...node.attrs, ...createPrevailingFormAttrs(node, prevailing) },
      node.marks,
    );
  }

  return tr;
};

/// A construct the editor creates carries no authored form, and is settled here against the form
/// the document it was created in prevails in, falling back to the serializer's own default where
/// the document names none or names more than one. Settling it on the node rather than at the save
/// is what makes it the construct's own form from then on, so a document that later disagrees with
/// itself does not move a construct already written.
///
/// The survey runs over the assembled document rather than reaching each command, input rule, and
/// structural edit that can open one of these constructs.
export const createLeafdownPrevailingFormPlugin = () =>
  $prose(
    () =>
      new Plugin({
        appendTransaction: (_transactions, oldState, state) =>
          oldState.doc === state.doc ? null : settlePrevailingForms(state),
      }),
  );
