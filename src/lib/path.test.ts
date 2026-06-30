import { describe, expect, it } from "vitest";

import {
  getPathIdentityKey,
  isSameOrParentPath,
  isSamePath,
  PathMap,
  PathSet,
  toSlashPath,
} from "./path";

describe("path utilities", () => {
  it("normalizes Windows separators to slash separators", () => {
    expect(toSlashPath("C:\\Notes\\readme.md")).toBe("C:/Notes/readme.md");
  });

  it("creates stable identity keys for Windows paths", () => {
    expect(getPathIdentityKey("C:\\Notes\\Docs\\")).toBe("c:/notes/docs");
    expect(getPathIdentityKey("C:/")).toBe("c:/");
    expect(getPathIdentityKey("\\\\Server\\Share\\Docs\\Readme.md")).toBe(
      "//server/share/docs/readme.md",
    );
  });

  it("keeps POSIX path identity case-sensitive", () => {
    expect(getPathIdentityKey("/Users/Ada/Notes/")).toBe("/Users/Ada/Notes");
    expect(isSamePath("/Users/Ada/Notes", "/users/ada/notes")).toBe(false);
  });

  it("compares paths by identity", () => {
    expect(isSamePath("C:/Notes/Readme.md", "c:\\notes\\readme.md")).toBe(true);
    expect(isSamePath("C:/Notes/docs", "C:/Notes/docs/")).toBe(true);
    expect(isSamePath("C:/Notes/readme.md", "C:/Notes/other.md")).toBe(false);
  });

  it("checks whether a path is the same as or below a parent path", () => {
    expect(isSameOrParentPath("C:/Notes", "c:\\notes\\docs\\readme.md")).toBe(true);
    expect(isSameOrParentPath("C:/Notes/", "C:/Notes")).toBe(true);
    expect(isSameOrParentPath("C:/", "c:\\notes\\readme.md")).toBe(true);
    expect(isSameOrParentPath("/", "/Users/Ada/Notes")).toBe(true);
    expect(isSameOrParentPath("/Users/Ada/Notes", "/users/ada/notes/readme.md")).toBe(false);
    expect(isSameOrParentPath("C:/Notes", "C:/Notes Archive/readme.md")).toBe(false);
    expect(isSameOrParentPath("", "/Users/Ada/Notes")).toBe(false);
  });

  it("stores values by path identity", () => {
    const paths = new PathMap<number>([["C:/Notes/Readme.md", 1]]);

    paths.set("c:\\notes\\readme.md", 2);
    paths.set("/Users/Ada/Notes/readme.md", 3);

    expect(paths.size).toBe(2);
    expect(paths.has("C:/NOTES/README.MD")).toBe(true);
    expect(paths.get("C:/Notes/readme.md")).toBe(2);
    expect(paths.get("/users/ada/notes/readme.md")).toBeUndefined();
    expect([...paths]).toEqual([
      ["c:\\notes\\readme.md", 2],
      ["/Users/Ada/Notes/readme.md", 3],
    ]);

    expect(paths.delete("C:/Notes/readme.md")).toBe(true);
    expect(paths.has("c:\\notes\\readme.md")).toBe(false);
  });

  it("stores unique paths by path identity", () => {
    const paths = new PathSet(["C:/Notes/docs", "c:\\notes\\docs\\", "/Users/Ada/Notes"]);

    paths.add("/users/ada/notes");

    expect(paths.size).toBe(3);
    expect(paths.has("C:/NOTES/DOCS")).toBe(true);
    expect([...paths]).toEqual(["C:/Notes/docs", "/Users/Ada/Notes", "/users/ada/notes"]);
    expect(paths.delete("c:/notes/docs/")).toBe(true);
    expect(paths.has("C:/Notes/docs")).toBe(false);
  });
});
