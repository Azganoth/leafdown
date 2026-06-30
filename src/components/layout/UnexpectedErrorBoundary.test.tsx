import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/utils/react";

import { UnexpectedErrorBoundary } from "./UnexpectedErrorBoundary";

const renderError = new Error("render failed");

function BrokenComponent(): never {
  throw renderError;
}

describe("UnexpectedErrorBoundary", () => {
  it("renders a fallback and logs render errors", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <UnexpectedErrorBoundary>
        <BrokenComponent />
      </UnexpectedErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (react: render).",
      renderError,
      expect.objectContaining({
        componentStack: expect.stringContaining("BrokenComponent"),
      }),
    );
  });
});
