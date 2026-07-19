import { describe, expect, it } from "vitest";

import { normalizeProseMirrorClipboardHtml } from "./clipboardHtml";

const START_FRAGMENT_MARKER = "<!--StartFragment-->";
const END_FRAGMENT_MARKER = "<!--EndFragment-->";

describe("normalizeProseMirrorClipboardHtml", () => {
  it("extracts one qualifying ProseMirror fragment without changing its bytes", () => {
    const fragment = `  \r\n<p data-pm-slice="1 1 []"><strong>Content</strong></p>\r\n  `;
    const html = `<html>\r\n<body>\r\n${START_FRAGMENT_MARKER}${fragment}${END_FRAGMENT_MARKER}\r\n</body>\r\n</html>`;

    expect(normalizeProseMirrorClipboardHtml(html)).toBe(fragment);
  });

  it("preserves nested document elements inside the selected fragment", () => {
    const fragment =
      "<html><head><meta charset=\"utf-8\"></head><body><p DATA-PM-SLICE='1 1 []'>Content</p></body></html>";
    const html = `<html><body>${START_FRAGMENT_MARKER}${fragment}${END_FRAGMENT_MARKER}</body></html>`;

    expect(normalizeProseMirrorClipboardHtml(html)).toBe(fragment);
  });

  it.each([
    ["has no fragment markers", '<p data-pm-slice="1 1 []">Content</p>'],
    ["is missing the end marker", `${START_FRAGMENT_MARKER}<p data-pm-slice="1 1 []">Content</p>`],
    ["is missing the start marker", `<p data-pm-slice="1 1 []">Content</p>${END_FRAGMENT_MARKER}`],
    [
      "has reversed markers",
      `${END_FRAGMENT_MARKER}<p data-pm-slice="1 1 []">Content</p>${START_FRAGMENT_MARKER}`,
    ],
    [
      "has duplicate start markers",
      `${START_FRAGMENT_MARKER}${START_FRAGMENT_MARKER}<p data-pm-slice="1 1 []">Content</p>${END_FRAGMENT_MARKER}`,
    ],
    [
      "has duplicate end markers",
      `${START_FRAGMENT_MARKER}<p data-pm-slice="1 1 []">Content</p>${END_FRAGMENT_MARKER}${END_FRAGMENT_MARKER}`,
    ],
    [
      "has a non-qualifying marked fragment",
      `<html><body>${START_FRAGMENT_MARKER}<p><strong>Content</strong></p>${END_FRAGMENT_MARKER}</body></html>`,
    ],
    [
      "has ProseMirror metadata only outside the marked fragment",
      `<p data-pm-slice="1 1 []">Context</p>${START_FRAGMENT_MARKER}<p>Content</p>${END_FRAGMENT_MARKER}`,
    ],
    [
      "mentions ProseMirror metadata as fragment text rather than an attribute",
      `${START_FRAGMENT_MARKER}<p>data-pm-slice="1 1 []"</p>${END_FRAGMENT_MARKER}`,
    ],
    [
      "uses malformed fragment comments",
      '<!--StartFragment -><p data-pm-slice="1 1 []">Content</p><!--EndFragment ->',
    ],
  ])("passes HTML through unchanged when it %s", (_, html) => {
    expect(normalizeProseMirrorClipboardHtml(html)).toBe(html);
  });
});
