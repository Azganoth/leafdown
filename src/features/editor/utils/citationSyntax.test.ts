import { describe, expect, it } from "vitest";

import { findCitationKeyMarker, parseCitationGroup } from "./citationSyntax";

const raw = String.raw;
const undefinedLabel = () => false;

const read = (source: string) =>
  parseCitationGroup(source)?.map((item) => ({
    prefix: source.slice(item.prefix.from, item.prefix.to),
    suppressed: item.suppressed,
    key: item.key,
    braced: item.braced,
    locator: item.locator && source.slice(item.locator.from, item.locator.to),
    suffix: source.slice(item.suffix.from, item.suffix.to),
  }));

describe("citation grammar", () => {
  it("reads items, suppression, prefixes, and suffixes", () => {
    expect(read("[see @doe99, pp. 33-35 and *passim*; -@smith04, chap. 1]")).toEqual([
      {
        prefix: "see ",
        suppressed: false,
        key: "doe99",
        braced: false,
        locator: null,
        suffix: ", pp. 33-35 and *passim*",
      },
      {
        prefix: " ",
        suppressed: true,
        key: "smith04",
        braced: false,
        locator: null,
        suffix: ", chap. 1",
      },
    ]);
  });

  it.each([
    ["[@doe2026]", "doe2026"],
    ["[@Doe_2026]", "Doe_2026"],
    ["[@_hidden]", "_hidden"],
    ["[@2026report]", "2026report"],
    ["[@ünï_cødé]", "ünï_cødé"],
    ["[@漢字]", "漢字"],
    ["[@a:b.c#d$e%f&g-h+i?j<k>l~m/n]", "a:b.c#d$e%f&g-h+i?j<k>l~m/n"],
  ])("reads the bare key of %s", (source, key) => {
    expect(read(source)?.[0].key).toBe(key);
  });

  it.each([
    ["[@doe.]", "doe", "."],
    ["[@a..b]", "a", "..b"],
    ["[@a--b]", "a", "--b"],
    ["[@doe's view]", "doe", "'s view"],
  ])("ends the bare key of %s at terminal or repeated punctuation", (source, key, suffix) => {
    expect(read(source)?.[0]).toMatchObject({ key, suffix });
  });

  it.each([
    ["[@{Foo_bar.baz.}]", "Foo_bar.baz."],
    [
      "[@{https://example.com/bib?name=foobar&date=2000}, p. 33]",
      "https://example.com/bib?name=foobar&date=2000",
    ],
    ["[@{two words}]", "two words"],
    ["[@{CaSe}]", "CaSe"],
  ])("reads the brace-quoted key of %s without its braces", (source, key) => {
    expect(read(source)?.[0]).toMatchObject({ key, braced: true });
  });

  it.each([
    ["[@key{ii, A}, suffix]", "ii, A", ", suffix"],
    ["[@key{}, 99 years later]", "", ", 99 years later"],
    ["[@key, {pp. iv, vi} suffix]", null, ", {pp. iv, vi} suffix"],
    ["[@key, {p. 3; 4}]", null, ", {p. 3; 4}"],
  ])("keeps the locator and suffix source of %s", (source, locator, suffix) => {
    expect(read(source)?.[0]).toMatchObject({ locator, suffix });
  });

  it("keeps a code span's separator and brackets inside its affix", () => {
    expect(read("[@a, `x;y`; @b]")?.map((item) => item.key)).toEqual(["a", "b"]);
  });

  it("does not read an address in a prefix as a key", () => {
    expect(read("[mail me@example.com about @doe]")?.[0]).toMatchObject({
      key: "doe",
      prefix: "mail me@example.com about ",
    });
  });

  it.each([
    "[]",
    "[@]",
    "[@{}]",
    "[@{ }]",
    "[@{a]",
    "[@{a{b}}]",
    "[@a;]",
    "[@a;;@b]",
    "[;@a]",
    "[^note]",
    "[^@a]",
    "[me@example.com]",
    raw`[\@key]`,
    raw`[-\@key]`,
    "[@a, [b]]",
    "[@a, }]",
    "[@a, `b]",
    "[@a, *b]",
    "[*see @a]",
    "[@a, ~b]",
    "[_see @a]",
    "[@a, <b>c</b>]",
    "[@a, <https://example.com>]",
    "[@a, $x$]",
    "[@a",
    "[see (@a)]",
    "[@-a]",
    "[@.a]",
    "[@a, b\\]",
    "[@a, b  \nc]",
    "[see `[` @a]",
    "[@a, b\\\nc]",
  ])("rejects %s", (source) => {
    expect(parseCitationGroup(source)).toBeNull();
  });

  it.each(["[@a, *b* and **c**]", "[@a, ~~b~~]", "[snake_case @a]", "[@a, 5 < 6]"])(
    "accepts balanced or literal inline affixes in %s",
    (source) => {
      expect(parseCitationGroup(source)).not.toBeNull();
    },
  );

  it.each([
    ["[@a] b", 1],
    ["x [see @a; @b] y", 7],
    ["[-@a]", 2],
    ["[@a](https://example.com)", -1],
    ["[@a](p. 3)", 1],
    ["![@a]", -1],
    [raw`\![@a]`, 3],
    [raw`\[@a]`, -1],
  ])("finds the first key marker a bare group opens in %s", (text, marker) => {
    expect(findCitationKeyMarker(text, text.indexOf("["), undefinedLabel)).toBe(marker);
  });

  it("leaves a group whose label is defined to the link", () => {
    expect(findCitationKeyMarker("[@a]", 0, (label) => label === "@a")).toBe(-1);
    expect(findCitationKeyMarker("[@a][r]", 0, (label) => label === "r")).toBe(-1);
    expect(findCitationKeyMarker("[@a][]", 0, (label) => label === "@a")).toBe(-1);
    expect(findCitationKeyMarker("[@a][r]", 0, undefinedLabel)).toBe(1);
  });
});
