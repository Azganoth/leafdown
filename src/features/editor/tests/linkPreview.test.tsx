// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import type { ContextPopupAnchor, LinkPreviewRequest } from "@/features/editor";
import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchKeyDown, dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountMilkdownEditorOptions } from "@/test/utils/milkdown";
import { withWindowsUserAgent } from "@/test/utils/platform";
import {
  getEditorNodePosition,
  getEditorTextPosition,
  setTextSelection,
} from "@/test/utils/prosemirror";
import { render, screen, waitFor } from "@/test/utils/react";
import { countTauriApiCalls, mockTauriApi } from "@/test/utils/tauriApi";

import { EditorLinkPreview } from "../components/editor-link-preview";
import { LINK_PREVIEW_CHARACTER_LIMIT } from "../utils/linkPreview";
import { WIKI_LINK_NODE_NAME } from "../utils/wikiLinkMarkdown";

const POINTER_DELAY_MS = 5;
const DOCUMENT_PATH = "C:/Notes/current.md";
const TARGET_PATH = "C:/Notes/setup.md";
const TARGET_MARKDOWN = [
  "---",
  "title: Setup",
  "---",
  "",
  "# Setup",
  "",
  "Read this first.",
  "",
  "## Installing",
  "",
  "Download the *installer* and run it.",
  "",
  "## Next steps",
  "",
  "Open a folder.",
].join("\n");

