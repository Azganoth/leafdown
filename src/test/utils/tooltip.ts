import type { UserEvent } from "@testing-library/user-event";

import { act, waitFor } from "./react";

const OPEN_TOOLTIP_SELECTOR = '[data-slot="tooltip-content"][data-open]';

export const queryTooltip = () => document.querySelector<HTMLElement>(OPEN_TOOLTIP_SELECTOR);

/** Points at the element and returns the one tooltip then open, once it is the only one. */
export const hoverTooltip = async (user: UserEvent, element: Element) => {
  await user.hover(element);

  return waitFor(() => {
    const tooltips = document.querySelectorAll<HTMLElement>(OPEN_TOOLTIP_SELECTOR);

    if (tooltips.length !== 1) {
      throw new Error(`Expected one open tooltip, found ${String(tooltips.length)}.`);
    }

    return tooltips[0];
  });
};

// Long enough for a tooltip without a resting delay to have opened.
const TOOLTIP_SETTLE_MS = 50;

/** Points at the element and returns whichever tooltip is open once it has had time to open. */
export const hoverAndQueryTooltip = async (user: UserEvent, element: Element) => {
  await user.hover(element);
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, TOOLTIP_SETTLE_MS);
      }),
  );

  return queryTooltip();
};

/** Makes the element report content wider than itself, as text cut short does, or not. */
export const setCutShort = (element: Element, cutShort: boolean) => {
  Object.defineProperty(element, "clientWidth", { configurable: true, value: 100 });
  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    value: cutShort ? 160 : 100,
  });
};
