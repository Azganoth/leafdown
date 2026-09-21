// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { parseSafeHtml } from "./safeHtml";

describe("safe raw HTML", () => {
  it.each([
    "<br>",
    "<br />",
    "<BR>",
    "<hr>",
    "<div>Block</div>",
    "<section>\n<strong>Raw</strong> &amp; text\n</section>",
    "<details><summary>Summary</summary><p>Body</p></details>",
    "<dl><dt>Term</dt><dd>Definition</dd></dl>",
    "<span><b>B</b><i>I</i><em>E</em><u>U</u><s>S</s><del>D</del><ins>I</ins><mark>M</mark><sub>S</sub><sup>S</sup><code>C</code><kbd>K</kbd><samp>S</samp><var>V</var><abbr>A</abbr><small>S</small></span>",
  ])("adopts an unchanged allowlisted tree: %s", (source) => {
    const rendered = parseSafeHtml(source);
    expect(rendered).not.toBeNull();
    const host = document.createElement("span");
    host.append(rendered!.element);
    expect(host.firstChild).toBe(rendered!.element);
  });

  it.each([
    { flow: "block", source: "<section>Block</section>" },
    { flow: "inline", source: "<mark>Inline</mark>" },
    { flow: "inline", source: "<br>" },
  ] as const)("classifies $source as $flow HTML", ({ flow, source }) => {
    expect(parseSafeHtml(source)?.flow).toBe(flow);
  });

  it("maps nested rendered text and character references to authored source offsets", () => {
    const source = "<div>Self-contained <strong>safe &amp; sound</strong>.</div>";
    const rendered = parseSafeHtml(source)!;
    const strong = rendered.element.querySelector("strong")!;
    const text = strong.firstChild!;

    expect(rendered.getSourceOffset(text, 0)).toBe(source.indexOf("safe"));
    expect(rendered.getSourceOffset(text, 5)).toBe(source.indexOf("&amp;"));
    expect(rendered.getSourceOffset(text, 6)).toBe(source.indexOf("&amp;") + "&amp;".length);
    expect(rendered.getSourceOffset(strong, 0)).toBe(source.indexOf("safe"));
    expect(rendered.getSourceOffset(strong, 1)).toBe(source.indexOf("</strong>"));
  });

  it.each([
    "<span>",
    "</span>",
    "<div>unclosed",
    "<em>wrong</strong>",
    "<div><em>wrong</strong></div>",
    "< a>",
    "<div>A</div><div>B</div>",
    "text<div>A</div>",
    "<!-- comment -->",
    "<?processing instruction?>",
    "<![CDATA[text]]>",
    "<div><!-- hidden --></div>",
    "<div class='app'>A</div>",
    "<div id='root'>A</div>",
    "<div style='position:fixed'>A</div>",
    "<div><b onclick='alert(1)'>A</b></div>",
    "<div><script>alert(1)</script>Text</div>",
    "<div><img src='https://example.com/tracker'></div>",
    "<a href='javascript:alert(1)'>A</a>",
    "<iframe srcdoc='<script>x</script>'></iframe>",
    "<form><input></form>",
    "<svg><text>A</text></svg>",
    "<math><mtext>A</mtext></math>",
    "<div><svg><foreignObject><p>A</p></foreignObject></svg></div>",
    "<div><template><script>alert(1)</script></template></div>",
  ])("rejects the entire fragment without exposing a partial tree: %s", (source) => {
    expect(parseSafeHtml(source)).toBeNull();
  });
});
