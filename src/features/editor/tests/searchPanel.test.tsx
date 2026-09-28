// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { MilkdownEditor, type MilkdownEditorBridge } from "@/features/editor";
import { act, renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import { CURRENT_SEARCH_MATCH_CLASS, SEARCH_MATCH_CLASS } from "../plugins/search";

const renderEditor = async (initialMarkdown: string) => {
  let bridge: MilkdownEditorBridge | null = null;
  const rendered = renderWithUser(
    <MilkdownEditor
      initialMarkdown={initialMarkdown}
      ref={(nextBridge) => {
        bridge = nextBridge;
      }}
    />,
  );

  await waitFor(() => expect(bridge?.getViewState?.()).not.toBeNull());

  const getBridge = () => {
    if (!bridge) {
      throw new Error("The editor bridge is not available.");
    }

    return bridge;
  };

  const runCommand = async (
    commandId: Parameters<NonNullable<MilkdownEditorBridge["runCommand"]>>[0],
  ) => {
    await act(async () => {
      await getBridge().runCommand?.(commandId);
    });
  };

  return { ...rendered, getBridge, runCommand };
};

const getPanel = () => screen.getByRole("search", { name: "Find and replace" });
const getQuery = () => within(getPanel()).getByRole("textbox", { name: "Find" });
const getResults = () => within(getPanel()).getByTestId("editor-search-results");
const getHighlights = (className = SEARCH_MATCH_CLASS) =>
  screen.getByTestId("milkdown-editor-host").querySelectorAll(`.${className}`);

describe("search panel", () => {
  it("opens with the query focused and steps through the matches with Enter", async () => {
    const { runCommand, user } = await renderEditor("Leaf one, leaf two.\n\nZ");

    await runCommand("edit.find");

    await waitFor(() => expect(getQuery()).toHaveFocus());

    await user.type(getQuery(), "leaf");

    expect(getResults()).toHaveTextContent("1 of 2");
    expect(getHighlights()).toHaveLength(2);
    expect(getHighlights(CURRENT_SEARCH_MATCH_CLASS)[0]).toHaveTextContent("Leaf");

    await user.keyboard("{Enter}");

    expect(getResults()).toHaveTextContent("2 of 2");
    expect(getHighlights(CURRENT_SEARCH_MATCH_CLASS)[0]).toHaveTextContent("leaf");

    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(getResults()).toHaveTextContent("1 of 2");
    expect(getQuery()).toHaveFocus();
  });

  it("narrows the matches with match case and whole word", async () => {
    const { runCommand, user } = await renderEditor("Leaf, leaf, and leaflet.\n\nZ");

    await runCommand("edit.find");
    await user.type(getQuery(), "leaf");

    expect(getResults()).toHaveTextContent("1 of 3");

    await user.click(within(getPanel()).getByRole("button", { name: "Match case" }));

    expect(within(getPanel()).getByRole("button", { name: "Match case" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(getHighlights()).toHaveLength(2);

    await user.click(within(getPanel()).getByRole("button", { name: "Whole word" }));

    expect(getHighlights()).toHaveLength(1);
    expect(getResults()).toHaveTextContent("1 of 1");
  });

  it("reports a query without matches and leaves nothing to move to", async () => {
    const { runCommand, user } = await renderEditor("Leaf one.\n\nZ");

    await runCommand("edit.find");
    await user.type(getQuery(), "tree");

    expect(getResults()).toHaveTextContent("No results");
    expect(within(getPanel()).getByRole("button", { name: "Next match" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(getHighlights()).toHaveLength(0);
  });

  it("closes on Escape with the current match selected and focus back in the text", async () => {
    const { getBridge, runCommand, user } = await renderEditor("Leaf one, leaf two.\n\nZ");

    await runCommand("edit.find");
    await user.type(getQuery(), "leaf");
    await user.keyboard("{Enter}{Escape}");

    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(getHighlights()).toHaveLength(0);
    expect(document.activeElement).toHaveAttribute("contenteditable", "true");
    expect(getBridge().getViewState?.()).toEqual({ anchor: 11, head: 15, focused: true });
  });

  it("replaces through the replace row, one match at a time or all at once", async () => {
    const { getBridge, runCommand, user } = await renderEditor(
      "Leaf one, leaf two, leaf three.\n\nZ",
    );

    await runCommand("edit.find");
    await user.type(getQuery(), "leaf");
    await runCommand("edit.replace");

    const replacement = within(getPanel()).getByRole("textbox", { name: "Replace with" });

    await waitFor(() => expect(replacement).toHaveFocus());
    expect(within(getPanel()).getByRole("button", { name: "Hide replace" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.type(replacement, "tree{Enter}");

    expect(getBridge().getMarkdown()).toBe("tree one, leaf two, leaf three.\n\nZ\n");
    expect(getResults()).toHaveTextContent("1 of 2");

    await user.click(within(getPanel()).getByRole("button", { name: "Replace all" }));

    expect(getBridge().getMarkdown()).toBe("tree one, tree two, tree three.\n\nZ\n");
    expect(getResults()).toHaveTextContent("No results");
  });
});
