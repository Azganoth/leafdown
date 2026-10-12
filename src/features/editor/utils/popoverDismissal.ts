import type { Popover } from "@base-ui/react/popover";

type PopoverCloseDetails = Pick<Popover.Root.ChangeEventDetails, "event" | "reason">;

// Pressing a focusable control outside moves focus before the click lands, so a non-modal popover
// closes on that focus-out rather than on the press.
export const isDismissedFromOutside = ({ event, reason }: PopoverCloseDetails) =>
  reason === "outside-press" ||
  (reason === "focus-out" && event instanceof FocusEvent && event.relatedTarget instanceof Element);
