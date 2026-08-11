# Links, Images, and Autolinks

## Angle brackets recognize URI and email autolinks

<https://example.com/releases/2026-06>

<mailto:testing@example.com>

<testing@example.com>

<testing@example>

## URI schemes have length and character boundaries

<a:too-short>

<ab:minimum>

<abcdefghijklmnopqrstuvwxyzabcdef:thirty-two>

<abcdefghijklmnopqrstuvwxyzabcdefg:thirty-three>

## Extra angle brackets preserve an inner autolink

<<https://example.com>>

## Malformed angle-bracket forms remain literal

<https://example.com path>

<>

<foo.bar.baz>

<data:text/html,<script>alert(1)</script>>

<https://example.com

## Script-like and data schemes are ordinary destinations

<javascript:alert(1)>

<data:text/plain,alert>

[Inline script scheme](javascript:alert(1))

[Data destination](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)

[Entity-obfuscated scheme](&#106;avascript&#58;alert&lpar;1&rpar;)

![Data image](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=)

## Inline and reference image forms

[leaf]: ../assets/leaf.svg "Leaf"

![Inline leaf](../assets/leaf.svg "Inline")

![Inline path with spaces](<../assets/icon with spaces (v1).png>)

![Reference leaf][leaf]

![Alt with *emphasis* and `code`](../assets/leaf.svg)

## Linked and nested images

[![Linked leaf](../assets/leaf.svg)](https://example.com)

![Outer ![inner](../assets/leaf.svg)](../assets/leaf.svg)

## Absolute, relative, and empty link destinations

[Absolute](https://example.com/path) and [relative](./blocks.md).

[Empty destination]() and [angle destination](<folder name/file.md>).

## Quoted and parenthesized link titles

[Double quote](garden.md "Garden")
[Single quote](garden.md 'Garden')
[Parentheses](garden.md (Garden))

## Balanced and unbalanced destination parentheses

[Balanced](garden(section(one)).md)

[Escaped](garden\(section\).md)

[Unbalanced](garden(section.md)

## Full, collapsed, and shortcut reference links

[garden report]: /garden "Report"

[Full reference][garden report]

[garden report][]

[garden report]

## Reference-label normalization

[Normalized   Report]: /normalized

[normalized report] and [NORMALIZED REPORT] and [normalized
report].

## Unclosed link and image labels

[unclosed link label

![unclosed image label

## Unclosed link and image destinations

[missing destination](

[angle destination](<destination.md)

![missing image destination](

![angle image destination](<image.png)

## Unclosed link titles

[double-quoted title](garden.md "unclosed)

[single-quoted title](garden.md 'unclosed)

[parenthesized title](garden.md (unclosed)

![unclosed image title](garden.png "unclosed)

## Incomplete and unresolved reference links

[missing destination]

[full reference][unclosed

[collapsed reference][

![reference image][unclosed

![collapsed reference image][

## Escaped link syntax remains literal

\[intentionally literal](garden.md)

## Nested links

[outer [inner](inner.md) text](outer.md)

[outer *emphasis* and `code`](outer.md)