const mountEditor = setupMilkdownEditorMount({
  documentPath: DOCUMENT_PATH,
  folderContextPath: "C:/Notes",
  linkPreviewDelayMs: POINTER_DELAY_MS,
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const mockResolvedTarget = () =>
  mockTauriApi({
    resolveMarkdownLinkTarget: () => ({ kind: "localMarkdown", path: TARGET_PATH }),
    resolveWikiLinkTarget: () => ({ kind: "localMarkdown", path: TARGET_PATH }),
  });

const setupPreview = async (markdown: string, options: MountMilkdownEditorOptions = {}) => {
  const onLinkPreviewClosed = vi.fn();
  const onLinkPreviewRequested = vi.fn<(request: LinkPreviewRequest) => void>();
  const onOpenMarkdownPath = vi.fn(() => true);
  const onReadMarkdownPath = vi.fn(async () => TARGET_MARKDOWN);
  const onContentChanged = vi.fn();
  const mounted = await mountEditor(markdown, {
    onContentChanged,
    onLinkPreviewClosed,
    onLinkPreviewRequested,
    onOpenMarkdownPath,
    onReadMarkdownPath,
    ...options,
  });

  return {
    mounted,
    onContentChanged,
    onLinkPreviewClosed,
    onLinkPreviewRequested,
    onOpenMarkdownPath,
    onReadMarkdownPath,
  };
};

const lastRequest = (onRequest: ReturnType<typeof vi.fn>) =>
  onRequest.mock.lastCall?.[0] as LinkPreviewRequest;

const getLinkElement = (dom: Element) => {
  const link = dom.querySelector('a[href], [data-type="wiki-link"]');

  expect(link).not.toBeNull();

  return link!;
};

const hoverLink = async (
  dom: Element,
  onRequest: ReturnType<typeof vi.fn<(request: LinkPreviewRequest) => void>>,
) => {
  const link = getLinkElement(dom);

  dispatchMouseEvent(link, "mouseover");
  await waitFor(() => expect(onRequest).toHaveBeenCalledTimes(1));

  return link;
};

const outlastPointerDelay = () =>
  new Promise((resolve) => {
    setTimeout(resolve, POINTER_DELAY_MS * 4);
  });

const pressPreviewKey = (dom: HTMLElement) =>
  withWindowsUserAgent(() => dispatchKeyDown(dom, "p", { alt: true, ctrl: true }));

describe("linked document preview", () => {
  it("previews a Markdown link's document after the pointer rests on it", async () => {
    mockResolvedTarget();
    const { mounted, onLinkPreviewRequested, onReadMarkdownPath } =
      await setupPreview("See [setup](setup.md).");
    const link = getLinkElement(mounted.view.dom);

    dispatchMouseEvent(link, "mouseover");

    expect(onLinkPreviewRequested).not.toHaveBeenCalled();

    await waitFor(() => expect(onLinkPreviewRequested).toHaveBeenCalledTimes(1));

    expect(onReadMarkdownPath).toHaveBeenCalledWith(TARGET_PATH);
    expect(lastRequest(onLinkPreviewRequested)).toMatchObject({
      anchor: link,
      content: {
        kind: "excerpt",
        text: "Setup Read this first. Installing Download the installer and run it. Next steps Open a folder.",
      },
      documentName: "setup.md",
      heading: null,
      source: "pointer",
    });
  });

  it("previews from the heading a Markdown fragment reaches by its anchor", async () => {
    mockResolvedTarget();
    const { mounted, onLinkPreviewRequested } = await setupPreview(
      "See [install](setup.md#installing).",
    );

    await hoverLink(mounted.view.dom, onLinkPreviewRequested);

    expect(lastRequest(onLinkPreviewRequested)).toMatchObject({
      content: {
        kind: "excerpt",
        text: "Download the installer and run it. Next steps Open a folder.",
      },
      documentName: "setup.md",
      heading: "Installing",
    });
  });

  it("previews a wiki link's heading from the keyboard while the caret reads the link", async () => {
    mockResolvedTarget();
    const { mounted, onLinkPreviewRequested } = await setupPreview("See [[setup#Next steps]].");

    setTextSelection(mounted.view, getEditorNodePosition(mounted, WIKI_LINK_NODE_NAME));
    await pressPreviewKey(mounted.view.dom);

    await waitFor(() => expect(onLinkPreviewRequested).toHaveBeenCalledTimes(1));

    const request = lastRequest(onLinkPreviewRequested);

    expect(request).toMatchObject({
      content: { kind: "excerpt", text: "Open a folder." },
      documentName: "setup.md",
      heading: "Next steps",
      source: "keyboard",
    });
    expect(request.anchor).not.toBeInstanceOf(Element);
    expect((request.anchor as ContextPopupAnchor).contextElement).toBe(mounted.view.dom);
  });

  it("previews the Markdown link whose projected source holds the caret", async () => {
    mockResolvedTarget();
    const { mounted, onLinkPreviewRequested } = await setupPreview("See [setup](setup.md) now.");

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "setup") + 2);
    await pressPreviewKey(mounted.view.dom);

    await waitFor(() => expect(onLinkPreviewRequested).toHaveBeenCalledTimes(1));

    expect(lastRequest(onLinkPreviewRequested)).toMatchObject({
      documentName: "setup.md",
      source: "keyboard",
    });
  });

  it("previews a same-document heading from the document as it stands", async () => {
    const { mounted, onLinkPreviewRequested, onReadMarkdownPath } = await setupPreview(
      "# Intro\n\nUnsaved words.\n\n[back](#intro)",
    );

    await hoverLink(mounted.view.dom, onLinkPreviewRequested);

    expect(lastRequest(onLinkPreviewRequested)).toMatchObject({
      content: { kind: "excerpt", text: "Unsaved words. back" },
      documentName: null,
      heading: "Intro",
    });
    expect(onReadMarkdownPath).not.toHaveBeenCalled();
    expect(countTauriApiCalls("resolveMarkdownLinkTarget")).toBe(0);
  });

  it("previews an explicit missing state for a link that does not resolve", async () => {
    mockTauriApi({
      resolveMarkdownLinkTarget: () => ({ kind: "missing", path: "C:/Notes/gone.md" }),
    });
    const { mounted, onLinkPreviewRequested } = await setupPreview("See [gone](gone.md).");

    await hoverLink(mounted.view.dom, onLinkPreviewRequested);

    expect(lastRequest(onLinkPreviewRequested)).toMatchObject({
      content: { kind: "missingDocument" },
      documentName: "gone.md",
    });
  });

  it("previews a missing heading rather than the top of the document", async () => {
    mockResolvedTarget();
    const { mounted, onLinkPreviewRequested } = await setupPreview("See [[setup#Absent]].");

    await hoverLink(mounted.view.dom, onLinkPreviewRequested);

    expect(lastRequest(onLinkPreviewRequested)).toMatchObject({
      content: { kind: "missingHeading" },
      documentName: "setup.md",
      heading: "Absent",
    });
  });

  it("reports a document that cannot be read as unavailable", async () => {
    mockResolvedTarget();
    const { mounted, onLinkPreviewRequested } = await setupPreview("See [setup](setup.md).", {
      onReadMarkdownPath: async () => {
        throw new Error("too large");
      },
    });

    await hoverLink(mounted.view.dom, onLinkPreviewRequested);

    expect(lastRequest(onLinkPreviewRequested).content).toEqual({ kind: "unavailable" });
  });

  it.each([
    ["an external link", { kind: "externalWeb", url: "https://example.com" }],
    ["a file Leafdown cannot open", { kind: "localFile", path: "C:/Notes/data.csv" }],
  ] as const)("does not preview %s", async (_, resolution) => {
    mockTauriApi({ resolveMarkdownLinkTarget: () => resolution });
    const { mounted, onLinkPreviewRequested, onReadMarkdownPath } =
      await setupPreview("See [it](target).");

    dispatchMouseEvent(getLinkElement(mounted.view.dom), "mouseover");
    await waitFor(() => expect(countTauriApiCalls("resolveMarkdownLinkTarget")).toBe(1));
    await outlastPointerDelay();

    expect(onLinkPreviewRequested).not.toHaveBeenCalled();
    expect(onReadMarkdownPath).not.toHaveBeenCalled();
  });

  it("leaves a footnote reference in a link label to the footnote preview", async () => {
    mockResolvedTarget();
    const { mounted, onLinkPreviewRequested } = await setupPreview(
      "See [setup[^n]](setup.md).\n\n[^n]: Note.",
    );
    const reference = mounted.view.dom.querySelector('sup[data-type="footnote_reference"]');

    dispatchMouseEvent(reference!, "mouseover");
    await outlastPointerDelay();

    expect(onLinkPreviewRequested).not.toHaveBeenCalled();
  });

  it("cuts a long document short", async () => {
    mockResolvedTarget();
    const { mounted, onLinkPreviewRequested } = await setupPreview("See [setup](setup.md).", {
      onReadMarkdownPath: async () => "word ".repeat(200),
    });

    await hoverLink(mounted.view.dom, onLinkPreviewRequested);

    const { content } = lastRequest(onLinkPreviewRequested);
    const text = content.kind === "excerpt" ? content.text : "";

    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(LINK_PREVIEW_CHARACTER_LIMIT + 1);
  });

  it.each([
    ["the pointer leaves the link", (link: Element) => dispatchMouseEvent(link, "mouseout")],
    ["a click lands on the link", (link: Element) => dispatchMouseEvent(link, "mousedown")],
    ["Escape is pressed", (link: Element) => dispatchKeyDown(link, "Escape")],
  ])("dismisses the preview when %s", async (_, dismiss) => {
    mockResolvedTarget();
    const { mounted, onLinkPreviewClosed, onLinkPreviewRequested } =
      await setupPreview("See [setup](setup.md).");
    const link = await hoverLink(mounted.view.dom, onLinkPreviewRequested);

    dismiss(link);

    expect(onLinkPreviewClosed).toHaveBeenCalledTimes(1);
  });

  it("opens no tab and leaves the document, its dirty state, and its history alone", async () => {
    mockResolvedTarget();
    const markdown = "See [setup](setup.md) and [[setup#Installing]].";
    const { mounted, onContentChanged, onLinkPreviewRequested, onOpenMarkdownPath } =
      await setupPreview(markdown);

    await hoverLink(mounted.view.dom, onLinkPreviewRequested);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, WIKI_LINK_NODE_NAME));
    await pressPreviewKey(mounted.view.dom);
    await waitFor(() => expect(onLinkPreviewRequested).toHaveBeenCalledTimes(2));

    expect(onOpenMarkdownPath).not.toHaveBeenCalled();
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
  });
});

