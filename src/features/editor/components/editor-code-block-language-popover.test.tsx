// @vitest-environment happy-dom

import { Node as ProseMirrorNode, Schema } from "@milkdown/kit/prose/model";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser, screen, waitFor } from "@/test/utils/react";

import type { CodeBlockLanguageRequest } from "../plugins/codeBlockLanguage";
import { EditorCodeBlockLanguagePopover } from "./editor-code-block-language-popover";

const createAnchorRect = (): DOMRect => {
  const rect = { bottom: 80, height: 20, left: 40, right: 41, top: 60, width: 1, x: 40, y: 60 };

  return { ...rect, toJSON: () => rect };
};

const SCHEMA = new Schema({ nodes: { doc: { content: "text*" }, text: {} } });

const createRequest = (
  overrides: Partial<CodeBlockLanguageRequest> = {},
): CodeBlockLanguageRequest => ({
  anchor: { contextElement: document.body, getRect: createAnchorRect },
  document: ProseMirrorNode.fromJSON(SCHEMA, { type: "doc" }),
  language: "js",
  meta: "",
  position: 7,
  ...overrides,
});

interface PopoverHostProps {
  initialRequest?: CodeBlockLanguageRequest;
  onApply?: (language: string) => boolean;
  onReturnFocus?: () => void;
}

// A mock `onCancel` leaves the popover mounted, so close paths are asserted against one that ends.
function PopoverHost({
  initialRequest = createRequest(),
  onApply = () => true,
  onReturnFocus = () => {},
}: PopoverHostProps) {
  const [request, setRequest] = useState<CodeBlockLanguageRequest | null>(initialRequest);

  return (
    <>
      <button type="button">Outside</button>
      <EditorCodeBlockLanguagePopover
        request={request}
        onApply={(language) => {
          const applied = onApply(language);

          if (applied) {
            setRequest(null);
          }

          return applied;
        }}
        onCancel={() => setRequest(null)}
        onReturnFocus={onReturnFocus}
      />
    </>
  );
}

// While its suggestions are open, the autocomplete hides the rest of the popover from assistive
// technology, the field's label included, so queries made then look past that.
const languageField = () => screen.getByRole("combobox", { name: "Language", hidden: true });
const button = (name: string) => screen.getByRole("button", { name, hidden: true });
const popover = () => screen.queryByTestId("editor-code-block-language-popover");

describe("EditorCodeBlockLanguagePopover", () => {
  it("renders nothing without a request", () => {
    renderWithUser(
      <EditorCodeBlockLanguagePopover
        request={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(popover()).not.toBeInTheDocument();
  });

  it("opens on the block's language with the field focused", async () => {
    renderWithUser(<PopoverHost />);

    expect(screen.getByRole("dialog", { name: "Code block language" })).toBeInTheDocument();
    await waitFor(() => expect(languageField()).toHaveFocus());
    expect(languageField()).toHaveValue("js");
  });

  it("applies an identifier it does not suggest and returns focus to the editor", async () => {
    const onApply = vi.fn(() => true);
    const onReturnFocus = vi.fn();
    const { user } = renderWithUser(
      <PopoverHost onApply={onApply} onReturnFocus={onReturnFocus} />,
    );

    await user.clear(languageField());

    expect(screen.getByRole("combobox", { name: "Language" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.type(languageField(), "zig");

    expect(screen.getByRole("combobox", { name: "Language" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("listbox", { hidden: true })).not.toBeInTheDocument();

    await user.click(button("Apply"));

    expect(onApply).toHaveBeenCalledWith("zig");
    expect(onReturnFocus).toHaveBeenCalledTimes(1);
    expect(popover()).not.toBeInTheDocument();
  });

  it("suggests the bundled languages matching what is typed and applies a chosen one", async () => {
    const onApply = vi.fn(() => true);
    const { user } = renderWithUser(<PopoverHost onApply={onApply} />);

    await user.clear(languageField());
    await user.type(languageField(), "ty");

    expect(await screen.findByRole("option", { name: "typescript" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "rust" })).not.toBeInTheDocument();

    await user.keyboard("{ArrowDown}{Enter}");

    expect(languageField()).toHaveValue("typescript");

    await user.keyboard("{Enter}");

    expect(onApply).toHaveBeenCalledWith("typescript");
  });

  it("refuses a language holding a space", async () => {
    const onApply = vi.fn(() => true);
    const { user } = renderWithUser(<PopoverHost onApply={onApply} />);

    await user.clear(languageField());
    await user.type(languageField(), "type script");

    expect(screen.getByRole("combobox", { name: "Language" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("A language is one word, without spaces.")).toBeInTheDocument();
    expect(button("Apply")).toBeDisabled();

    await user.keyboard("{Escape}{Enter}");

    expect(onApply).not.toHaveBeenCalled();
  });

  it("says that clearing the language removes the metadata after it", async () => {
    const onApply = vi.fn(() => true);
    const { user } = renderWithUser(
      <PopoverHost initialRequest={createRequest({ meta: 'title="x"' })} onApply={onApply} />,
    );

    expect(screen.queryByText(/also removes/u)).not.toBeInTheDocument();

    await user.clear(languageField());

    expect(
      screen.getByText('Clearing the language also removes the rest of the info string: title="x"'),
    ).toBeInTheDocument();

    await user.click(button("Apply"));

    expect(onApply).toHaveBeenCalledWith("");
  });

  it.each([
    [
      "Cancel",
      async (user: ReturnType<typeof renderWithUser>["user"]) => user.click(button("Cancel")),
    ],
    [
      "Escape",
      async (user: ReturnType<typeof renderWithUser>["user"]) => user.keyboard("{Escape}"),
    ],
  ])("cancels with %s, applying nothing and returning focus", async (_, dismiss) => {
    const onApply = vi.fn(() => true);
    const onReturnFocus = vi.fn();
    const { user } = renderWithUser(
      <PopoverHost onApply={onApply} onReturnFocus={onReturnFocus} />,
    );

    await waitFor(() => expect(languageField()).toHaveFocus());
    await dismiss(user);

    expect(popover()).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(onReturnFocus).toHaveBeenCalledTimes(1);
  });

  it("leaves focus where an outside press put it", async () => {
    const onReturnFocus = vi.fn();
    const { user } = renderWithUser(<PopoverHost onReturnFocus={onReturnFocus} />);

    await waitFor(() => expect(languageField()).toHaveFocus());
    await user.click(button("Outside"));

    expect(popover()).not.toBeInTheDocument();
    expect(onReturnFocus).not.toHaveBeenCalled();
  });

  it("closes when a stale request refuses the language", async () => {
    const onApply = vi.fn(() => false);
    const { user } = renderWithUser(<PopoverHost onApply={onApply} />);

    await user.click(button("Apply"));

    expect(onApply).toHaveBeenCalledWith("js");
    expect(popover()).not.toBeInTheDocument();
  });
});
