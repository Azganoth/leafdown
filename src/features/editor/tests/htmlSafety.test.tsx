import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { afterEach, describe, expect, it } from "vitest";

import { MilkdownEditor } from "@/features/editor";
import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { wrapCfHtmlFragment } from "@/test/fixtures/clipboardHtml";
import { setupClipboardMock } from "@/test/mocks/clipboard";
import { dispatchClick, dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { withWindowsUserAgent } from "@/test/utils/platform";
import { render, screen, waitFor, within } from "@/test/utils/react";
import {
  countTauriApiCalls,
  getLastTauriApiArgs,
  mockTauriApi,
  mockTauriApiCommand,
} from "@/test/utils/tauriApi";

import { runEditorCommand } from "../commands";

const executionFlag = "__leafdownHtmlExecuted";
const { clipboard, createClipboardItem } = setupClipboardMock();

const mountStyledEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const mountReferenceEditor = setupMilkdownEditorMount({
  ...createMarkdownReferenceContext(),
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const getExecutionFlag = (): unknown =>
  (window as unknown as Record<string, unknown>)[executionFlag];

const resetExecutionFlag = () => {
  (window as unknown as Record<string, unknown>)[executionFlag] = false;
};

const PASTE_ENTRY_PATHS = ["native", "command"] as const;
const PASTE_TRANSPORTS = ["bare", "cfHtml", "cfHtmlProseMirrorSlice"] as const;

type PasteEntryPath = (typeof PASTE_ENTRY_PATHS)[number];
type PasteTransport = (typeof PASTE_TRANSPORTS)[number];

const applyPasteTransport = (fragment: string, transport: PasteTransport) => {
  switch (transport) {
    case "bare":
      return fragment;

    case "cfHtml":
      return wrapCfHtmlFragment(fragment);

    case "cfHtmlProseMirrorSlice":
      return wrapCfHtmlFragment(`<p data-pm-slice="1 1 []">${fragment}</p>`);
  }
};

const pasteHtml = async (
  mounted: MountedMilkdownEditor,
  entryPath: PasteEntryPath,
  html: string,
  text = "pasted",
) => {
  if (entryPath === "native") {
    dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: html,
      [TEXT_PLAIN_MIME_TYPE]: text,
    });
    return;
  }

  clipboard.read.mockResolvedValue([createClipboardItem(TEXT_HTML_MIME_TYPE, html)]);
  clipboard.readText.mockResolvedValue(text);

  await runEditorCommand(mounted.editor, "edit.paste");
};

const getLiveHtmlHazards = (dom: HTMLElement) => ({
  executableElements: Array.from(dom.querySelectorAll("script, iframe, object, embed")).map(
    (element) => element.nodeName.toLowerCase(),
  ),
  eventHandlerAttributes: Array.from(dom.querySelectorAll("*")).flatMap((element) =>
    Array.from(element.attributes)
      .map((attribute) => attribute.name)
      .filter((name) => name.startsWith("on")),
  ),
});

const NO_LIVE_HTML_HAZARDS = { executableElements: [], eventHandlerAttributes: [] };

const HOSTILE_HTML_FRAGMENTS = [
  {
    name: "script elements",
    fragment: `<p>before<script>window.${executionFlag}=true</script>after</p>`,
    survivingText: "before",
  },
  {
    name: "inline event handlers",
    fragment: `<p><span onmouseover="window.${executionFlag}=true">hover</span></p>`,
    survivingText: "hover",
  },
  {
    name: "image error handlers",
    fragment: `<p>lead<img src="x" onerror="window.${executionFlag}=true"></p>`,
    survivingText: "lead",
  },
  {
    name: "iframes",
    fragment: `<p>lead<iframe src="javascript:window.${executionFlag}=true"></iframe></p>`,
    survivingText: "lead",
  },
  {
    name: "objects",
    fragment: `<p>lead<object data="javascript:window.${executionFlag}=true"></object></p>`,
    survivingText: "lead",
  },
] as const;

const HOSTILE_PASTE_CASES = HOSTILE_HTML_FRAGMENTS.flatMap(({ name, fragment, survivingText }) =>
  PASTE_ENTRY_PATHS.flatMap((entryPath) =>
    PASTE_TRANSPORTS.map(
      (transport) =>
        [name, entryPath, transport, fragment, survivingText] as [
          string,
          PasteEntryPath,
          PasteTransport,
          string,
          string,
        ],
    ),
  ),
);

describe("HTML safety", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[executionFlag];
  });

  it("renders block and inline HTML as text-only Milkdown HTML atoms", async () => {
    resetExecutionFlag();

    const markdown = `<div onclick="window.${executionFlag} = true">Block</div>

Inline <span onmouseover="window.${executionFlag} = true">HTML</span> text.`;
    const mounted = await mountStyledEditor(markdown);
    const { dom } = mounted.view;
    const htmlNodes = Array.from(dom.querySelectorAll<HTMLElement>('[data-type="html"]'));

    expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
    expect(htmlNodes.length).toBeGreaterThanOrEqual(3);
    expect(htmlNodes.map((node) => node.dataset.value)).toEqual(
      expect.arrayContaining([
        `<div onclick="window.${executionFlag} = true">Block</div>`,
        `<span onmouseover="window.${executionFlag} = true">`,
        "</span>",
      ]),
    );
    expect(dom).toHaveTextContent(`<div onclick="window.${executionFlag} = true">`);
    expect(dom).toHaveTextContent(`<span onmouseover="window.${executionFlag} = true">`);
    expect(dom.querySelector("div[onclick]")).not.toBeInTheDocument();
    expect(dom.querySelector("span[onmouseover]")).not.toBeInTheDocument();
    expect(getExecutionFlag()).toBe(false);
  });

  it("does not create live script or event-handler DOM from raw HTML", async () => {
    resetExecutionFlag();

    const markdown = `<script>window.${executionFlag} = true</script>

<img src=x onerror="window.${executionFlag} = true">`;
    const mounted = await mountStyledEditor(markdown);
    const { dom } = mounted.view;

    expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
    expect(dom).toHaveTextContent(`<script>window.${executionFlag} = true</script>`);
    expect(dom).toHaveTextContent(`<img src=x onerror="window.${executionFlag} = true">`);
    expect(dom.querySelector("script")).not.toBeInTheDocument();
    expect(dom.querySelector(`img[src="x"]`)).not.toBeInTheDocument();
    expect(dom.querySelector("[onerror]")).not.toBeInTheDocument();
    expect(getExecutionFlag()).toBe(false);
  });

  it("keeps malformed HTML-like text out of live HTML", async () => {
    const mounted = await mountStyledEditor("<custom broken");

    expect(mounted.getMarkdown()).toBe("<custom broken\n");
    expect(mounted.view.dom).toHaveTextContent("<custom broken");
    expect(mounted.view.dom.querySelector('[data-type="html"]')).not.toBeInTheDocument();
    expect(mounted.view.dom.querySelector("custom")).not.toBeInTheDocument();
  });

  it("does not execute script content when the React wrapper remounts a document", async () => {
    resetExecutionFlag();

    const { rerender } = render(
      <MilkdownEditor key="safe-document" initialMarkdown="Safe document" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("milkdown-editor-host")).toHaveTextContent("Safe document");
    });

    rerender(
      <MilkdownEditor
        key="script-document"
        initialMarkdown={`<script>window.${executionFlag} = true</script>`}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("milkdown-editor-host")).toHaveTextContent(
        `<script>window.${executionFlag} = true</script>`,
      );
    });

    const editorHost = screen.getByTestId("milkdown-editor-host");

    expect(editorHost).toHaveClass(EDITOR_TEST_ROOT_CLASS_NAME);
    expect(editorHost.querySelector("script")).not.toBeInTheDocument();
    expect(getExecutionFlag()).toBe(false);
  });
});

