// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createClipboardData,
  dispatchClipboardEvent,
  dispatchMouseDown,
} from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  runKeyDownHandlers,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import { applyCodeBlockLanguage } from "../commands/formatting/codeBlockLanguage";
import {
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "../plugins/blockSelection";
import type { CodeBlockLanguageRequest } from "../plugins/codeBlockLanguage";
import { renderMermaid } from "../services/mermaidRenderer";

vi.mock("../services/mermaidRenderer", () => ({
  renderMermaid: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg"/>'),
}));

const mountEditor = setupMilkdownEditorMount();
const block = (fence: string, source = "flowchart LR\n  A --> B") =>
  `Intro\n\n${fence}\n${source}\n${fence.startsWith("~") ? "~~~" : "```"}\n\nOutro\n`;
const codeRange = (mounted: Awaited<ReturnType<typeof mountEditor>>) => {
  let range = { start: 0, end: 0 };
  mounted.view.state.doc.forEach((node, offset) => {
    if (node.type.name === "code_block")
      range = { start: offset + 1, end: offset + node.nodeSize - 1 };
  });
  return range;
};
const mermaidPre = () => document.querySelector<HTMLPreElement>("pre[data-mermaid-mode]")!;

beforeEach(() => {
  vi.mocked(renderMermaid).mockClear();
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:diagram"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("Mermaid code blocks", () => {
  it.each(["```mermaid", "~~~MERMAID title=diagram", "```Mermaid\tother"])(
    "recognizes %s without changing the authored fence or info string",
    async (fence) => {
      const markdown = block(fence);
      const mounted = await mountEditor(markdown);
      const pre = mermaidPre();

      expect(pre).toHaveAttribute("data-mermaid-mode", "diagram");
      expect(pre.querySelector("code")).toHaveTextContent("flowchart LR");
      expect(pre.querySelector("img")).toHaveAccessibleName("Mermaid diagram");
      expect(pre.querySelector(".sr-only")).toHaveTextContent("A --> B");
      expect(mounted.getMarkdown()).toBe(markdown);
    },
  );

  it("retains authored line endings inside code while normalizing document separators", async () => {
    const markdown =
      "  ~~~~Mermaid  title=flow\r\n  %% source comment\r\n  flowchart LR\r\n    A --> B\r\n  ~~~~\r\n";
    const mounted = await mountEditor(markdown);
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode");
    expect(mounted.getMarkdown()).toBe(
      "  ~~~~Mermaid  title=flow\n  %% source comment\r\n  flowchart LR\r\n    A --> B\n  ~~~~\n",
    );
  });

  it("recognizes a pasted Markdown fence through the ordinary clipboard path", async () => {
    const markdown = block("```Mermaid title=flow");
    const mounted = await mountEditor("");
    const { event } = dispatchClipboardEvent(mounted.view.dom, "paste", {
      "text/plain": markdown,
    });
    expect(event.defaultPrevented).toBe(true);
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it.each(["```mermaidish", "```mmd", "    flowchart LR"])(
    "leaves %s as ordinary code",
    async (fence) => {
      const mounted = await mountEditor(block(fence));
      expect(mounted.view.dom.querySelector("pre[data-mermaid-mode]")).toBeNull();
      expect(renderMermaid).not.toHaveBeenCalled();
    },
  );

  it("shows source while the caret is in the code and the diagram once it leaves", async () => {
    const mounted = await mountEditor(block("~~~mermaid title=demo"));
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "A --> B"));
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "source");
    expect(mermaidPre()).toHaveClass("leafdown-mermaid-editing");

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Outro"));
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
    expect(mermaidPre()).not.toHaveClass("leafdown-mermaid-editing");
  });

  it("shows source when either end of a selection lies in the code", async () => {
    const mounted = await mountEditor(block("```mermaid"));
    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "Intro"),
      getEditorTextPosition(mounted, "A --> B"),
    );
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "source");
    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "Outro") + 2,
      getEditorTextPosition(mounted, "A --> B"),
    );
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "source");
  });

  it("round trips source edits through Undo and Redo", async () => {
    const markdown = block("~~~mermaid title=demo");
    const mounted = await mountEditor(markdown);
    const codePosition = getEditorTextPosition(mounted, "A --> B");
    setTextSelection(mounted.view, codePosition);
    mounted.view.dispatch(mounted.view.state.tr.insertText("C", codePosition, codePosition + 1));
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Outro"));
    expect(mounted.getMarkdown()).toBe(markdown.replace("A --> B", "C --> B"));

    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(markdown);
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(markdown.replace("A --> B", "C --> B"));
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Outro"));
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
  });

  it("shows the diagram of a selected block and moves it through the block command", async () => {
    const mounted = await mountEditor(block("~~~mermaid title=demo"));
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "A --> B"));
    const target = getSelectableBlockTargets(mounted.view.state.doc).find(
      ({ node }) => node.type.name === "code_block",
    )!;
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, target.pos, target.pos),
      ),
    );
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
    expect(await runEditorCommand(mounted.editor, "edit.moveBlockDown")).toBe(true);
    expect(mounted.getMarkdown()).toBe(
      "Intro\n\nOutro\n\n~~~mermaid title=demo\nflowchart LR\n  A --> B\n~~~\n",
    );
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
  });

  it("puts the caret at the start of the code when the diagram is pressed", async () => {
    const mounted = await mountEditor(block("```mermaid"));
    const { start } = codeRange(mounted);
    const event = dispatchMouseDown(mermaidPre().querySelector("img")!, { button: 0 });
    expect(event.defaultPrevented).toBe(true);
    expect(mounted.view.state.selection.head).toBe(start);
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "source");

    const caret = getEditorTextPosition(mounted, "A --> B");
    setTextSelection(mounted.view, caret);
    dispatchMouseDown(mermaidPre().querySelector("img")!, { button: 0 });
    expect(mounted.view.state.selection.head).toBe(caret);
  });

  it("keeps a scrollbar press from opening the diagram source", async () => {
    const mounted = await mountEditor(block("```mermaid"));
    const panel = mermaidPre().querySelector<HTMLElement>(".leafdown-code-mermaid-panel")!;
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    const selection = mounted.view.state.selection.head;

    panel.dispatchEvent(press);

    expect(press.defaultPrevented).toBe(false);
    expect(mounted.view.state.selection.head).toBe(selection);
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
  });

  it.each([
    ["ArrowDown", "Intro", "start"],
    ["ArrowRight", "Intro", "start"],
    ["ArrowUp", "Outro", "end"],
    ["ArrowLeft", "Outro", "end"],
  ] as const)("enters the hidden code with %s from %s", async (key, from, edge) => {
    const mounted = await mountEditor(block("```mermaid"));
    const range = codeRange(mounted);
    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, from) + (from === "Intro" ? "Intro".length : 0),
    );
    vi.spyOn(mounted.view, "endOfTextblock").mockReturnValue(true);

    expect(runKeyDownHandlers(mounted.view, key).handled).toBe(true);
    expect(mounted.view.state.selection.head).toBe(range[edge]);
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "source");
  });

  it("leaves arrows to the browser away from the edge of a block or with Shift", async () => {
    const mounted = await mountEditor(block("```mermaid"));
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Intro") + "Intro".length);
    const endOfTextblock = vi.spyOn(mounted.view, "endOfTextblock").mockReturnValue(false);
    expect(runKeyDownHandlers(mounted.view, "ArrowDown").handled).toBe(false);
    endOfTextblock.mockReturnValue(true);
    expect(runKeyDownHandlers(mounted.view, "ArrowDown", { shiftKey: true }).handled).toBe(false);
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
  });

  it("rerenders after typing pauses and keeps the last diagram meanwhile", async () => {
    const mounted = await mountEditor(block("```mermaid"));
    await vi.waitFor(() => expect(mermaidPre().querySelector("img")).toBeVisible());
    const codePosition = getEditorTextPosition(mounted, "A --> B");
    setTextSelection(mounted.view, codePosition);
    mounted.view.dispatch(mounted.view.state.tr.insertText("C", codePosition, codePosition + 1));

    expect(renderMermaid).toHaveBeenCalledTimes(1);
    expect(mermaidPre().querySelector("img")).toBeVisible();
    await vi.waitFor(() => expect(renderMermaid).toHaveBeenCalledTimes(2));
    expect(vi.mocked(renderMermaid).mock.lastCall?.[0]).toBe("flowchart LR\n  C --> B");
  });

  it("renders with the app theme and again when the theme changes", async () => {
    await mountEditor(block("```mermaid"));
    await vi.waitFor(() => expect(mermaidPre().querySelector("img")).toBeVisible());
    expect(vi.mocked(renderMermaid).mock.lastCall?.[1]).toMatchObject({ dark: false });

    let finishDarkRender: (svg: string) => void = () => {};
    vi.mocked(renderMermaid).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDarkRender = resolve;
        }),
    );
    document.documentElement.classList.add("dark");
    await vi.waitFor(() => expect(renderMermaid).toHaveBeenCalledTimes(2));
    expect(vi.mocked(renderMermaid).mock.lastCall?.[1]).toMatchObject({ dark: true });
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
    expect(mermaidPre().querySelector("img")).toBeVisible();
    expect(mermaidPre().querySelector(".leafdown-code-mermaid-status")).not.toBeVisible();
    finishDarkRender('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });

  it("renders at once when the caret leaves edited code", async () => {
    const mounted = await mountEditor(block("```mermaid"));
    const codePosition = getEditorTextPosition(mounted, "A --> B");
    setTextSelection(mounted.view, codePosition);
    mounted.view.dispatch(mounted.view.state.tr.insertText("C", codePosition, codePosition + 1));
    expect(renderMermaid).toHaveBeenCalledTimes(1);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Outro"));
    expect(renderMermaid).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["directive", "%%{init: { 'theme': 'dark' }}%%\nflowchart LR\n A --> B"],
    ["frontmatter", "---\nconfig:\n  theme: dark\n---\nflowchart LR\n A --> B"],
    ["over limit", "flowchart LR\n" + "x".repeat(10_000)],
  ])("keeps %s editable without invoking Mermaid", async (_name, source) => {
    const mounted = await mountEditor(block("```mermaid", source));
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "source");
    expect(mermaidPre().querySelector("[role=alert]")).not.toHaveTextContent("");
    expect(renderMermaid).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toContain(source);
  });

  it("recognizes a code block after its language changes", async () => {
    let request: CodeBlockLanguageRequest | undefined;
    const mounted = await mountEditor(block("```text"), {
      onCodeBlockLanguageRequested: (value) => {
        request = value;
      },
    });
    mounted.view.dom.querySelector<HTMLButtonElement>("[data-leafdown-code-language]")!.click();
    applyCodeBlockLanguage(mounted.view, request!, "mermaid");
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
  });

  it("keeps the diagram and controls out of copied HTML", async () => {
    const mounted = await mountEditor(block("```mermaid"));
    setTextSelection(mounted.view, 1, mounted.view.state.doc.content.size - 1);
    const copied = mounted.view.serializeForClipboard(mounted.view.state.selection.content());

    expect(copied.dom.querySelector("img, .leafdown-code-mermaid-panel")).toBeNull();
    expect(copied.dom.querySelector("pre")?.textContent).toBe("flowchart LR\n  A --> B");
    const clipboardData = createClipboardData();
    dispatchClipboardEvent(mounted.view.dom, "copy", clipboardData);
    expect(clipboardData.getData("text/plain")).toContain(
      "```mermaid\nflowchart LR\n  A --> B\n```",
    );
  });

  it("shows a render failure as editable source and retries once the source changes", async () => {
    vi.mocked(renderMermaid).mockRejectedValueOnce(new Error("Invalid diagram"));
    const mounted = await mountEditor(block("```mermaid"));
    await vi.waitFor(() => {
      expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "source");
    });
    expect(mermaidPre().querySelector("[role=alert]")).toHaveTextContent("Invalid diagram");
    expect(mermaidPre().querySelector("code")).toHaveTextContent("A --> B");

    const codePosition = getEditorTextPosition(mounted, "A --> B");
    mounted.view.dispatch(mounted.view.state.tr.insertText("C", codePosition, codePosition + 1));
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "diagram");
    expect(renderMermaid).toHaveBeenCalledTimes(2);
  });

  it("keeps the last diagram beside a failure while editing", async () => {
    const mounted = await mountEditor(block("```mermaid"));
    await vi.waitFor(() => expect(mermaidPre().querySelector("img")).toBeVisible());
    vi.mocked(renderMermaid).mockRejectedValueOnce(new Error("Parse error"));
    const codePosition = getEditorTextPosition(mounted, "A --> B");
    setTextSelection(mounted.view, codePosition);
    mounted.view.dispatch(mounted.view.state.tr.insertText("-", codePosition, codePosition + 1));

    await vi.waitFor(() =>
      expect(mermaidPre().querySelector("[role=alert]")).toHaveTextContent("Parse error"),
    );
    expect(mermaidPre().querySelector("img")).toBeVisible();
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Outro"));
    expect(mermaidPre()).toHaveAttribute("data-mermaid-mode", "source");
    expect(mermaidPre().querySelector("img")).not.toBeVisible();
  });
});
