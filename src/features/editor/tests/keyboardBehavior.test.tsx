import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  runKeyDownHandlers,
  setSelectionAtElementTextEnd,
} from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount();

describe("Milkdown keyboard behavior", () => {
  it("uses Milkdown defaults to continue list items with Enter", async () => {
    const mounted = await mountEditor("- one");
    const listItem = getEditorDomElement(mounted, "li");

    setSelectionAtElementTextEnd(mounted.view, listItem);
    const { handled } = runKeyDownHandlers(mounted.view, "Enter");

    expect(handled).toBe(true);
    expect(mounted.view.dom.querySelectorAll("li")).toHaveLength(2);
  });

  it("uses Milkdown defaults to indent and outdent list items", async () => {
    const mounted = await mountEditor("- one\n- two");
    const listItems = mounted.view.dom.querySelectorAll("li");

    expect(listItems).toHaveLength(2);

    setSelectionAtElementTextEnd(mounted.view, listItems[1]);

    expect(runKeyDownHandlers(mounted.view, "Tab").handled).toBe(true);
    expect(mounted.getMarkdown()).toContain("  * two");

    expect(runKeyDownHandlers(mounted.view, "Tab", { shift: true }).handled).toBe(true);
    expect(mounted.getMarkdown()).toBe("* one\n\n* two\n");
  });

  it("uses Milkdown defaults to insert hard breaks with Shift+Enter", async () => {
    const mounted = await mountEditor("one");
    const paragraph = getEditorDomElement(mounted, "p");

    setSelectionAtElementTextEnd(mounted.view, paragraph);
    const { handled } = runKeyDownHandlers(mounted.view, "Enter", { shift: true });

    expect(handled).toBe(true);
    expect(paragraph?.querySelector("br")).toBeInTheDocument();
  });
});
