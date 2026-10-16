// @vitest-environment happy-dom

import { Node as ProseMirrorNode, Schema } from "@milkdown/kit/prose/model";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithUser, screen, waitFor } from "@/test/utils/react";

import type { CalloutTypeRequest } from "../plugins/calloutType";
import { EditorCalloutTypePicker } from "./editor-callout-type-picker";

const SCHEMA = new Schema({ nodes: { doc: { content: "text*" }, text: {} } });

const createRequest = (overrides: Partial<CalloutTypeRequest> = {}): CalloutTypeRequest => ({
  anchor: document.body,
  dialect: "docusaurus",
  document: ProseMirrorNode.fromJSON(SCHEMA, { type: "doc" }),
  target: { type: "change", position: 7 },
  token: "tip",
  ...overrides,
});

interface PickerHostProps {
  initialRequest?: CalloutTypeRequest;
  onApply?: (token: string) => boolean;
  onReturnFocus?: () => void;
}

// A mock `onCancel` leaves the picker mounted, so close paths are asserted against one that ends.
function PickerHost({
  initialRequest = createRequest(),
  onApply = () => true,
  onReturnFocus = () => {},
}: PickerHostProps) {
  const [request, setRequest] = useState<CalloutTypeRequest | null>(initialRequest);

  return (
    <>
      <button type="button">Outside</button>
      <EditorCalloutTypePicker
        request={request}
        onApply={(token) => {
          const applied = onApply(token);

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

const search = () => screen.getByRole("combobox", { name: "Search callout types" });
const picker = () => screen.queryByTestId("editor-callout-type-picker");
const optionNames = () => screen.getAllByRole("option").map((option) => option.textContent);

const renderPicker = async (props: PickerHostProps = {}) => {
  const rendered = renderWithUser(<PickerHost {...props} />);

  await waitFor(() => expect(search()).toHaveFocus());

  return rendered;
};

describe("EditorCalloutTypePicker", () => {
  it("renders nothing without a request", () => {
    renderWithUser(
      <EditorCalloutTypePicker
        request={null}
        onApply={vi.fn()}
        onCancel={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    expect(picker()).not.toBeInTheDocument();
  });

  it("lists the dialect's types on a focused search, marking the current one", async () => {
    await renderPicker();

    expect(screen.getByRole("dialog", { name: "Callout type" })).toBeInTheDocument();
    expect(optionNames()).toEqual(["note", "tip", "info", "warning", "danger"]);
    expect(screen.getByRole("option", { name: "tip" })).toHaveAttribute("data-current");
    expect(screen.getByRole("option", { name: "note" })).not.toHaveAttribute("data-current");
  });

  it("names an insertion for what it does and marks no type", async () => {
    await renderPicker({
      initialRequest: createRequest({
        dialect: "github",
        target: { type: "insert", boundary: 4 },
        token: null,
      }),
    });

    expect(screen.getByRole("dialog", { name: "Insert callout" })).toBeInTheDocument();
    expect(optionNames()).toEqual(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]);
    expect(
      screen.getAllByRole("option").filter((option) => option.hasAttribute("data-current")),
    ).toEqual([]);
  });

  it("applies a clicked type and returns focus to the editor", async () => {
    const onApply = vi.fn(() => true);
    const onReturnFocus = vi.fn();
    const { user } = await renderPicker({ onApply, onReturnFocus });

    await user.click(screen.getByRole("option", { name: "warning" }));

    expect(onApply).toHaveBeenCalledWith("warning");
    expect(onReturnFocus).toHaveBeenCalledTimes(1);
    expect(picker()).not.toBeInTheDocument();
  });

  it("narrows the list as the search is typed and applies the first match with Enter", async () => {
    const onApply = vi.fn(() => true);
    const onReturnFocus = vi.fn();
    const { user } = await renderPicker({
      initialRequest: createRequest({ dialect: "github", token: "NOTE" }),
      onApply,
      onReturnFocus,
    });

    await user.type(search(), "ca");

    expect(optionNames()).toEqual(["CAUTION"]);

    await user.keyboard("{Enter}");

    expect(onApply).toHaveBeenCalledWith("CAUTION");
    expect(onReturnFocus).toHaveBeenCalledTimes(1);
  });

  it("applies the type arrowed onto with Enter", async () => {
    const onApply = vi.fn(() => true);
    const { user } = await renderPicker({ onApply });

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith("tip");
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

  it.each([
    ["Escape", "{Escape}"],
    ["Tab", "{Tab}"],
  ])("cancels with %s, applying nothing and returning focus", async (_, keys) => {
    const onApply = vi.fn(() => true);
    const onReturnFocus = vi.fn();
    const { user } = await renderPicker({ onApply, onReturnFocus });

    await user.type(search(), "da");
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

  it("closes when a stale request refuses the type", async () => {
    const onApply = vi.fn(() => false);
    const { user } = await renderPicker({ onApply });

    await user.click(screen.getByRole("option", { name: "info" }));

    expect(onApply).toHaveBeenCalledWith("info");
    expect(picker()).not.toBeInTheDocument();
  });
});
