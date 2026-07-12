import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { getTextWordRangeAtPosition } from "../utils/textRanges";
import { hasTransientInlineSourceProjection } from "./inlineSourceProjection";

export const createLeafdownDoubleClickSelectionPlugin = () =>
  $prose(
    () =>
      new Plugin({
        props: {
          handleDoubleClick: (view, position, event) => {
            if (event.button !== 0 || hasTransientInlineSourceProjection(view.state)) {
              return false;
            }

            const range = getTextWordRangeAtPosition(view.state, position);

            if (!range) {
              return false;
            }

            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(view.state.doc, range.from, range.to),
              ),
            );

            return true;
          },
        },
      }),
  );
