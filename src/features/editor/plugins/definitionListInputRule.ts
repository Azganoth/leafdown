import { InputRule } from "@milkdown/kit/prose/inputrules";
import { Fragment } from "@milkdown/kit/prose/model";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $inputRule, $prose } from "@milkdown/kit/utils";

import {
  leafdownDefinitionDescriptionSchema,
  leafdownDefinitionListSchema,
  leafdownDefinitionTermSchema,
} from "./definitionList";

const DEFINITION_MARKER_INPUT = /^( {0,3})([:~])([\t ]+)$/u;

export const createLeafdownDefinitionListInputRule = () =>
  $inputRule(
    (ctx) =>
      new InputRule(DEFINITION_MARKER_INPUT, (state, match, start) => {
        const $start = state.doc.resolve(start);
        const paragraph = $start.parent;
        if (paragraph.type.name !== "paragraph") return null;

        const index = $start.index($start.depth - 1);
        const parent = $start.node($start.depth - 1);
        const descriptionType = leafdownDefinitionDescriptionSchema.type(ctx);
        const body = state.schema.nodes.paragraph?.createAndFill();
        if (!body) return null;

        if (
          parent.type === descriptionType &&
          $start.depth > 1 &&
          $start.node($start.depth - 2).type.name === "definition_list" &&
          index === parent.childCount - 1 &&
          match[1] === ""
        ) {
          const content = parent.content.cut(0, parent.content.size - paragraph.nodeSize);
          if (content.childCount === 0) return null;
          const previous = parent.copy(content);
          const next = descriptionType.create({ marker: match[2], spacing: match[3] }, body);
          const from = $start.before($start.depth - 1);
          const transaction = state.tr.replaceWith(
            from,
            $start.after($start.depth - 1),
            Fragment.fromArray([previous, next]),
          );
          transaction.setSelection(
            TextSelection.near(transaction.doc.resolve(from + previous.nodeSize + 2)),
          );
          return transaction;
        }

        const preceding = index > 0 ? parent.child(index - 1) : null;
        const leadingBlank = preceding?.type.name === "paragraph" && preceding.content.size === 0;
        const termParagraph =
          index > (leadingBlank ? 1 : 0) ? parent.child(index - (leadingBlank ? 2 : 1)) : null;
        if (
          termParagraph?.type.name !== "paragraph" ||
          termParagraph.childCount === 0 ||
          termParagraph.content.content.some((child) => child.type.name === "hardbreak")
        ) {
          return null;
        }

        const listType = leafdownDefinitionListSchema.type(ctx);
        const termType = leafdownDefinitionTermSchema.type(ctx);
        const term = termType.create(null, termParagraph.content);
        const description = descriptionType.create(
          {
            marker: match[2],
            spacing: match[3],
            indent: match[1],
            leadingBlank,
            spread: leadingBlank,
          },
          body,
        );
        const list = listType.create(null, [term, description]);
        const from =
          $start.before() - termParagraph.nodeSize - (leadingBlank ? preceding.nodeSize : 0);
        const to = $start.after();
        const transaction = state.tr.replaceWith(from, to, list);
        transaction.setSelection(
          TextSelection.near(transaction.doc.resolve(from + term.nodeSize + 3)),
        );
        return transaction;
      }),
  );

export const createLeafdownDefinitionSpacingPlugin = () =>
  $prose(
    () =>
      new Plugin({
        props: {
          handleTextInput: (view, from, to, text) => {
            if (from !== to || !/^[\t ]+$/u.test(text)) return false;
            const $from = view.state.doc.resolve(from);
            if ($from.parent.type.name !== "paragraph" || $from.parentOffset !== 0) return false;
            for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
              const node = $from.node(depth);
              if (node.type.name !== "definition_description") continue;
              if ($from.index(depth) !== 0 || $from.parent.content.size !== 0) return false;
              const pos = $from.before(depth);
              view.dispatch(
                view.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  spacing: String(node.attrs.spacing) + text,
                }),
              );
              return true;
            }
            return false;
          },
        },
      }),
  );
