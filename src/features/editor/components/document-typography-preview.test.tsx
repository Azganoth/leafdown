// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils/react";

import { DocumentTypographyPreview } from "./document-typography-preview";

describe("document-typography-preview", () => {
  it("sets a sample in the document styles for the given typography", () => {
    render(<DocumentTypographyPreview font="literata" textSize={18} lineSpacing="relaxed" />);

    const preview = screen.getByTestId("document-typography-preview");

    expect(preview).toHaveClass("leafdown-editor");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview).toHaveAttribute("data-document-font", "literata");
    expect(preview).toHaveAttribute("data-text-size", "18");
    expect(preview).toHaveAttribute("data-line-spacing", "relaxed");
    expect(preview.querySelector(".ProseMirror > h2")).toHaveTextContent("A heading");
    expect(preview.querySelector(".ProseMirror em")).toHaveTextContent(
      "Emphasis uses the font's italic.",
    );
    expect(preview.querySelector(".ProseMirror pre > code")).toHaveTextContent(
      "const answer = 42;",
    );
  });
});
