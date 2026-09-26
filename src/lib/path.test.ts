import { describe, expect, it } from "vitest";

import {
  getPathIdentityKey,
  getPathParts,
  getRelativePath,
  isSameOrParentPath,
  isSamePath,
  PathMap,
  PathSet,
  rebasePath,
  toSlashPath,
} from "./path";

describe("path utilities", () => {
  it("normalizes Windows separators to slash separators", () => {
    expect(toSlashPath("C:\\Notes\\readme.md")).toBe("C:/Notes/readme.md");
  });

  it("splits a path into its name and parent path", () => {
    expect(getPathParts("C:\\Notes\\Docs\\readme.md")).toEqual({
      name: "readme.md",
      parent: "C:/Notes/Docs",
    });
    expect(getPathParts("C:/Notes/")).toEqual({ name: "Notes", parent: "C:/" });
    expect(getPathParts("/Users/Ada")).toEqual({ name: "Ada", parent: "/Users" });
    expect(getPathParts("/Users")).toEqual({ name: "Users", parent: "/" });
    expect(getPathParts("\\\\Server\\Share\\notes.md")).toEqual({
      name: "notes.md",
      parent: "//Server/Share",
    });
  });

  it("leaves a root or bare name without a parent path", () => {
    expect(getPathParts("C:\\")).toEqual({ name: "C:/", parent: "" });
    expect(getPathParts("/")).toEqual({ name: "/", parent: "" });
    expect(getPathParts("readme.md")).toEqual({ name: "readme.md", parent: "" });
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

  it("derives portable relative paths without crossing path roots", () => {
    expect(getRelativePath("C:/Notes/drafts", "c:\\Notes\\guides\\setup.md")).toBe(
      "../guides/setup.md",
    );
    expect(getRelativePath("C:/Notes", "D:/Guides/setup.md")).toBeNull();
    expect(getRelativePath("/home/notes", "/home/notes/guide.md")).toBe("guide.md");
    expect(getRelativePath("//server/share/notes", "//SERVER/SHARE/guides")).toBe("../guides");
  });

  it("rebases a path and its descendants onto a renamed path", () => {
    expect(rebasePath("C:\\Notes\\draft.md", "c:/notes/DRAFT.md", "C:\\Notes\\final.md")).toBe(
      "C:\\Notes\\final.md",
    );
    expect(
      rebasePath("C:\\Notes\\drafts\\Ideas\\one.md", "C:\\notes\\drafts", "C:\\Notes\\archive"),
    ).toBe("C:\\Notes\\archive\\Ideas\\one.md");
    expect(rebasePath("/home/notes/a/b.md", "/home/notes/a/", "/home/notes/c")).toBe(
      "/home/notes/c/b.md",
    );
    expect(rebasePath("/home/notes/ab.md", "/home/notes/a", "/home/notes/c")).toBeNull();
    expect(rebasePath("/home/Notes/a.md", "/home/notes", "/home/other")).toBeNull();
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

  it("keys values by path identity", () => {
    const values = new PathMap<number>().set("C:/Notes/docs", 1).set("/Users/Ada/Notes", 2);

    expect(values.get("c:\\notes\\docs\\")).toBe(1);
    expect(values.get("/Users/Ada/Notes/")).toBe(2);
    expect(values.get("/users/ada/notes")).toBeUndefined();

    values.set("C:/NOTES/DOCS", 3);

    expect(values.get("C:/Notes/docs")).toBe(3);
  });
});
