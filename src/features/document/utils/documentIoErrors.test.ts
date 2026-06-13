import { describe, expect, it, vi } from "vitest";

import {
  getOpenMarkdownFileErrorMessage,
  getSaveMarkdownFileErrorMessage,
  showDocumentIoErrorToast,
} from "./documentIoErrors";

describe("document IO errors", () => {
  it("maps Markdown loading limit and encoding errors to user-facing messages", () => {
    expect(
      getOpenMarkdownFileErrorMessage({
        kind: "oversizedFile",
        path: "C:/Notes/large.md",
        sizeBytes: 5 * 1024 * 1024 + 1,
        maxSizeBytes: 5 * 1024 * 1024,
      }),
    ).toEqual({
      title: "Markdown file is too large.",
      description: "5.0 MB selected. Files larger than 5 MB do not load.",
    });

    expect(
      getOpenMarkdownFileErrorMessage({
        kind: "invalidEncoding",
        path: "C:/Notes/invalid.md",
      }),
    ).toEqual({
      title: "Invalid Markdown file encoding.",
      description: "Leafdown opens Markdown files encoded as UTF-8.",
    });
  });

  it("maps unsupported, missing, permission, read, and metadata open errors", () => {
    expect(
      getOpenMarkdownFileErrorMessage({
        kind: "unsupportedFileType",
        path: "C:/Notes/notes.txt",
      }).title,
    ).toBe("Unsupported Markdown file type.");
    expect(
      getOpenMarkdownFileErrorMessage({
        kind: "invalidPath",
        path: "bad:path",
      }),
    ).toEqual({
      title: "Invalid Markdown file path.",
      description: "bad:path",
    });
    expect(
      getOpenMarkdownFileErrorMessage({
        kind: "missingFile",
        path: "C:/Notes/missing.md",
      }),
    ).toEqual({
      title: "Markdown file not found.",
      description: "C:/Notes/missing.md",
    });
    expect(
      getOpenMarkdownFileErrorMessage({
        kind: "permissionDenied",
        path: "C:/Notes/private.md",
        message: "permission denied",
      }).title,
    ).toBe("Permission denied opening Markdown file.");
    expect(
      getOpenMarkdownFileErrorMessage({
        kind: "readFailed",
        path: "C:/Notes/readme.md",
        message: "read failed",
      }).title,
    ).toBe("Could not read Markdown file.");
    expect(
      getOpenMarkdownFileErrorMessage({
        kind: "metadataFailed",
        path: "C:/Notes/readme.md",
        message: "metadata failed",
      }).title,
    ).toBe("Could not inspect Markdown file.");
  });

  it("maps save failures while leaving conflict actions to workflow dialogs", () => {
    expect(
      getSaveMarkdownFileErrorMessage({
        kind: "unsupportedFileType",
        path: "C:/Notes/readme.txt",
      }).title,
    ).toBe("Unsupported save file type.");
    expect(
      getSaveMarkdownFileErrorMessage({
        kind: "invalidPath",
        path: "bad:path",
      }),
    ).toEqual({
      title: "Invalid save path.",
      description: "bad:path",
    });
    expect(
      getSaveMarkdownFileErrorMessage({
        kind: "permissionDenied",
        path: "C:/Notes/readme.md",
        message: "permission denied",
      }).title,
    ).toBe("Permission denied saving Markdown file.");
    expect(
      getSaveMarkdownFileErrorMessage({
        kind: "writeFailed",
        path: "C:/Notes/readme.md",
        message: "write failed",
      }).title,
    ).toBe("Could not write Markdown file.");
    expect(
      getSaveMarkdownFileErrorMessage({
        kind: "metadataFailed",
        path: "C:/Notes/readme.md",
        message: "metadata failed",
      }).title,
    ).toBe("Could not inspect saved Markdown file.");
    expect(
      getSaveMarkdownFileErrorMessage({
        kind: "externalModification",
        path: "C:/Notes/readme.md",
        currentMetadata: { sizeBytes: 20, modifiedAtUnixMs: 2 },
      }),
    ).toEqual({
      title: "Markdown file changed outside Leafdown.",
      description: "C:/Notes/readme.md",
    });
  });

  it("falls back for unknown error payloads and only includes descriptions when present", () => {
    const showError = vi.fn();

    expect(getOpenMarkdownFileErrorMessage({ kind: "unknown" })).toEqual({
      title: "Could not open Markdown file.",
    });

    showDocumentIoErrorToast(showError, { title: "Plain error." });
    showDocumentIoErrorToast(showError, {
      title: "Detailed error.",
      description: "Details",
    });

    expect(showError).toHaveBeenNthCalledWith(1, "Plain error.");
    expect(showError).toHaveBeenNthCalledWith(2, "Detailed error.", {
      description: "Details",
    });
  });
});
