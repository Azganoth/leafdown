import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import {
  getOutlineHeadings,
  headingOutlinePinKey,
  headingOutlinesEqual,
  measureActiveHeading,
  type HeadingOutlineState,
} from "../utils/headingOutline";
import { findScrollingAncestor } from "../utils/scrollingAncestor";
import { getFoldedHeadings } from "./headingFold";

export const createLeafdownHeadingOutlinePlugin = (
  onOutlineChanged: (outline: HeadingOutlineState) => void,
) =>
  $prose(
    () =>
      new Plugin({
        key: headingOutlinePinKey,
        state: {
          init: () => null,
          apply: (transaction, pin) => {
            const meta = transaction.getMeta(headingOutlinePinKey) as typeof pin | undefined;
            if (meta !== undefined) return meta;
            return transaction.docChanged ? null : pin;
          },
        },
        view: (view) => {
          let headings = getOutlineHeadings(view.state.doc, getFoldedHeadings(view.state));
          let published: HeadingOutlineState | null = null;
          let frame = 0;
          const scrollTarget: HTMLElement | Window = findScrollingAncestor(view.dom) ?? window;

          const publish = () => {
            frame = 0;
            if (view.isDestroyed) return;
            const outline = { headings, activePosition: measureActiveHeading(view, headings) };
            if (published && headingOutlinesEqual(published, outline)) return;
            published = outline;
            onOutlineChanged(outline);
          };
          const schedulePublish = () => {
            if (!frame) frame = window.requestAnimationFrame(publish);
          };

          scrollTarget.addEventListener("scroll", schedulePublish, { passive: true });
          const resizeObserver =
            typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedulePublish);
          resizeObserver?.observe(view.dom);
          if (scrollTarget instanceof HTMLElement) resizeObserver?.observe(scrollTarget);
          schedulePublish();

          return {
            update: (nextView, previousState) => {
              const folded = getFoldedHeadings(nextView.state);
              if (
                nextView.state.doc !== previousState.doc ||
                folded !== getFoldedHeadings(previousState)
              ) {
                headings = getOutlineHeadings(nextView.state.doc, folded);
                schedulePublish();
              } else if (
                headingOutlinePinKey.getState(nextView.state) !==
                headingOutlinePinKey.getState(previousState)
              ) {
                schedulePublish();
              }
            },
            destroy: () => {
              window.cancelAnimationFrame(frame);
              scrollTarget.removeEventListener("scroll", schedulePublish);
              resizeObserver?.disconnect();
            },
          };
        },
      }),
  );
