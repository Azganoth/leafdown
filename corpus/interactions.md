# Syntax Interactions

## Links, emphasis, code spans, and autolinks

*[a link*](destination.md) and [a backtick (`)](destination.md).

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
