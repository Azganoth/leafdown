// @vitest-environment happy-dom

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import type { CalloutTypeChoices } from "../commands/formatting/callouts";
import type { BoundaryInsertKind } from "../commands/inserting/blocks";
import type { BlockInsertionRequest } from "../plugins/blockSelectionInteraction";
import { EditorBlockInsertionMenu } from "./editor-block-insertion-menu";

const CALLOUT_CHOICES: CalloutTypeChoices = {
  current: null,
  options: [
    { label: "Note", token: "NOTE" },
    { label: "Tip", token: "TIP" },
  ],
  otherDialects: [{ dialect: "mkdocs", options: [{ label: "Bug", token: "bug" }] }],
};

const ROOT_KINDS = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "image",
  "blockquote",
  "callout",
  "unorderedList",
  "orderedList",
  "taskList",
  "codeBlock",
  "table",
  "horizontalRule",
] as const satisfies readonly BoundaryInsertKind[];

const renderMenu = (kinds: readonly BoundaryInsertKind[]) => {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  const request: BlockInsertionRequest = {
    anchor,
    boundary: 4,
    document: {} as ProseMirrorNode,
    kinds,
    onDismiss: vi.fn(),
    source: "keyboard",
  };
  const handlers = {
    onChooseCalloutType: vi.fn(),
    onClose: vi.fn(),
    onExecute: vi.fn(),
    onReturnFocus: vi.fn(),
    readCalloutTypes: vi.fn(() => CALLOUT_CHOICES),
  };
  const rendered = renderWithUser(<EditorBlockInsertionMenu request={request} {...handlers} />);

  return { ...rendered, ...handlers };
};

const menu = () => screen.getByTestId("editor-block-insertion-menu");

describe("EditorBlockInsertionMenu", () => {
  it("offers the Insert menu's groups with the slot's invalid blocks disabled", async () => {
    const { onExecute, user } = renderMenu(ROOT_KINDS.filter((kind) => kind !== "callout"));

    expect(menu()).toHaveAccessibleName("Insert block");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Paragraph" })).toHaveFocus());
    expect(
      within(menu())
        .getAllByRole("group")
        .map((group) => group.firstElementChild?.textContent),
    ).toEqual(["Text", "Heading", "Lists & containers", "Objects"]);
    expect(screen.getByRole("menuitem", { name: "Heading 3" })).toHaveTextContent("H3");
    expect(screen.getByRole("menuitem", { name: "Image" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("menuitem", { name: "Callout" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await user.click(screen.getByRole("menuitem", { name: "Unordered list" }));

    expect(onExecute).toHaveBeenCalledWith("unorderedList");
  });

  it("inserts a callout of a type chosen from any dialect at the slot", async () => {
    const { onChooseCalloutType, readCalloutTypes, user } = renderMenu(ROOT_KINDS);

    await user.hover(screen.getByRole("menuitem", { name: "Callout" }));
    await user.keyboard("{ArrowRight}");
    const group = await screen.findByRole("group", { name: "Callout" });

    expect(readCalloutTypes).toHaveBeenCalled();
    expect(
      within(group)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Note", "Tip", "MkDocs"]);

    await waitFor(() =>
      expect(within(group).getByRole("menuitem", { name: "Note" })).toHaveFocus(),
    );
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChooseCalloutType).toHaveBeenCalledWith("insert", "TIP");
  });

  it("offers only a list item between list items", async () => {
    const { onExecute, user } = renderMenu(["listItem"]);

    expect(
      within(menu())
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["List item"]);
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "List item" })).toHaveFocus());

    await user.keyboard("{Enter}");

    expect(onExecute).toHaveBeenCalledWith("listItem");
  });

  it.each(["{Escape}", "{Tab}"])("returns focus to the document on %s", async (key) => {
    const { onClose, onReturnFocus, user } = renderMenu(ROOT_KINDS);

    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Paragraph" })).toHaveFocus());
    await user.keyboard(key);

    expect(onReturnFocus).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("leaves focus to an outside press that dismisses it", async () => {
    const { onClose, onReturnFocus, user } = renderMenu(ROOT_KINDS);

    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Paragraph" })).toHaveFocus());
    await user.click(document.body);

    expect(onClose).toHaveBeenCalled();
    expect(onReturnFocus).not.toHaveBeenCalled();
  });
});
