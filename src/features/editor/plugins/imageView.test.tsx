import { convertFileSrc } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  EDITOR_TEST_ROOT_CLASS_NAME,
  createMarkdownReferenceContext,
} from "@/test/factories/editor";
import { dispatchInput, dispatchMouseDown } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setupUser, waitFor, within } from "@/test/utils/react";
import {
  countTauriApiCalls,
  getLastTauriApiArgs,
  mockTauriApi,
  mockTauriApiCommand,
} from "@/test/utils/tauriApi";

type RenderableImageTargetResult = { kind: "renderable"; path: string };

const mountEditor = setupMilkdownEditorMount();

const mountImageEditor = (initialMarkdown: string) =>
  mountEditor(initialMarkdown, {
    ...createMarkdownReferenceContext(),
    rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
  });

describe("Markdown images", () => {
  describe("resolution outcomes", () => {
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
        backendResult: { kind: "permissionDenied", message: "No image permission." },
        expectedMessage: "No image permission.",
        markdown: "![Denied](./assets/private.png)",
      },
      {
        backendResult: { kind: "metadataFailed", message: "Could not inspect image." },
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
  });

  describe("explicit loading", () => {
    it("requires an inline explicit load before rendering outside-folder images", async () => {
      const user = setupUser();
      const resolveMarkdownImageTarget = vi
        .fn()
        .mockResolvedValueOnce({ kind: "outsideFolder" })
        .mockResolvedValue({ kind: "renderable", path: "C:\\Other\\outside.png" });
      mockTauriApiCommand("resolveMarkdownImageTarget", resolveMarkdownImageTarget);

      const mounted = await mountImageEditor("![Outside](../outside.png)");

      await waitFor(() => {
        expect(mounted.view.dom).toHaveTextContent("Image is outside the current folder.");
      });

      const button = within(mounted.view.dom).getByRole("button", { name: "Load image" });

      await user.click(button);

      await waitFor(() => {
        expect(within(mounted.view.dom).getByRole("img", { name: "Outside" })).toBeInTheDocument();
      });

      expect(getLastTauriApiArgs("resolveMarkdownImageTarget")).toEqual({
        ...createMarkdownReferenceContext(),
        allowOutsideFolder: true,
        target: "../outside.png",
      });
      expect(mounted.getMarkdown()).toBe("![Outside](../outside.png)\n");
    });
  });

  describe("resolution lifecycle", () => {
    it("retries failed image resolutions on a later matching update", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const resolveMarkdownImageTarget = vi
        .fn()
        .mockRejectedValueOnce(new Error("Image resolver unavailable."))
        .mockResolvedValueOnce({ kind: "renderable", path: "C:\\Notes\\assets\\icon.png" });
      mockTauriApiCommand("resolveMarkdownImageTarget", resolveMarkdownImageTarget);

      const mounted = await mountImageEditor("![Retry](./assets/icon.png)");

      await waitFor(() => {
        expect(mounted.view.dom).toHaveTextContent("Image resolver unavailable.");
        expect(consoleError).toHaveBeenCalledWith(
          "Unexpected error (resolveMarkdownImage).",
          expect.any(Error),
        );
      });

      const placeholder = mounted.view.dom.querySelector(".leafdown-image-placeholder");

      if (!placeholder) {
        throw new Error("Expected image placeholder to be rendered.");
      }

      dispatchMouseDown(placeholder);
      dispatchInput(
        within(mounted.view.dom).getByRole("textbox", { name: "Image Markdown" }),
        "![Retried](./assets/icon.png)",
      );

      await waitFor(() => {
        expect(within(mounted.view.dom).getByRole("img", { name: "Retried" })).toHaveAttribute(
          "src",
          "asset://localhost/C%3A%2FNotes%2Fassets%2Ficon.png",
        );
      });

      expect(countTauriApiCalls("resolveMarkdownImageTarget")).toBe(2);
    });

    it("does not re-resolve images when raw Markdown edits keep the same source", async () => {
      mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
        kind: "renderable",
        path: "C:\\Notes\\assets\\icon.png",
      }));

      const mounted = await mountImageEditor("![Alt](./assets/icon.png)");

      await waitFor(() => {
        expect(within(mounted.view.dom).getByRole("img", { name: "Alt" })).toBeInTheDocument();
      });
      expect(countTauriApiCalls("resolveMarkdownImageTarget")).toBe(1);

      const image = within(mounted.view.dom).getByRole("img", { name: "Alt" });
      dispatchMouseDown(image);

      const input = within(mounted.view.dom).getByRole("textbox", { name: "Image Markdown" });
      dispatchInput(input, '![Updated](./assets/icon.png "Updated title")');

      await waitFor(() => {
        expect(within(mounted.view.dom).getByRole("img", { name: "Updated" })).toHaveAttribute(
          "title",
          "Updated title",
        );
      });
      expect(countTauriApiCalls("resolveMarkdownImageTarget")).toBe(1);
      expect(mounted.getMarkdown()).toBe('![Updated](./assets/icon.png "Updated title")\n');
    });

    it("ignores stale image resolutions after the image source changes", async () => {
      const oldResolution = Promise.withResolvers<RenderableImageTargetResult>();
      const newResolution = Promise.withResolvers<RenderableImageTargetResult>();

      mockTauriApi({
        resolveMarkdownImageTarget: ({ target }) => {
          return target === "./assets/old.png" ? oldResolution.promise : newResolution.promise;
        },
      });

      const mounted = await mountImageEditor("![Old](./assets/old.png)");

      await waitFor(() => {
        expect(mounted.view.dom).toHaveTextContent("Resolving image...");
      });

      const placeholder = mounted.view.dom.querySelector(".leafdown-image-placeholder");

      if (!placeholder) {
        throw new Error("Expected image placeholder to be rendered.");
      }

      dispatchMouseDown(placeholder);
      dispatchInput(
        within(mounted.view.dom).getByRole("textbox", { name: "Image Markdown" }),
        "![New](./assets/new.png)",
      );
      newResolution.resolve({ kind: "renderable", path: "C:\\Notes\\assets\\new.png" });

      await waitFor(() => {
        expect(within(mounted.view.dom).getByRole("img", { name: "New" })).toHaveAttribute(
          "src",
          "asset://localhost/C%3A%2FNotes%2Fassets%2Fnew.png",
        );
      });

      oldResolution.resolve({ kind: "renderable", path: "C:\\Notes\\assets\\old.png" });
      await Promise.resolve();

      expect(within(mounted.view.dom).getByRole("img", { name: "New" })).toHaveAttribute(
        "src",
        "asset://localhost/C%3A%2FNotes%2Fassets%2Fnew.png",
      );
      expect(mounted.view.dom.querySelector('img[src*="old.png"]')).not.toBeInTheDocument();
    });

    it("ignores stale image resolution failures after the image source changes", async () => {
      const oldResolution = Promise.withResolvers<never>();
      const newResolution = Promise.withResolvers<RenderableImageTargetResult>();

      mockTauriApi({
        resolveMarkdownImageTarget: ({ target }) => {
          return target === "./assets/old.png" ? oldResolution.promise : newResolution.promise;
        },
      });

      const mounted = await mountImageEditor("![Old](./assets/old.png)");

      await waitFor(() => {
        expect(mounted.view.dom).toHaveTextContent("Resolving image...");
      });

      const placeholder = mounted.view.dom.querySelector(".leafdown-image-placeholder");

      if (!placeholder) {
        throw new Error("Expected image placeholder to be rendered.");
      }

      dispatchMouseDown(placeholder);
      dispatchInput(
        within(mounted.view.dom).getByRole("textbox", { name: "Image Markdown" }),
        "![New](./assets/new.png)",
      );
      newResolution.resolve({ kind: "renderable", path: "C:\\Notes\\assets\\new.png" });

      await waitFor(() => {
        expect(within(mounted.view.dom).getByRole("img", { name: "New" })).toBeInTheDocument();
      });

      oldResolution.reject(new Error("Old image resolution failed."));
      await Promise.resolve();

      expect(mounted.view.dom).not.toHaveTextContent("Old image resolution failed.");
      expect(within(mounted.view.dom).getByRole("img", { name: "New" })).toBeInTheDocument();
    });
  });

  describe("raw Markdown editing", () => {
    it("exposes focused images as editable raw Markdown", async () => {
      mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
        kind: "renderable",
        path: "C:\\Notes\\assets\\icon.png",
      }));

      const mounted = await mountImageEditor("![Alt](./assets/icon.png)");

      await waitFor(() => {
        expect(within(mounted.view.dom).getByRole("img", { name: "Alt" })).toBeInTheDocument();
      });

      const image = within(mounted.view.dom).getByRole("img", { name: "Alt" });
      dispatchMouseDown(image);

      const input = within(mounted.view.dom).getByRole("textbox", { name: "Image Markdown" });

      expect(input).toHaveValue("![Alt](./assets/icon.png)");
      dispatchInput(input, '![Updated](./assets/updated.png "Updated title")');

      await waitFor(() => {
        expect(mounted.getMarkdown()).toBe('![Updated](./assets/updated.png "Updated title")\n');
      });
    });

    it("keeps raw Markdown editing focused while image resolution rerenders", async () => {
      const user = setupUser();
      mockTauriApiCommand("resolveMarkdownImageTarget", () => ({
        kind: "renderable",
        path: "C:\\Notes\\assets\\icon.png",
      }));

      const mounted = await mountImageEditor("![Alt](./assets/icon.png)");

      await waitFor(() => {
        expect(within(mounted.view.dom).getByRole("img", { name: "Alt" })).toBeInTheDocument();
      });

      const image = within(mounted.view.dom).getByRole("img", { name: "Alt" });
      dispatchMouseDown(image);

      const input = within(mounted.view.dom).getByRole<HTMLInputElement>("textbox", {
        name: "Image Markdown",
      });

      await user.click(input);
      input.setSelectionRange(4, 4);
      await user.keyboard("p");

      const latestInput = within(mounted.view.dom).getByRole<HTMLInputElement>("textbox", {
        name: "Image Markdown",
      });

      expect(latestInput).toBe(document.activeElement);
      expect(latestInput).toHaveValue("![Alpt](./assets/icon.png)");
      expect(latestInput.selectionStart).toBe(5);
      expect(mounted.getMarkdown()).toBe("![Alpt](./assets/icon.png)\n");
    });
  });
});
