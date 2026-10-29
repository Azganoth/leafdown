# Footnotes

## Reference-style footnotes

Reference-style footnote.[^garden]

Text after the reference.

[^garden]: A reference-style footnote definition.

## Multiline definitions

Multiline footnote reference.[^details]

[^details]: First definition paragraph.

    A second paragraph with **inline Markdown** and a [link](destination.md).

    - A nested list item

## Repeated references and case-insensitive labels

First use[^shared], repeated use[^shared], and differently cased use[^SHARED]
resolve to the same definition while retaining their authored label spelling.

## Escapes distinguish labels

The escaped label[^escaped\*label] and the bare label[^escaped*label] name different definitions.

[^escaped\*label]: Definition for the label containing an authored backslash.

[^escaped*label]: Definition for the label without a backslash.

## Preview, navigation, and renaming walkthrough

The first observation[^shared], its repeat[^shared], and the other observation[^other]
allow a rename to be checked across several references. Hover a reference or use
`Mod+Alt+P` to preview its definition. `Mod+click` or `Jump to footnote definition`
moves to the definition without editing the document.

Use `Rename footnote` on a shared reference, enter `renamed`, and leave the label.
Every shared reference should follow the definition; the other references should
remain unchanged. Undo the edit, leave the label again, and confirm the original
name is restored. Try renaming it to `other` or an empty label: neither commits.

Delete the shared definition in a temporary copy. Its existing references should
show a missing-definition preview and offer no jump. Undo restores navigation.
An unresolved label authored in a fresh file, such as [^not-defined], stays
literal text instead of becoming that in-session missing-reference state.

[^shared]: This long definition begins with the first observation and continues far enough to exercise truncation in the one-line preview. The full text must still be reachable by jumping to its body, including **formatted words**, a [local report](../practical/field-report.md), and the final phrase: preview tail reached.

[^other]: A separate definition used to check collision handling during rename.

## Inline footnotes

Inline Pandoc-style footnote.^[Inline footnote text with *emphasis*.]

## Incomplete and unresolved footnotes

Reference with no definition[^missing].

[^unclosed

[^empty]:
