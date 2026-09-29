import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import {
  getActiveHeadingPosition,
  getHeadingOutline,
  headingOutlinesEqual,
  type HeadingOutlineState,
} from "../utils/headingOutline";

export const createLeafdownHeadingOutlinePlugin = (
  onOutlineChanged: (outline: HeadingOutlineState) => void,
) =>
  $prose(
    () =>
      new Plugin({
        view: (view) => {
          let outline = getHeadingOutline(view.state);
          return {
            update: (nextView, previousState) => {
              if (
                nextView.state.doc === previousState.doc &&
                nextView.state.selection.eq(previousState.selection)
              )
                return;

              const nextOutline =
                nextView.state.doc === previousState.doc
                  ? {
                      headings: outline.headings,
                      activePosition: getActiveHeadingPosition(
                        outline.headings,
                        nextView.state.selection.head,
                      ),
                    }
                  : getHeadingOutline(nextView.state);
              if (headingOutlinesEqual(outline, nextOutline)) return;
              outline = nextOutline;
              onOutlineChanged(outline);
            },
          };
        },
      }),
  );
