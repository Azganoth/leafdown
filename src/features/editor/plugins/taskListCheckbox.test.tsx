import { describe, expect, it, vi } from "vitest";

import { UNCHECKED_TASK_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { dispatchClick } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorDomElement } from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount();
const TASK_LIST_ITEM_LEFT_PX = 40;

const stubElementRect = (element: Element, left = TASK_LIST_ITEM_LEFT_PX) => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    bottom: 24,
    height: 24,
    left,
    right: left + 160,
    top: 0,
    width: 160,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
};

describe("task list checkbox plugin", () => {
  it("toggles rendered task checkboxes by clicking their checkbox area", async () => {
    const mounted = await mountEditor(UNCHECKED_TASK_MARKDOWN);
    const taskListItem = getEditorDomElement(mounted, "li[data-checked='false']");

    stubElementRect(taskListItem);
    const event = dispatchClick(taskListItem, { clientX: TASK_LIST_ITEM_LEFT_PX + 12, clientY: 1 });

    expect(event.defaultPrevented).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked='true']")).toHaveTextContent("Todo");
    expect(mounted.getMarkdown()).toContain("* [x] Todo");
  });

  it("ignores task-list clicks outside the checkbox hit area", async () => {
    const mounted = await mountEditor(UNCHECKED_TASK_MARKDOWN);
    const taskListItem = getEditorDomElement(mounted, "li[data-checked='false']");

    stubElementRect(taskListItem);
    const event = dispatchClick(taskListItem, { clientX: TASK_LIST_ITEM_LEFT_PX + 32, clientY: 1 });

    expect(event.defaultPrevented).toBe(false);
    expect(mounted.view.dom.querySelector("li[data-checked='false']")).toHaveTextContent("Todo");
    expect(mounted.getMarkdown()).toContain("* [ ] Todo");
  });

  it("ignores normal list items", async () => {
    const mounted = await mountEditor("- Todo");
    const listItem = getEditorDomElement(mounted, "li");

    stubElementRect(listItem);
    const event = dispatchClick(listItem, { clientX: TASK_LIST_ITEM_LEFT_PX + 12, clientY: 1 });

    expect(event.defaultPrevented).toBe(false);
    expect(mounted.view.dom.querySelector("li[data-checked]")).not.toBeInTheDocument();
    expect(mounted.getMarkdown()).not.toContain("[");
  });
});
