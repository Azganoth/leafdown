import { describe, expect, it } from "vitest";

import { formatFileSize } from "./formatFileSize";

describe("formatFileSize", () => {
  it.each([
    [0, "0 bytes"],
    [1, "1 byte"],
    [512, "512 bytes"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [1024 * 1024, "1 MB"],
    [5 * 1024 * 1024, "5 MB"],
    [5 * 1024 * 1024 + 1, "5.0 MB"],
    [2.5 * 1024 ** 3, "2.5 GB"],
    [3 * 1024 ** 4, "3 TB"],
    [4 * 1024 ** 5, "4 PB"],
    [1024 ** 6, "1024 PB"],
  ])("formats %s bytes as %s", (sizeBytes, expected) => {
    expect(formatFileSize(sizeBytes)).toBe(expected);
  });

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid size %s",
    (sizeBytes) => {
      expect(() => formatFileSize(sizeBytes)).toThrow(RangeError);
    },
  );
});
