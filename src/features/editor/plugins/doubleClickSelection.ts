import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { hasTransientInlineSourceProjection } from "./inlineSourceProjection";

const TRAILING_HORIZONTAL_WHITESPACE = /[\t\p{Zs}]+$/u;

const getTrimmedSelection = (selection: TextSelection) => {
  if (selection.empty || !selection.$from.sameParent(selection.$to)) {
    return null;
  }

  const textBlock = selection.$from.parent;

  if (!textBlock.isTextblock) {
    return null;
  }

  const selectedText = selection.content().content.textBetween(0, selection.content().content.size);
  const trailingWhitespace = selectedText.match(TRAILING_HORIZONTAL_WHITESPACE)?.[0];

  if (!trailingWhitespace) {
    return null;
  }

  const selectedWord = selectedText.slice(0, -trailingWhitespace.length);

  if (!selectedWord || /\s/u.test(selectedWord)) {
    return null;
  }

  const from = selection.from;
  const to = selection.to - trailingWhitespace.length;

  return selection.anchor <= selection.head
    ? { anchor: from, head: to }
    : { anchor: to, head: from };
};

export const createLeafdownDoubleClickSelectionPlugin = () =>
  $prose(() => {
    let pendingAnimationFrame: number | null = null;

    const cancelPendingNormalization = () => {
      if (pendingAnimationFrame === null) {
        return;
      }

      window.cancelAnimationFrame(pendingAnimationFrame);
      pendingAnimationFrame = null;
    };

    return new Plugin({
      view: () => ({
        destroy: cancelPendingNormalization,
      }),
      props: {
        handleDOMEvents: {
          beforeinput: () => {
            cancelPendingNormalization();

            return false;
          },
          dblclick: (view, event) => {
            if (
              !(event instanceof MouseEvent) ||
              event.button !== 0 ||
              hasTransientInlineSourceProjection(view.state)
            ) {
              return false;
            }

            cancelPendingNormalization();
            pendingAnimationFrame = window.requestAnimationFrame(() => {
              pendingAnimationFrame = null;

              if (view.isDestroyed || hasTransientInlineSourceProjection(view.state)) {
                return;
              }

              const { selection } = view.state;

              if (!(selection instanceof TextSelection)) {
                return;
              }

              const trimmedSelection = getTrimmedSelection(selection);

              if (!trimmedSelection) {
                return;
              }

              view.dispatch(
                view.state.tr.setSelection(
                  TextSelection.create(
                    view.state.doc,
                    trimmedSelection.anchor,
                    trimmedSelection.head,
                  ),
                ),
              );
            });

            return false;
          },
          mousedown: () => {
            cancelPendingNormalization();

            return false;
          },
        },
      },
    });
  });
