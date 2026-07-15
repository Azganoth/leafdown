import { describe, expect, it, vi } from "vitest";

import { dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

const HOVERED_LINK_CONTENT_CLASS_NAME = "leafdown-rendered-link__content--hovered";

const mountEditor = setupMilkdownEditorMount();

const getLinkFragment = (root: HTMLElement, text: string) => {
  const fragment = Array.from(root.querySelectorAll("a")).find((link) => link.textContent === text);

  if (!fragment) {
    throw new Error(`Expected a rendered link fragment containing '${text}'.`);
  }

  return fragment;
};

const hasHoveredContent = (fragment: HTMLAnchorElement) =>
  fragment.querySelector(`.${HOVERED_LINK_CONTENT_CLASS_NAME}`) !== null;

describe("rendered link presentation", () => {
  it("coordinates hover across a mixed-format link without document side effects", async () => {
    const source =
      '[**calibration summary** with *field observations*, ~~retired wording~~, and `v2`](./article.md "Calibration review")';
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(source, { onContentChanged });
    const getFragments = () =>
      Array.from(mounted.view.dom.querySelectorAll<HTMLAnchorElement>("a"));
    const firstFragment = getLinkFragment(mounted.view.dom, "calibration summary");
    const originalDocument = mounted.view.state.doc;

    dispatchMouseEvent(firstFragment, "mouseover");

    expect(getFragments().every(hasHoveredContent)).toBe(true);
    expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    expect(mounted.getMarkdown()).toBe(`${source}\n`);
    expect(onContentChanged).not.toHaveBeenCalled();

    dispatchMouseEvent(getLinkFragment(mounted.view.dom, "calibration summary"), "mouseout", {
      relatedTarget: getLinkFragment(mounted.view.dom, "v2"),
    });

    expect(getFragments().every(hasHoveredContent)).toBe(true);

    dispatchMouseEvent(getLinkFragment(mounted.view.dom, "v2"), "mouseout");

    expect(getFragments().every((fragment) => !hasHoveredContent(fragment))).toBe(true);
    expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
    expect(mounted.getMarkdown()).toBe(`${source}\n`);
    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it("presents plain rendered links through the same hover range", async () => {
    const mounted = await mountEditor("[Plain label](./article.md)");
    const fragment = getLinkFragment(mounted.view.dom, "Plain label");

    dispatchMouseEvent(fragment, "mouseover");

    expect(hasHoveredContent(getLinkFragment(mounted.view.dom, "Plain label"))).toBe(true);

    dispatchMouseEvent(getLinkFragment(mounted.view.dom, "Plain label"), "mouseout");

    expect(hasHoveredContent(getLinkFragment(mounted.view.dom, "Plain label"))).toBe(false);
  });

  it("keeps adjacent links with the same destination isolated", async () => {
    const mounted = await mountEditor(
      "[First](https://example.com) [**Second** and *soft*](https://example.com)",
    );
    const secondFragment = getLinkFragment(mounted.view.dom, "Second");

    dispatchMouseEvent(secondFragment, "mouseover");

    expect(hasHoveredContent(getLinkFragment(mounted.view.dom, "First"))).toBe(false);
    expect(
      Array.from(mounted.view.dom.querySelectorAll<HTMLAnchorElement>("a"))
        .filter((fragment) => fragment.textContent !== "First")
        .every(hasHoveredContent),
    ).toBe(true);
  });
});
