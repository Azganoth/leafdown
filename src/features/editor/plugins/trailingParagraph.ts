import { Plugin, Selection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { finalizeSourceProjection, hasActiveSourceProjection } from "./sourceProjection";

export const createLeafdownTrailingParagraphPlugin = () =>
  $prose(
    () =>
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (event.button !== 0 || event.target !== view.dom) {
                return false;
              }

              const { doc, schema } = view.state;
              const lastNode = doc.lastChild;
              const lastElement = view.dom.lastElementChild;

              if (
                !lastNode ||
                !lastElement ||
                (lastNode.type === schema.nodes.paragraph && lastNode.content.size === 0) ||
                event.clientY <= lastElement.getBoundingClientRect().bottom
              ) {
                return false;
              }

              const paragraph = schema.nodes.paragraph?.createAndFill();

              if (!paragraph) {
                return false;
              }

              if (hasActiveSourceProjection(view.state)) {
                finalizeSourceProjection(view);
              }

              const transaction = view.state.tr.insert(view.state.doc.content.size, paragraph);

              view.dispatch(transaction.setSelection(Selection.atEnd(transaction.doc)));

              return false;
            },
          },
        },
      }),
  );
