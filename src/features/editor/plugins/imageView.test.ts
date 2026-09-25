// @vitest-environment happy-dom

import { DOMParser as ProseMirrorDOMParser } from "@milkdown/kit/prose/model";
import { convertFileSrc } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { dispatchMouseDown } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getEditorNodePosition, setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";
import { setupUser, waitFor, within } from "@/test/utils/react";
import {
  countTauriApiCalls,
  getLastTauriApiArgs,
  mockTauriApi,
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

  it("blocks remote images the backend offers no load for", async () => {
    mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
      kind: "remoteBlocked",
      host: null,
    }));

    const mounted = await mountImageEditor("![Remote](http://example.com/image.png)");

    await waitFor(() => {
      expect(mounted.view.dom).toHaveTextContent("Remote images are blocked.");
    });

    expect(within(mounted.view.dom).queryByRole("button")).not.toBeInTheDocument();
    expect(mounted.view.dom.querySelector(".leafdown-markdown-image")).not.toBeInTheDocument();
    expect(convertFileSrc).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe("![Remote](http://example.com/image.png)\n");
  });

  describe("remote image loading", () => {
    const REMOTE_MARKDOWN = '![Remote](https://example.com/image.png "Remote title") tail';
    const OBJECT_URL = "blob:leafdown/remote-image";

    const mockRemoteImage = (
      fetchRemoteImage: (args: { target: string }) => ArrayBuffer | Promise<ArrayBuffer> = () =>
        new Uint8Array([0x89, 0x50]).buffer,
    ) => {
      mockTauriApi({
        fetchRemoteImage,
        resolveMarkdownImageTarget: ({ target }) => ({
          kind: "remoteBlocked",
          host: new URL(target).host,
        }),
      });

      return {
        createObjectURL: vi.spyOn(URL, "createObjectURL").mockReturnValue(OBJECT_URL),
        revokeObjectURL: vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined),
      };
    };

    const mountRemoteImage = async (markdown = REMOTE_MARKDOWN) => {
      const mounted = await mountImageEditor(markdown);

      await waitFor(() => {
        expect(
          within(mounted.view.dom).getByRole("button", { name: "Load image" }),
        ).toBeInTheDocument();
      });

      return mounted;
    };

    const setImageTarget = (mounted: MountedMilkdownEditor, src: string) => {
      const position = getEditorNodePosition(mounted, "image");
      const image = mounted.view.state.doc.nodeAt(position);

      mounted.view.dispatch(
        mounted.view.state.tr.setNodeMarkup(position, undefined, { ...image?.attrs, src }),
      );
    };

    const deferred = <T>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((settle) => {
        resolve = settle;
      });

      return { promise, resolve };
    };

    it("names the host and requests nothing until the load action", async () => {
      mockRemoteImage();

      const mounted = await mountRemoteImage();

      expect(mounted.view.dom).toHaveTextContent("Remote image from example.com.");

      setSelectionAtDocumentEnd(mounted.view);
      await mounted.destroy();
      await mountRemoteImage();

      expect(countTauriApiCalls("fetchRemoteImage")).toBe(0);
    });

    it("renders the fetched bytes through an object URL without changing the Markdown", async () => {
      const user = setupUser();
      const { createObjectURL } = mockRemoteImage();

      const mounted = await mountRemoteImage();

      await user.click(within(mounted.view.dom).getByRole("button", { name: "Load image" }));

      const image = await within(mounted.view.dom).findByRole<HTMLImageElement>("img", {
        name: "Remote",
      });

      expect(image.getAttribute("src")).toBe(OBJECT_URL);
      expect(image.title).toBe("Remote title");
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(getLastTauriApiArgs("fetchRemoteImage")).toEqual({
        target: "https://example.com/image.png",
      });
      expect(mounted.getMarkdown()).toBe(`${REMOTE_MARKDOWN}\n`);
    });

    it("shows a failure with a retry action that makes a new request", async () => {
      const user = setupUser();
      const fetchRemoteImage = vi
        .fn()
        .mockRejectedValueOnce({ kind: "httpStatus", status: 404 })
        .mockResolvedValue(new Uint8Array([0x89, 0x50]).buffer);
      mockRemoteImage(fetchRemoteImage);

      const mounted = await mountRemoteImage();

      await user.click(within(mounted.view.dom).getByRole("button", { name: "Load image" }));

      const retry = await within(mounted.view.dom).findByRole("button", { name: "Retry" });

      expect(mounted.view.dom).toHaveTextContent("Image request failed (HTTP 404).");
      expect(mounted.getMarkdown()).toBe(`${REMOTE_MARKDOWN}\n`);

      await user.click(retry);

      expect(
        await within(mounted.view.dom).findByRole("img", { name: "Remote" }),
      ).toBeInTheDocument();
      expect(fetchRemoteImage).toHaveBeenCalledTimes(2);
    });

    it("reports an unexpected failure with a generic message", async () => {
      const user = setupUser();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockRemoteImage(() => {
        throw new Error("IPC unavailable.");
      });

      const mounted = await mountRemoteImage();

      await user.click(within(mounted.view.dom).getByRole("button", { name: "Load image" }));

      expect(
        await within(mounted.view.dom).findByRole("button", { name: "Retry" }),
      ).toBeInTheDocument();
      expect(mounted.view.dom).toHaveTextContent("Image could not be loaded.");
      expect(consoleError).toHaveBeenCalled();
    });

    it("revokes the approval and object URL when the target is edited", async () => {
      const user = setupUser();
      const { revokeObjectURL } = mockRemoteImage();

      const mounted = await mountRemoteImage();

      await user.click(within(mounted.view.dom).getByRole("button", { name: "Load image" }));
      await within(mounted.view.dom).findByRole("img", { name: "Remote" });

      setImageTarget(mounted, "https://images.example.org/other.png");

      expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
      await waitFor(() => {
        expect(mounted.view.dom).toHaveTextContent("Remote image from images.example.org.");
      });
      expect(within(mounted.view.dom).queryByRole("img")).not.toBeInTheDocument();
      expect(countTauriApiCalls("fetchRemoteImage")).toBe(1);
    });

    it("revokes the object URL when the view is destroyed", async () => {
      const user = setupUser();
      const { revokeObjectURL } = mockRemoteImage();

      const mounted = await mountRemoteImage();

      await user.click(within(mounted.view.dom).getByRole("button", { name: "Load image" }));
      await within(mounted.view.dom).findByRole("img", { name: "Remote" });
      await mounted.destroy();

      expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
    });

    it("discards a result that arrives after the target changed", async () => {
      const user = setupUser();
      const pending = deferred<ArrayBuffer>();
      const { createObjectURL } = mockRemoteImage(() => pending.promise);

      const mounted = await mountRemoteImage();

      await user.click(within(mounted.view.dom).getByRole("button", { name: "Load image" }));

      expect(mounted.view.dom).toHaveTextContent("Loading image from example.com...");

      setImageTarget(mounted, "https://images.example.org/other.png");
      pending.resolve(new Uint8Array([0x89, 0x50]).buffer);

      await waitFor(() => {
        expect(mounted.view.dom).toHaveTextContent("Remote image from images.example.org.");
      });
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(within(mounted.view.dom).queryByRole("img")).not.toBeInTheDocument();
    });

    it("discards a result that arrives after the view was destroyed", async () => {
      const user = setupUser();
      const pending = deferred<ArrayBuffer>();
      const { createObjectURL } = mockRemoteImage(() => pending.promise);

      const mounted = await mountRemoteImage();

      await user.click(within(mounted.view.dom).getByRole("button", { name: "Load image" }));
      await mounted.destroy();
      pending.resolve(new Uint8Array([0x89, 0x50]).buffer);
      await pending.promise;

      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("ignores repeated activation while a load is in flight", async () => {
      const user = setupUser();
      const pending = deferred<ArrayBuffer>();
      mockRemoteImage(() => pending.promise);

      const mounted = await mountRemoteImage();
      const action = within(mounted.view.dom).getByRole("button", { name: "Load image" });

      await user.click(action);

      expect(action).toHaveAttribute("aria-disabled", "true");
      expect(within(mounted.view.dom).getByRole("button", { name: "Load image" })).toBe(action);

      await user.click(action);
      pending.resolve(new Uint8Array([0x89, 0x50]).buffer);

      expect(
        await within(mounted.view.dom).findByRole("img", { name: "Remote" }),
      ).toBeInTheDocument();
      expect(countTauriApiCalls("fetchRemoteImage")).toBe(1);
    });
  });

  it.each([
    {
      backendResult: { kind: "missing", path: "C:/Notes/assets/missing.png" },
      expectedMessage: "Image not found.",
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
      expectedMessage: "Image access denied.",
      markdown: "![Denied](./assets/private.png)",
    },
    {
      backendResult: {
        kind: "metadataFailed",
        path: "C:/Notes/assets/image.png",
        message: "Could not inspect image.",
      },
      expectedMessage: "Image metadata unavailable.",
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
      expect(mounted.view.dom).toHaveTextContent("Image outside the current folder.");
    });

    expect(mounted.view.dom).not.toHaveTextContent("C:\\Other\\outside.png");

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

  it("keeps a failed resolution mounted through a clean source-projection round trip", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const resolveMarkdownImageTarget = vi
      .fn()
      .mockRejectedValueOnce(new Error("Image resolver unavailable."));
    mockTauriApiCommand("resolveMarkdownImageTarget", resolveMarkdownImageTarget);

    const mounted = await mountImageEditor("![Retry](./assets/icon.png) tail");

    await waitFor(() => {
      expect(mounted.view.dom).toHaveTextContent("Image unavailable.");
    });

    const placeholder = mounted.view.dom.querySelector(".leafdown-image-placeholder");

    if (!placeholder) {
      throw new Error("Expected image placeholder to be rendered.");
    }

    dispatchMouseDown(placeholder);
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.view.dom).toHaveTextContent("Image unavailable.");
    expect(countTauriApiCalls("resolveMarkdownImageTarget")).toBe(1);
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
