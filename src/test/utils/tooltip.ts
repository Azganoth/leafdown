import type { UserEvent } from "@testing-library/user-event";

import { waitFor } from "./react";

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
