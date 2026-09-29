import { Plugin, Selection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { readCalloutForm, readGitHubForm } from "./callout";

export const createLeafdownCalloutInputPlugin = () =>
  $prose(
    () =>
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== "Enter" || event.shiftKey || !view.editable) return false;
            const { state } = view;
            const { $from, empty } = state.selection;
            if (
              !empty ||
              $from.parent.type.name !== "paragraph" ||
              $from.parentOffset !== $from.parent.content.size
            )
              return false;

            let form = $from.depth === 1 ? readCalloutForm($from.parent.textContent) : null;
            let from = $from.before();
            let to = $from.after();

            if (
              !form &&
              $from.depth === 2 &&
              $from.node($from.depth - 1).type.name === "blockquote"
            ) {
              const blockquote = $from.node($from.depth - 1);
              if (blockquote.childCount !== 1) return false;
              form = readGitHubForm(`> ${$from.parent.textContent}`);
              from = $from.before($from.depth - 1);
              to = $from.after($from.depth - 1);
            }

            if (!form) return false;
            const paragraph = state.schema.nodes.paragraph.create();
            const callout = state.schema.nodes.callout.create(form, paragraph);
            const transaction = state.tr.replaceWith(from, to, callout);
            transaction.setSelection(Selection.near(transaction.doc.resolve(from + 2)));
            view.dispatch(transaction);
            return true;
          },
        },
      }),
  );
