// @vitest-environment happy-dom

import { Node as ProseMirrorNode, Schema } from "@milkdown/kit/prose/model";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser, screen, waitFor, within } from "@/test/utils/react";

import type { CodeBlockLanguageRequest } from "../plugins/codeBlockLanguage";
import { EditorCodeBlockLanguagePicker } from "./editor-code-block-language-picker";

const SCHEMA = new Schema({ nodes: { doc: { content: "text*" }, text: {} } });

const createRequest = (
  overrides: Partial<CodeBlockLanguageRequest> = {},
): CodeBlockLanguageRequest => ({
  anchor: document.body,
  document: ProseMirrorNode.fromJSON(SCHEMA, { type: "doc" }),
  language: "js",
  meta: "",
  position: 7,
  ...overrides,
});

interface PickerHostProps {
  initialRequest?: CodeBlockLanguageRequest;
  onApply?: (language: string) => boolean;
  onReturnFocus?: () => void;
}

// A mock `onCancel` leaves the picker mounted, so close paths are asserted against one that ends.
function PickerHost({
  initialRequest = createRequest(),
  onApply = () => true,
  onReturnFocus = () => {},
}: PickerHostProps) {
  const [request, setRequest] = useState<CodeBlockLanguageRequest | null>(initialRequest);

  return (
    <>
      <button type="button">Outside</button>
      <EditorCodeBlockLanguagePicker
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

const search = () => screen.getByRole("combobox", { name: "Search languages" });
const picker = () => screen.queryByTestId("editor-code-block-language-picker");
const readTexts = (element: Element) => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];

  while (walker.nextNode()) {
    texts.push(walker.currentNode.textContent ?? "");
  }

  return texts.join(" ");
};
const optionNames = () => screen.getAllByRole("option").map(readTexts);

const renderPicker = async (props: PickerHostProps = {}) => {
  const rendered = renderWithUser(<PickerHost {...props} />);

  await waitFor(() => expect(search()).toHaveFocus());

  return rendered;
};

describe("EditorCodeBlockLanguagePicker", () => {
  it("renders nothing without a request", () => {
    renderWithUser(
      <EditorCodeBlockLanguagePicker
        request={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(picker()).not.toBeInTheDocument();
  });

  it("opens on an empty, focused search above every bundled language, marking the current one", async () => {
    await renderPicker({ initialRequest: createRequest({ language: "ts" }) });

    expect(screen.getByRole("dialog", { name: "Code block language" })).toBeInTheDocument();
    expect(search()).toHaveValue("");
    expect(optionNames()).toEqual([
      "No language",
      "bash sh, shell, shellscript",
      "javascript js, jsx",
      "json",
      "markdown md",
      "mermaid",
      "rust rs",
      "typescript ts, tsx",
    ]);
    expect(screen.getByRole("option", { name: /^typescript/u })).toHaveAttribute("data-current");
    expect(screen.getByRole("option", { name: /^javascript/u })).not.toHaveAttribute(
      "data-current",
    );
  });

  it("offers no clearing for a block without a language", async () => {
    await renderPicker({ initialRequest: createRequest({ language: "" }) });

    expect(screen.queryByRole("option", { name: "No language" })).not.toBeInTheDocument();
  });

  it("narrows the list by name and alias as the search is typed", async () => {
    const { user } = await renderPicker();

    await user.type(search(), "ts");

    expect(optionNames()).toEqual(["typescript ts, tsx"]);

    await user.clear(search());
    await user.type(search(), "sh");

    expect(optionNames()).toEqual(["bash sh, shell, shellscript"]);
  });

  it("applies a clicked language and returns focus to the editor", async () => {
    const onApply = vi.fn(() => true);
    const onReturnFocus = vi.fn();
    const { user } = await renderPicker({ onApply, onReturnFocus });

    await user.click(screen.getByRole("option", { name: /^rust/u }));

    expect(onApply).toHaveBeenCalledWith("rust");
    expect(onReturnFocus).toHaveBeenCalledTimes(1);
    expect(picker()).not.toBeInTheDocument();
  });

  it("applies the language arrowed onto with Enter", async () => {
    const onApply = vi.fn(() => true);
    const { user } = await renderPicker({ onApply });

    await user.type(search(), "ts");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith("typescript");
  });

  it.each([
    ["an identifier Leafdown does not highlight", "zig", "zig"],
    ["a search that only narrows the list", "ty", "ty"],
    ["an alias", "tsx", "tsx"],
  ])("applies the typed text with Enter for %s", async (_, text, expected) => {
    const onApply = vi.fn(() => true);
    const { user } = await renderPicker({ onApply });

    await user.type(search(), text);

    expect(screen.getByText(expected, { selector: "span" }).closest("p")).toHaveTextContent(
      `Enter sets ${expected}`,
    );

    await user.keyboard("{Enter}");

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(expected);
  });

  it("closes without applying on Enter with nothing typed or arrowed onto", async () => {
    const onApply = vi.fn(() => true);
    const onReturnFocus = vi.fn();
    const { user } = await renderPicker({ onApply, onReturnFocus });

    await user.keyboard("{Enter}");

    expect(onApply).not.toHaveBeenCalled();
    expect(onReturnFocus).toHaveBeenCalledTimes(1);
    expect(picker()).not.toBeInTheDocument();
  });

  it("refuses typed text holding a space", async () => {
    const onApply = vi.fn(() => true);
    const { user } = await renderPicker({ onApply });

    await user.type(search(), "type script");

    expect(search()).toHaveAttribute("aria-invalid", "true");
    expect(search()).toHaveAccessibleDescription("A language is one word, without spaces.");

    await user.keyboard("{Enter}");

    expect(onApply).not.toHaveBeenCalled();
    expect(picker()).toBeInTheDocument();
  });

  it("clears the language from the first row, saying which metadata goes with it", async () => {
    const onApply = vi.fn(() => true);
    const { user } = await renderPicker({
      initialRequest: createRequest({ meta: 'title="x"' }),
      onApply,
    });
    const clear = screen.getByRole("option", { name: /^No language/u });

    expect(within(clear).getByText('Also removes title="x"')).toBeInTheDocument();

    await user.click(clear);

    expect(onApply).toHaveBeenCalledWith("");
  });

  it("drops the clearing row once a search narrows the list", async () => {
    const { user } = await renderPicker();

    await user.type(search(), "n");

    expect(screen.queryByRole("option", { name: /^No language/u })).not.toBeInTheDocument();
  });

  it.each([
    ["Escape", "{Escape}"],
    ["Tab", "{Tab}"],
  ])("cancels with %s, applying nothing and returning focus", async (_, keys) => {
    const onApply = vi.fn(() => true);
    const onReturnFocus = vi.fn();
    const { user } = await renderPicker({ onApply, onReturnFocus });

    await user.type(search(), "ru");
    await user.keyboard(keys);

    expect(picker()).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(onReturnFocus).toHaveBeenCalled();
  });

  it("leaves focus where an outside press put it", async () => {
    const onReturnFocus = vi.fn();
    const { user } = await renderPicker({ onReturnFocus });

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(picker()).not.toBeInTheDocument();
    expect(onReturnFocus).not.toHaveBeenCalled();
  });

  it("closes when a stale request refuses the language", async () => {
    const onApply = vi.fn(() => false);
    const { user } = await renderPicker({ onApply });

    await user.click(screen.getByRole("option", { name: /^json/u }));

    expect(onApply).toHaveBeenCalledWith("json");
    expect(picker()).not.toBeInTheDocument();
  });
});
