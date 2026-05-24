import { afterEach, describe, expect, it } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { pressKey, setSelectionAtTextEnd } from "@/test/utils/prosemirror";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown);
  mountedEditors.push(mounted);
  return mounted;
};

describe("Milkdown keyboard behavior", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("uses Milkdown defaults to continue list items with Enter", async () => {
    const mounted = await mountEditor("- one");
    const listItem = mounted.view.dom.querySelector("li");

    expect(listItem).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, listItem as HTMLLIElement);
    const { handled } = pressKey(mounted.view, "Enter");

    expect(handled).toBe(true);
    expect(mounted.view.dom.querySelectorAll("li")).toHaveLength(2);
  });

  it("uses Milkdown defaults to indent and outdent list items", async () => {
    const mounted = await mountEditor("- one\n- two");
    const listItems = mounted.view.dom.querySelectorAll("li");

    expect(listItems).toHaveLength(2);

    setSelectionAtTextEnd(mounted.view, listItems[1]);

    expect(pressKey(mounted.view, "Tab").handled).toBe(true);
    expect(mounted.getMarkdown()).toContain("  * two");

    expect(pressKey(mounted.view, "Tab", { shiftKey: true }).handled).toBe(true);
    expect(mounted.getMarkdown()).toBe("* one\n\n* two\n");
  });

  it("uses Milkdown defaults to insert hard breaks with Shift+Enter", async () => {
    const mounted = await mountEditor("one");
    const paragraph = mounted.view.dom.querySelector("p");

    expect(paragraph).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, paragraph as HTMLParagraphElement);
    const { handled } = pressKey(mounted.view, "Enter", { shiftKey: true });

    expect(handled).toBe(true);
    expect(paragraph?.querySelector("br")).toBeInTheDocument();
  });
});
