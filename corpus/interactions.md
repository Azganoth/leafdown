# Syntax Interactions

## Links, emphasis, code spans, and autolinks

*[the link wins over the emphasis run*](destination.md) and [a backtick (`)](destination.md).

`[not a link](destination.md)` and <https://example.com/*not-emphasis*>.

## Escapes and character references vary by context

Text: \*literal asterisks\* and &copy;.

Code: `\*asterisks\* &copy;`.

[Destination](folder\(one\)/f&ouml;&ouml;.md "ti\*tle &copy;").

``` language\+one&copy;
\*asterisks\* &copy;
```

## Link labels can contain mixed inline content

[**strong**, *emphasis*, ~~strikethrough~~, `code`, ![image](./assets/leaf.svg), and a footnote[^note]](destination.md "Mixed label")

[^note]: A nonstandard footnote nested in a core link candidate.

## Containers can contain leaf blocks

> ## Heading inside a quote
>
> 1. List inside the quote
>    - Nested bullet
>
>    ```text
>    fenced code inside the list
>    ```
>
> [quoted leaf]: destination.md
>
> Use the [quoted leaf].

## Table cells can contain inline constructs

| Emphasis | Link | Code | Strike | Image |
| --- | --- | --- | --- | --- |
| *leaf* | [garden](destination.md) | `a\|b` | ~~old~~ | ![leaf](./assets/leaf.svg) |

## Task lists can nest inside containers

> - [x] Quoted task
>   1. [ ] Ordered nested task
>      - [x] Deep bullet task with **strong text**

## Reference definitions can appear in containers

> Quoted [reference].
>
> [reference]: quoted.md

- List item with [another reference].

  [another reference]: listed.md

## Line breaks can cross inline markup boundaries

**Strong content with a soft
line ending.**

~~Strikethrough with a hard break  
inside it.~~

[A link with a backslash break\
inside it](destination.md).

## Optional extensions can collide with core syntax

---
title: Frontmatter or thematic content
---

Term
: definition or paragraph continuation

> [!NOTE]
> alert or ordinary blockquote

:::note
directive or ordinary punctuation
:::

## An unclosed fence ends with its containing block

> Quoted paragraph before a fence.
>
> ```
> The fence has no explicit closing marker.

This paragraph remains outside the blockquote and fenced code block.

## Nested blocks collapse independently

The list, quote, and callout each hold a 10-line block. Expanding one must leave the others alone, while the document-wide expand toggle acts on all of them.

- A list item containing code.

  ```text
  listed line 01
  listed line 02
  listed line 03
  listed line 04
  listed line 05
  listed line 06
  listed line 07
  listed line 08
  listed line 09
  listed line 10
  ```

> A quote containing code.
>
> ```text
> quoted line 01
> quoted line 02
> quoted line 03
> quoted line 04
> quoted line 05
> quoted line 06
> quoted line 07
> quoted line 08
> quoted line 09
> quoted line 10
> ```

> [!NOTE]
> A callout containing code.
> ```text
> callout line 01
> callout line 02
> callout line 03
> callout line 04
> callout line 05
> callout line 06
> callout line 07
> callout line 08
> callout line 09
> callout line 10
> ```
