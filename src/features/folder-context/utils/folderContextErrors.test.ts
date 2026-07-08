import { describe, expect, it } from "vitest";

import {
  getOpenFolderContextErrorMessage,
  getScanFolderContextErrorMessage,
  getWatchFolderContextErrorMessage,
} from "./folderContextErrors";

describe("folder context errors", () => {
  it.each([
    {
      name: "invalid path",
      error: { kind: "invalidPath", path: "bad:path" },
      expected: {
        title: "Invalid folder path.",
        description: "bad:path",
      },
    },
    {
      name: "missing folder",
      error: { kind: "missingFolder", path: "C:/Missing" },
      expected: {
        title: "Folder not found.",
        description: "C:/Missing",
      },
    },
    {
      name: "permission denied",
      error: { kind: "permissionDenied", path: "C:/Notes", message: "access denied" },
      expected: {
        title: "Permission denied accessing folder.",
        description: "access denied",
      },
    },
    {
      name: "metadata failed",
      error: { kind: "metadataFailed", path: "C:/Notes", message: "metadata failed" },
      expected: {
        title: "Could not inspect folder.",
        description: "metadata failed",
      },
    },
    {
      name: "not directory",
      error: { kind: "notDirectory", path: "C:/Notes/readme.md" },
      expected: {
        title: "Folder path is not a directory.",
        description: "C:/Notes/readme.md",
      },
    },
    {
      name: "read directory failed",
      error: { kind: "readDirectoryFailed", path: "C:/Notes", message: "read failed" },
      expected: {
        title: "Could not read folder.",
        description: "read failed",
      },
    },
  ])("maps scan error: $name", ({ error, expected }) => {
    expect(getScanFolderContextErrorMessage(error)).toEqual(expected);
  });

  it("maps open-folder scan failures through scan messages", () => {
    expect(
      getOpenFolderContextErrorMessage({
        kind: "scanFailed",
        error: { kind: "readDirectoryFailed", path: "C:/Notes", message: "read failed" },
      }),
    ).toEqual({
      title: "Could not read folder.",
      description: "read failed",
    });
  });

  it("falls back for unknown top-level payloads", () => {
    expect(getScanFolderContextErrorMessage({ kind: "unknown" })).toEqual({
      title: "Could not scan folder.",
    });
    expect(getOpenFolderContextErrorMessage({ kind: "unknown" })).toEqual({
      title: "Could not open folder.",
    });
  });

  it.each([
    {
      name: "invalid path",
      error: { kind: "invalidPath", path: "bad:path" },
      expected: {
        title: "Invalid folder path.",
        description: "bad:path",
      },
    },
    {
      name: "missing folder",
      error: { kind: "missingFolder", path: "C:/Missing" },
      expected: {
        title: "Folder not found.",
        description: "C:/Missing",
      },
    },
    {
      name: "permission denied",
      error: { kind: "permissionDenied", path: "C:/Notes", message: "access denied" },
      expected: {
        title: "Permission denied watching folder.",
        description: "access denied",
      },
    },
    {
      name: "metadata failed",
      error: { kind: "metadataFailed", path: "C:/Notes", message: "metadata failed" },
      expected: {
        title: "Could not inspect folder.",
        description: "metadata failed",
      },
    },
    {
      name: "not directory",
      error: { kind: "notDirectory", path: "C:/Notes/readme.md" },
      expected: {
        title: "Folder path is not a directory.",
        description: "C:/Notes/readme.md",
      },
    },
    {
      name: "watch failed",
      error: { kind: "watchFailed", path: "C:/Notes", message: "watch failed" },
      expected: {
        title: "Could not watch folder.",
        description: "watch failed",
      },
    },
    {
      name: "watcher state failed",
      error: { kind: "watcherStateFailed", message: "watcher state failed" },
      expected: {
        title: "Could not watch folder.",
        description: "watcher state failed",
      },
    },
  ])("maps watch error: $name", ({ error, expected }) => {
    expect(getWatchFolderContextErrorMessage(error)).toEqual(expected);
  });

  it("falls back for unknown watch payloads", () => {
    expect(getWatchFolderContextErrorMessage({ kind: "unknown" })).toEqual({
      title: "Could not watch folder.",
    });
  });
});
