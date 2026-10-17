// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { renderWithUser, screen, waitFor } from "@/test/utils/react";
import { hoverTooltip, queryTooltip, setCutShort } from "@/test/utils/tooltip";

import { TOOLTIP_DELAY, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

function NamedButton({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<button aria-label={label} type="button" />}>×</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

describe("Tooltip", () => {
  // Well short of the resting delay, so a tooltip seen within it opened at once.
  const AT_ONCE = { timeout: 100 };

  it("opens the first tooltip once the pointer rests and the next one at once", async () => {
    const { user } = renderWithUser(
      <TooltipProvider>
        <NamedButton label="Match case" />
        <NamedButton label="Whole word" />
      </TooltipProvider>,
    );
    const hoveredAt = performance.now();

    await user.hover(screen.getByRole("button", { name: "Match case" }));
    await waitFor(() => expect(queryTooltip()).toHaveTextContent("Match case"), {
      timeout: TOOLTIP_DELAY * 2,
    });
    expect(performance.now() - hoveredAt).toBeGreaterThanOrEqual(TOOLTIP_DELAY - 50);

    await user.hover(screen.getByRole("button", { name: "Whole word" }));
    await waitFor(() => expect(queryTooltip()).toHaveTextContent("Whole word"), AT_ONCE);
  });

  it("opens at once on keyboard focus", async () => {
    const { user } = renderWithUser(
      <TooltipProvider>
        <NamedButton label="Match case" />
      </TooltipProvider>,
    );

    await user.tab();

    await waitFor(() => expect(queryTooltip()).toHaveTextContent("Match case"), AT_ONCE);
  });

  it("shows a cut-short tooltip only while its text doesn't fit", async () => {
    const { user } = renderWithUser(
      <>
        <button type="button">Elsewhere</button>
        <Tooltip>
          <TooltipTrigger whenCutShort render={<button type="button" />}>
            <span data-testid="text">A long heading title</span>
          </TooltipTrigger>
          <TooltipContent>A long heading title</TooltipContent>
        </Tooltip>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "A long heading title" });
    const text = screen.getByTestId("text");
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });

    setCutShort(text, false);
    await user.hover(trigger);
    expect(queryTooltip()).toBeNull();

    setCutShort(text, true);
    await user.hover(elsewhere);
    expect(await hoverTooltip(user, trigger)).toHaveTextContent("A long heading title");

    setCutShort(text, false);
    await user.hover(elsewhere);
    await user.hover(trigger);
    expect(queryTooltip()).toBeNull();
  });
});
