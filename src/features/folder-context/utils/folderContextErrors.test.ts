import { describe, expect, it } from "vitest";

import { getOpenFolderContextErrorMessage } from "./folderContextErrors";

describe("folder context errors", () => {
  it("maps folder scan and index-open errors", () => {
    expect(
      getOpenFolderContextErrorMessage({
        kind: "scanFailed",
        error: { kind: "notDirectory", path: "C:/Notes/readme.md" },
      }),
    ).toEqual({
      title: "Folder path is not a directory.",
      description: "C:/Notes/readme.md",
    });

    expect(
      getOpenFolderContextErrorMessage({
        kind: "indexOpenFailed",
        error: { kind: "invalidEncoding", path: "C:/Notes/readme.md" },
      }),
    ).toEqual({
      title: "Could not open folder index file.",
      description: "Leafdown opens Markdown files encoded as UTF-8.",
    });
  });
});
