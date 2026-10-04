# Pandoc-Style Citations

The original observation [@doe2026, pp. 4-6] was later compared with
[-@roe2024; @smith2025].

## Groups

One key [@doe99], several [@doe99; @smith2000; @smith2004], and a suppressed author [-@smith04].

A prefix, locator, and suffix: [see @doe99, pp. 33-35 and *passim*; @smith04, chap. 1].

Affixes keep their inline source: [*see* @doe99, `p. 3`; **also** @roe, ~~ch. 2~~].

Braced locators: [@key{ii, A}, suffix], [@key, {pp. iv, vi} suffix], and [@key{}, 99 years later].

## Keys

Bare keys run to terminal or repeated punctuation: [@doe.], [@a..b], [@ünï_cødé], [@2026report], and
[@a:b.c#d$e%f&g-h+i?j<k>l~m/n].

Brace-quoted keys hold other spellings: [@{Foo_bar.baz.}] and
[@{https://example.com/bib?name=foobar&date=2000}, p. 33].

## Continuation

A group spans soft line endings within its block [see
@doe99, pp. 1-2;
@roe].

> In a quote [see @doe99,
> p. 3] the prefix stays on each line.

- In a list item [see @doe99,
  p. 3] the indentation does too.

## Ordinary Markdown

A complete link keeps its brackets: [@doe99](https://example.com) and [@doe99][ref].

[ref]: https://example.com

Bracketed prose [see the appendix], an address [mail me@example.com], a bare @doe99, an escaped
[\@doe99], an empty item [@doe99;], an empty key [@{}], an unclosed [@doe99, and code `[@doe99]` stay
text.

An affix whose delimiter does not pair stays text: [@doe99, *p. 3].

An affix that holds math stays text, and the math renders: [@doe99, $x$].

A group across a hard break stays text [see @doe99,\
p. 3].
