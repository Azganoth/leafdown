// @vitest-environment happy-dom

import { DOMParser as ProseMirrorDOMParser } from "@milkdown/kit/prose/model";
import { convertFileSrc } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { dispatchMouseDown } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorNodePosition, setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";
import { setupUser, waitFor, within } from "@/test/utils/react";
import {
  countTauriApiCalls,
  getLastTauriApiArgs,
  mockTauriApiCommand,
} from "@/test/utils/tauriApi";

import { IMAGE_DESTINATION_MARKER_ATTRIBUTE_NAME } from "../utils/characterReferenceMarkdown";
import { TITLE_MARKER_ATTRIBUTE_NAME } from "../utils/markdownTitle";

const mountImageEditor = setupMilkdownEditorMount({
  ...createMarkdownReferenceContext(),
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

describe("Markdown images", () => {
  it("renders supported local images through backend resolution and Tauri asset URLs", async () => {
    mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
      kind: "renderable",
      path: "C:\\Notes\\assets\\icon special.png",
    }));

    const mounted = await mountImageEditor("![Sample Icon](./assets/icon.png)");

    await waitFor(() => {
      expect(
        within(mounted.view.dom).getByRole("img", { name: "Sample Icon" }),
      ).toBeInTheDocument();
    });

    const image = within(mounted.view.dom).getByRole<HTMLImageElement>("img", {
      name: "Sample Icon",
    });

    expect(image.getAttribute("src")).toBe(
      "asset://localhost/C%3A%2FNotes%2Fassets%2Ficon%20special.png",
    );
    expect(convertFileSrc).toHaveBeenCalledWith("C:/Notes/assets/icon special.png");
    expect(getLastTauriApiArgs("resolveMarkdownImageTarget")).toEqual({
      ...createMarkdownReferenceContext(),
      allowOutsideFolder: false,
      target: "./assets/icon.png",
    });
    expect(mounted.getMarkdown()).toBe("![Sample Icon](./assets/icon.png)\n");
  });

  it("blocks remote image loading while preserving source Markdown", async () => {
    mockTauriApiCommand("resolveMarkdownImageTarget", () => ({ kind: "remoteBlocked" }));

    const mounted = await mountImageEditor("![Remote](https://example.com/image.png)");

    await waitFor(() => {
      expect(mounted.view.dom).toHaveTextContent("Remote images are blocked.");
    });

    expect(mounted.view.dom.querySelector(".leafdown-markdown-image")).not.toBeInTheDocument();
    expect(convertFileSrc).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe("![Remote](https://example.com/image.png)\n");
  });

  it.each([
    {
      backendResult: { kind: "missing", path: "C:/Notes/assets/missing.png" },
      expectedMessage: "Image not found: ./assets/missing.png",
      markdown: "![Missing](./assets/missing.png)",
    },
    {
      backendResult: { kind: "untitledRelative" },
      expectedMessage: "Save the document to resolve this image.",
      markdown: "![Untitled](./assets/icon.png)",
    },
    {
      backendResult: { kind: "unsupportedFormat" },
      expectedMessage: "Unsupported image format.",
      markdown: "![Unsupported](./assets/readme.txt)",
    },
    {
      backendResult: { kind: "unsupportedTarget" },
      expectedMessage: "Unsupported image target.",
      markdown: "![Unsafe](custom:target.png)",
    },
    {
      backendResult: {
        kind: "permissionDenied",
        path: "C:/Notes/assets/private.png",
        message: "No image permission.",
      },
      expectedMessage: "No image permission.",
      markdown: "![Denied](./assets/private.png)",
    },
    {
      backendResult: {
        kind: "metadataFailed",
        path: "C:/Notes/assets/image.png",
        message: "Could not inspect image.",
      },
      expectedMessage: "Could not inspect image.",
      markdown: "![Metadata](./assets/image.png)",
    },
  ] as const)(
    "renders a safe placeholder for $backendResult.kind images without mutating Markdown",
    async ({ backendResult, expectedMessage, markdown }) => {
      mockTauriApiCommand("resolveMarkdownImageTarget", () => backendResult);

      const mounted = await mountImageEditor(markdown);

      await waitFor(() => {
        expect(mounted.view.dom).toHaveTextContent(expectedMessage);
      });

      expect(mounted.view.dom.querySelector(".leafdown-markdown-image")).not.toBeInTheDocument();
      expect(convertFileSrc).not.toHaveBeenCalled();
      expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
    },
  );

  it("requires an inline explicit load before rendering outside-folder images", async () => {
    const user = setupUser();
    const resolveMarkdownImageTarget = vi
      .fn()
      .mockResolvedValueOnce({ kind: "outsideFolder", path: "C:\\Other\\outside.png" })
      .mockResolvedValue({ kind: "renderable", path: "C:\\Other\\outside.png" });
    mockTauriApiCommand("resolveMarkdownImageTarget", resolveMarkdownImageTarget);

    const mounted = await mountImageEditor("![Outside](../outside.png)");

    await waitFor(() => {
      expect(mounted.view.dom).toHaveTextContent(
        "Image is outside the current folder: C:\\Other\\outside.png",
      );
    });

    await user.click(within(mounted.view.dom).getByRole("button", { name: "Load image" }));

    await waitFor(() => {
      expect(within(mounted.view.dom).getByRole("img", { name: "Outside" })).toBeInTheDocument();
    });

    expect(getLastTauriApiArgs("resolveMarkdownImageTarget")).toEqual({
      ...createMarkdownReferenceContext(),
      allowOutsideFolder: true,
      target: "../outside.png",
    });
  });

  it("retries a failed resolution after a clean source-projection round trip", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const resolveMarkdownImageTarget = vi
      .fn()
      .mockRejectedValueOnce(new Error("Image resolver unavailable."))
      .mockResolvedValueOnce({ kind: "renderable", path: "C:\\Notes\\assets\\icon.png" });
    mockTauriApiCommand("resolveMarkdownImageTarget", resolveMarkdownImageTarget);

    const mounted = await mountImageEditor("![Retry](./assets/icon.png) tail");

    await waitFor(() => {
      expect(mounted.view.dom).toHaveTextContent("Image resolver unavailable.");
    });

    const placeholder = mounted.view.dom.querySelector(".leafdown-image-placeholder");

    if (!placeholder) {
      throw new Error("Expected image placeholder to be rendered.");
    }

    dispatchMouseDown(placeholder);
    setSelectionAtDocumentEnd(mounted.view);

    await waitFor(() => {
      expect(within(mounted.view.dom).getByRole("img", { name: "Retry" })).toBeInTheDocument();
    });

    expect(countTauriApiCalls("resolveMarkdownImageTarget")).toBe(2);
    consoleError.mockRestore();
  });

  it.each([
    {
      expectedTitle: "Leaf",
      source: "start ![inline](<../assets/leaf.svg> 'Leaf') end",
    },
    {
      expectedTitle: "",
      source: "start ![inline](<../assets/leaf.svg>) end",
    },
  ])(
    "keeps authored image attributes when rendered DOM is parsed back into the document",
    async ({ expectedTitle, source }) => {
      mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
        kind: "renderable",
        path: "C:/Notes/assets/leaf.svg",
      }));

      const mounted = await mountImageEditor(source);

      await waitFor(() => {
        expect(within(mounted.view.dom).getByRole("img", { name: "inline" })).toBeInTheDocument();
      });

      const rendered = within(mounted.view.dom).getByRole("img", { name: "inline" });
      const container = document.createElement("div");

      container.append(rendered.cloneNode(true));

      const parsed = ProseMirrorDOMParser.fromSchema(mounted.view.state.schema).parseSlice(
        container,
      );
      const image = parsed.content.firstChild;

      expect(image?.type.name).toBe("image");
      expect(image?.attrs.src).toBe("../assets/leaf.svg");
      expect(image?.attrs.title ?? "").toBe(expectedTitle);
      expect(image?.attrs[IMAGE_DESTINATION_MARKER_ATTRIBUTE_NAME]).toBe("<");
      expect(image?.attrs[TITLE_MARKER_ATTRIBUTE_NAME]).toBe(expectedTitle ? "'" : '"');

      const imagePosition = getEditorNodePosition(mounted, "image");

      mounted.view.dispatch(
        mounted.view.state.tr.replace(imagePosition, imagePosition + 1, parsed),
      );

      expect(mounted.getMarkdown()).toBe(`${source}\n`);
    },
  );

  it("ignores malformed rendered-image provenance when parsing DOM", async () => {
    const mounted = await mountImageEditor("text");
    const container = document.createElement("div");

    container.innerHTML =
      '<img src="./safe.png" alt="Safe" data-leafdown-image-attrs=\'{"src":{"unsafe":true}}\'>';

    const parsed = ProseMirrorDOMParser.fromSchema(mounted.view.state.schema).parseSlice(container);
    const image = parsed.content.firstChild;

    expect(image?.type.name).toBe("image");
    expect(image?.attrs.src).toBe("./safe.png");
    expect(image?.attrs.alt).toBe("Safe");
  });
});