describe("pasted HTML safety", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[executionFlag];
  });

  it.each(HOSTILE_PASTE_CASES)(
    "keeps pasted %s inert through %s Paste carrying a %s payload",
    async (_name, entryPath, transport, fragment, survivingText) => {
      resetExecutionFlag();
      mockTauriApi({
        resolveMarkdownImageTarget: () => ({ kind: "remoteBlocked" }),
        resolveMarkdownLinkTarget: () => ({ kind: "unsupportedTarget" }),
      });

      const mounted = await mountReferenceEditor("");

      await pasteHtml(mounted, entryPath, applyPasteTransport(fragment, transport));

      expect(mounted.view.dom).toHaveTextContent(survivingText);
      expect(getLiveHtmlHazards(mounted.view.dom)).toEqual(NO_LIVE_HTML_HAZARDS);
      expect(getExecutionFlag()).toBe(false);
    },
  );

  it.each(PASTE_ENTRY_PATHS)(
    "resolves a pasted remote image instead of loading it through %s Paste",
    async (entryPath) => {
      mockTauriApiCommand("resolveMarkdownImageTarget", () => ({ kind: "remoteBlocked" }));

      const mounted = await mountReferenceEditor("");

      await pasteHtml(
        mounted,
        entryPath,
        '<p><img src="https://example.com/tracker.png" alt="Tracker"></p>',
      );

      await waitFor(() => {
        expect(mounted.view.dom).toHaveTextContent("Remote images are blocked.");
      });
      expect(getLastTauriApiArgs("resolveMarkdownImageTarget")).toMatchObject({
        target: "https://example.com/tracker.png",
      });
      expect(mounted.view.dom.querySelector(".leafdown-markdown-image")).not.toBeInTheDocument();
      expect(convertFileSrc).not.toHaveBeenCalled();
    },
  );

  it.each(PASTE_ENTRY_PATHS)(
    "keeps a pasted javascript: link as Markdown data rather than live DOM through %s Paste",
    async (entryPath) => {
      resetExecutionFlag();
      mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({ kind: "unsupportedTarget" }));

      const target = `javascript:window.${executionFlag}=true`;
      const mounted = await mountReferenceEditor("");

      await pasteHtml(mounted, entryPath, `<p><a href="${target}">Trap</a></p>`);

      expect(mounted.getMarkdown()).toContain(target);
      expect(getLiveHtmlHazards(mounted.view.dom)).toEqual(NO_LIVE_HTML_HAZARDS);
      expect(countTauriApiCalls("resolveMarkdownLinkTarget")).toBe(0);
      expect(openUrl).not.toHaveBeenCalled();
      expect(getExecutionFlag()).toBe(false);
    },
  );

  it.each(PASTE_ENTRY_PATHS)(
    "routes activation of a pasted link through target resolution on %s Paste",
    async (entryPath) => {
      await withWindowsUserAgent(async () => {
        mockTauriApiCommand("resolveMarkdownLinkTarget", () => ({ kind: "unsupportedTarget" }));

        const target = "https://evil.example.com/steal";
        const mounted = await mountReferenceEditor("");

        await pasteHtml(mounted, entryPath, `<p><a href="${target}">Trap</a></p><p>after</p>`);

        const link = within(mounted.view.dom).getByRole("link", { name: "Trap" });
        const event = dispatchClick(link, { ctrl: true });

        await waitFor(() => {
          expect(countTauriApiCalls("resolveMarkdownLinkTarget")).toBe(1);
        });
        expect(event.defaultPrevented).toBe(true);
        expect(getLastTauriApiArgs("resolveMarkdownLinkTarget")).toMatchObject({ target });
        expect(openUrl).not.toHaveBeenCalled();
      });
    },
  );
});
