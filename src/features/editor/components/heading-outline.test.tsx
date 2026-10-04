// @vitest-environment happy-dom

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { act, renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import type { HeadingOutlineState, OutlineDepth } from "../utils/headingOutline";
import { HeadingOutline } from "./heading-outline";

const OUTLINE: HeadingOutlineState = {
  headings: [
    { position: 0, level: 1, text: "Trip notes", context: [] },
    { position: 12, level: 2, text: "Gear", context: [] },
    { position: 20, level: 3, text: "Water", context: [] },
    { position: 30, level: 4, text: "Filtering", context: [] },
    { position: 44, level: 3, text: "Bail-out points", context: ["callout"] },
  ],
  activePosition: 30,
};

function OutlineHarness({
  onNavigate = () => undefined,
  outline = OUTLINE,
}: {
  onNavigate?: (position: number) => void;
  outline?: HeadingOutlineState;
}) {
  const [depth, setDepth] = useState<OutlineDepth>(3);
  return (
    <>
      <button type="button">Editor</button>
      <HeadingOutline
        depth={depth}
        onDepthChange={setDepth}
        onNavigate={onNavigate}
        outline={outline}
      />
    </>
  );
}

const getOutline = () => screen.getByRole("navigation", { name: "Document outline" });
const getRow = (name: string) => within(getOutline()).getByRole("button", { name });
const isOpen = () => screen.getByTestId("heading-outline").hasAttribute("data-open");

describe("HeadingOutline", () => {
  it("lists headings to the chosen level and marks the nearest shown heading", () => {
    renderWithUser(<OutlineHarness />);

    expect(within(getOutline()).getAllByRole("button", { name: /^Heading/u })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Heading 4: Filtering" })).not.toBeInTheDocument();
    expect(getRow("Heading 3: Water")).toHaveAttribute("aria-current", "location");
    expect(getRow("Heading 3: Bail-out points, in Callout")).toHaveStyle({
      "--outline-indent": "28px",
    });
    expect(getRow("Heading 3: Water")).toHaveAttribute("tabindex", "0");
    expect(getRow("Heading 2: Gear")).toHaveAttribute("tabindex", "-1");
  });

  it("opens on hover at the pointed heading and closes after the pointer leaves", async () => {
    // Rows sit 10px apart from the top of the surface, in document order.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const rows = [...document.querySelectorAll("[data-outline-position]")];
        const index = rows.indexOf(this);
        return DOMRect.fromRect({ x: 0, y: index < 0 ? 0 : index * 10, width: 24, height: 10 });
      },
    );
    const { user } = renderWithUser(<OutlineHarness />);

    await user.pointer({ target: getRow("Heading 2: Gear"), coords: { clientX: 0, clientY: 15 } });
    await waitFor(() => expect(isOpen()).toBe(true));
    expect(getRow("Heading 2: Gear")).toHaveAttribute("data-preview");

    // Over the titles, left of the marks, only the hovered row is highlighted.
    await user.pointer({
      target: getRow("Heading 3: Water"),
      coords: { clientX: -50, clientY: 25 },
    });
    expect(getOutline().querySelector("[data-preview]")).toBeNull();

    await user.unhover(getOutline());
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it("opens rather than navigates when a closed row is pressed, then navigates", async () => {
    const onNavigate = vi.fn();
    const { user } = renderWithUser(<OutlineHarness onNavigate={onNavigate} />);
    const gear = getRow("Heading 2: Gear");

    await user.pointer({ keys: "[TouchA]", target: gear });
    expect(isOpen()).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();

    await user.pointer({ keys: "[TouchA]", target: gear });
    expect(onNavigate).toHaveBeenCalledWith(12);
  });

  it("opens at the current heading from the keyboard and returns focus on Escape", async () => {
    const onNavigate = vi.fn();
    const { user } = renderWithUser(<OutlineHarness onNavigate={onNavigate} />);
    const editor = screen.getByRole("button", { name: "Editor" });
    editor.focus();

    act(() => getRow("Heading 3: Water").focus());
    expect(isOpen()).toBe(true);

    await user.keyboard("{ArrowDown}");
    expect(getRow("Heading 3: Bail-out points, in Callout")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(getRow("Heading 1: Trip notes")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onNavigate).toHaveBeenCalledWith(0);

    await user.keyboard("{Escape}");
    expect(isOpen()).toBe(false);
    expect(editor).toHaveFocus();
  });

  it("changes the shown levels from the open outline", async () => {
    const { user } = renderWithUser(<OutlineHarness />);
    act(() => getRow("Heading 3: Water").focus());

    const levels = within(getOutline()).getByRole("group", { name: "Heading levels" });
    expect(
      within(levels).getByRole("button", { name: "Show headings down to level 3" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(within(levels).getByRole("button", { name: "Show headings down to level 4" }));

    expect(getRow("Heading 4: Filtering")).toHaveAttribute("aria-current", "location");
    expect(isOpen()).toBe(true);
  });

  it("renders nothing for a document without headings", () => {
    renderWithUser(<OutlineHarness outline={{ headings: [], activePosition: null }} />);

    expect(screen.queryByRole("navigation", { name: "Document outline" })).not.toBeInTheDocument();
  });
});
