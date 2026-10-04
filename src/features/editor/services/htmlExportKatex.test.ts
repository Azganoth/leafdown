import { describe, expect, it, vi } from "vitest";

import { loadEmbeddedKatexStylesheet } from "./htmlExportKatex";

const STYLESHEET = [
  '@font-face{font-family:KaTeX_Main;src:url(/assets/KaTeX_Main-Regular-a1.woff2) format("woff2")}',
  "@font-face{font-family:KaTeX_Math;src:url('/assets/KaTeX_Math-Italic-b2.woff2') format(\"woff2\")}",
  ".katex{font:normal 1.21em KaTeX_Main}",
].join("");

describe("embedded KaTeX stylesheet", () => {
  it("embeds each woff2 font face as data", async () => {
    const loadFont = vi.fn((_url: string) => Promise.resolve(new Uint8Array([1, 2, 3]).buffer));

    const stylesheet = await loadEmbeddedKatexStylesheet(loadFont, STYLESHEET);

    expect(loadFont.mock.calls.map(([url]) => url)).toEqual([
      "/assets/KaTeX_Main-Regular-a1.woff2",
      "/assets/KaTeX_Math-Italic-b2.woff2",
    ]);
    expect(stylesheet).toBe(
      [
        '@font-face{font-family:KaTeX_Main;src:url(data:font/woff2;base64,AQID) format("woff2")}',
        '@font-face{font-family:KaTeX_Math;src:url(data:font/woff2;base64,AQID) format("woff2")}',
        ".katex{font:normal 1.21em KaTeX_Main}",
      ].join(""),
    );
  });

  it("reports a font that cannot be read", async () => {
    await expect(
      loadEmbeddedKatexStylesheet(() => Promise.reject(new Error("offline")), STYLESHEET),
    ).resolves.toBeNull();
  });
});