describe("linked document preview surface", () => {
  const request = (overrides: Partial<LinkPreviewRequest> = {}): LinkPreviewRequest => ({
    anchor: document.createElement("a"),
    content: { kind: "excerpt", text: "Download the installer and run it." },
    documentName: "setup.md",
    heading: "Installing",
    source: "pointer",
    ...overrides,
  });

  it("renders nothing until a preview is requested", () => {
    render(<EditorLinkPreview request={null} />);

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("names the document and heading above a non-interactive excerpt", async () => {
    render(<EditorLinkPreview request={request()} />);

    const tooltip = await screen.findByRole("tooltip");

    expect(tooltip).toHaveTextContent("setup.md › Installing");
    expect(tooltip).toHaveTextContent("Download the installer and run it.");
    expect(tooltip.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(0);
  });

  it("names only the heading for a link within the same document", async () => {
    render(<EditorLinkPreview request={request({ documentName: null })} />);

    const tooltip = await screen.findByRole("tooltip");

    expect(tooltip).toHaveTextContent("Installing");
    expect(tooltip).not.toHaveTextContent("›");
  });

  it.each([
    [{ kind: "missingDocument" }, "No document at this link."],
    [{ kind: "missingHeading" }, "No heading by this name in the document."],
    [{ kind: "unavailable" }, "This document can't be previewed."],
    [{ kind: "unsavedDocument" }, "Save the document to resolve this link."],
    [{ kind: "excerpt", text: "" }, "Nothing follows this heading."],
  ] as const)("presents the %o state explicitly", async (content, message) => {
    render(<EditorLinkPreview request={request({ content })} />);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(message);
  });

  it("presents an empty document as empty", async () => {
    render(
      <EditorLinkPreview
        request={request({ content: { kind: "excerpt", text: "" }, heading: null })}
      />,
    );

    expect(await screen.findByRole("tooltip")).toHaveTextContent("This document is empty.");
  });
});
