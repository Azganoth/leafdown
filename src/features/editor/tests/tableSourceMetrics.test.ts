// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const readMetricsRows = (dom: HTMLElement) =>
  [...(dom.querySelector("tfoot.leafdown-table-metrics")?.children ?? [])].map((row) =>
    [...row.children].map((cell) => cell.textContent),
  );

describe("Table source metrics", () => {
  it("mirrors every cell in the source a projection would show", async () => {
    const mounted = await mountEditor(`| Command | Value |
| --- | --- |
| \`pnpm run collect\` | plain text |
| **bold cell** | [garden](destination.md) |
| *leaf* | ~~old~~ |
`);

    expect(readMetricsRows(mounted.view.dom)).toEqual([
      ["Command", "Value"],
      ["`pnpm run collect`", "plain text"],
      ["**bold cell**", "[garden](destination.md)"],
      ["*leaf*", "~~old~~"],
    ]);
  });

  it("gives a mirrored run the presentation its projection carries", async () => {
    const mounted = await mountEditor(`| Value |
| --- |
| \`code\` |
`);
    const spans = [
      ...(mounted.view.dom.querySelectorAll("tfoot.leafdown-table-metrics tr:last-child span") ??
        []),
    ].map((span) => [span.className, span.textContent]);

    expect(spans).toEqual([
      ["leafdown-source-projection__marker", "`"],
      [
        "leafdown-source-projection__content leafdown-source-projection__content--inline-code",
        "code",
      ],
      ["leafdown-source-projection__marker", "`"],
    ]);
  });

  it("keeps the mirror in step with an edited cell", async () => {
    const mounted = await mountEditor(`| Value |
| --- |
| one |
`);
    const { view } = mounted;
    let cellTextPosition = 0;

    view.state.doc.descendants((node, position) => {
      if (node.isText && node.text === "one") {
        cellTextPosition = position;
      }

      return true;
    });

    view.dispatch(view.state.tr.insertText(" `two`", cellTextPosition + 3));

    expect(readMetricsRows(view.dom).at(-1)?.[0]).toBe("one `two`");
  });
});
