import { describe, expect, it } from "vitest";

import { getMockPathExtension, joinMockPathSegments } from "./path";

describe("test path utilities", () => {
  it("joins mocked Tauri path segments with slash separators", () => {
    expect(joinMockPathSegments("C:\\Notes", "docs", "readme.md")).toBe("C:/Notes/docs/readme.md");
  });

  it("preserves rooted paths while joining mocked Tauri path segments", () => {
    expect(joinMockPathSegments("/", "Notes", "readme.md")).toBe("/Notes/readme.md");
    expect(joinMockPathSegments("\\\\server\\share", "Notes", "readme.md")).toBe(
      "//server/share/Notes/readme.md",
    );
  });

  it("ignores empty mocked Tauri path segments while joining", () => {
    expect(joinMockPathSegments("C:/Notes", "", "readme.md")).toBe("C:/Notes/readme.md");
  });

  it("reads mocked Tauri path extensions from the basename", () => {
    expect(getMockPathExtension("C:/Notes/readme.md")).toBe("md");
    expect(getMockPathExtension("C:/Notes/archive.tar.gz")).toBe("gz");
    expect(getMockPathExtension("C:/Notes/readme")).toBe("");
    expect(getMockPathExtension("C:/Notes/.gitignore")).toBe("");
  });
});
