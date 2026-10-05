import { describe, expect, it } from "vitest";

import { FolderSearchTextCache } from "./folderSearchTextCache";

const entry = (text: string) => ({
  metadata: { sizeBytes: text.length, modifiedAtUnixMs: 1 },
  fingerprint: text,
  text,
});

describe("folder search text cache", () => {
  it("keeps text by path identity until the budget is spent", () => {
    const cache = new FolderSearchTextCache(10);

    cache.set("C:/Notes/a.md", entry("123456"));
    cache.set("C:/Notes/b.md", entry("12345"));

    expect(cache.get(String.raw`c:\notes\A.md`)?.text).toBe("123456");
    expect(cache.get("C:/Notes/b.md")).toBeUndefined();

    cache.set("C:/Notes/a.md", entry("12"));
    cache.set("C:/Notes/b.md", entry("12345"));

    expect(cache.get("C:/Notes/b.md")?.text).toBe("12345");

    cache.clear();

    expect(cache.get("C:/Notes/a.md")).toBeUndefined();
  });
});
