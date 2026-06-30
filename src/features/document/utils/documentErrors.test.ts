import { describe, expect, it } from "vitest";

import { getOpenMarkdownFileErrorMessage, getSaveMarkdownFileErrorMessage } from "./documentErrors";

describe("document IO errors", () => {
  it.each([
    {
      name: "unsupported file type",
      error: { kind: "unsupportedFileType", path: "C:/Notes/notes.txt" },
      expected: {
        title: "Unsupported Markdown file type.",
        description: "Leafdown opens .md and .markdown files.",
      },
    },
    {
      name: "invalid path",
      error: { kind: "invalidPath", path: "bad:path" },
      expected: {
        title: "Invalid Markdown file path.",
        description: "bad:path",
      },
    },
    {
      name: "missing file",
      error: { kind: "missingFile", path: "C:/Notes/missing.md" },
      expected: {
        title: "Markdown file not found.",
        description: "C:/Notes/missing.md",
      },
    },
    {
      name: "permission denied",
      error: {
        kind: "permissionDenied",
        path: "C:/Notes/private.md",
        message: "permission denied",
      },
      expected: {
        title: "Permission denied opening Markdown file.",
        description: "permission denied",
      },
    },
    {
      name: "oversized file",
      error: {
        kind: "oversizedFile",
        path: "C:/Notes/large.md",
        sizeBytes: 5 * 1024 * 1024 + 1,
        maxSizeBytes: 5 * 1024 * 1024,
      },
      expected: {
        title: "Markdown file is too large.",
        description: "5.0 MB selected. Files larger than 5 MB do not load.",
      },
    },
    {
      name: "invalid encoding",
      error: { kind: "invalidEncoding", path: "C:/Notes/invalid.md" },
      expected: {
        title: "Invalid Markdown file encoding.",
        description: "Leafdown opens Markdown files encoded as UTF-8.",
      },
    },
    {
      name: "read failed",
      error: {
        kind: "readFailed",
        path: "C:/Notes/readme.md",
        message: "read failed",
      },
      expected: {
        title: "Could not read Markdown file.",
        description: "read failed",
      },
    },
    {
      name: "metadata failed",
      error: {
        kind: "metadataFailed",
        path: "C:/Notes/readme.md",
        message: "metadata failed",
      },
      expected: {
        title: "Could not inspect Markdown file.",
        description: "metadata failed",
      },
    },
  ])("maps open error: $name", ({ error, expected }) => {
    expect(getOpenMarkdownFileErrorMessage(error)).toEqual(expected);
  });

  it.each([
    {
      name: "unsupported file type",
      error: { kind: "unsupportedFileType", path: "C:/Notes/readme.txt" },
      expected: {
        title: "Unsupported save file type.",
        description: "Save Markdown documents as .md or .markdown files.",
      },
    },
    {
      name: "invalid path",
      error: { kind: "invalidPath", path: "bad:path" },
      expected: {
        title: "Invalid save path.",
        description: "bad:path",
      },
    },
    {
      name: "missing file",
      error: { kind: "missingFile", path: "C:/Notes/missing.md" },
      expected: {
        title: "Saved Markdown file is missing.",
        description: "C:/Notes/missing.md",
      },
    },
    {
      name: "permission denied",
      error: {
        kind: "permissionDenied",
        path: "C:/Notes/readme.md",
        message: "permission denied",
      },
      expected: {
        title: "Permission denied saving Markdown file.",
        description: "permission denied",
      },
    },
    {
      name: "external modification",
      error: {
        kind: "externalModification",
        path: "C:/Notes/readme.md",
        currentMetadata: { sizeBytes: 20, modifiedAtUnixMs: 2 },
      },
      expected: {
        title: "Markdown file changed outside Leafdown.",
        description: "C:/Notes/readme.md",
      },
    },
    {
      name: "write failed",
      error: {
        kind: "writeFailed",
        path: "C:/Notes/readme.md",
        message: "write failed",
      },
      expected: {
        title: "Could not write Markdown file.",
        description: "write failed",
      },
    },
    {
      name: "metadata failed",
      error: {
        kind: "metadataFailed",
        path: "C:/Notes/readme.md",
        message: "metadata failed",
      },
      expected: {
        title: "Could not inspect saved Markdown file.",
        description: "metadata failed",
      },
    },
  ])("maps save error: $name", ({ error, expected }) => {
    expect(getSaveMarkdownFileErrorMessage(error)).toEqual(expected);
  });

  it("falls back for unknown error payloads", () => {
    expect(getOpenMarkdownFileErrorMessage({ kind: "unknown" })).toEqual({
      title: "Could not open Markdown file.",
    });
    expect(getSaveMarkdownFileErrorMessage({ kind: "unknown" })).toEqual({
      title: "Could not save Markdown document.",
    });
  });
});
