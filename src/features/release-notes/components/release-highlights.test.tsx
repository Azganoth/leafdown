// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { render, screen, within } from "@/test/utils/react";

import { ReleaseHighlights } from "./release-highlights";

describe("ReleaseHighlights", () => {
  it("draws a highlight's bundled illustration and keeps a highlight without one readable", () => {
    render(
      <ReleaseHighlights
        highlights={[
          {
            title: "Drawn",
            body: "Press `Ctrl+T`.",
            illustration: '<svg viewBox="0 0 240 144"><circle r="4"></circle></svg>',
          },
          { title: "Missing", body: "Still **readable**.", illustration: null },
        ]}
      />,
    );

    const [drawn, missing] = within(screen.getByRole("list", { name: "Highlights" })).getAllByRole(
      "listitem",
    );
    expect(drawn.querySelector("[aria-hidden='true'] > svg circle")).not.toBeNull();
    expect(within(drawn).getByText("Ctrl+T").tagName).toBe("CODE");
    expect(missing.querySelector("svg")).toBeNull();
    expect(within(missing).getByRole("heading", { level: 3, name: "Missing" })).toBeInTheDocument();
    expect(missing).toHaveTextContent("Still readable.");
  });
});
