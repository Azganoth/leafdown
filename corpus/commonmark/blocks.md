# Block Structure

## Block structure takes precedence over inline parsing

- `one
- two`

## Asterisks, hyphens, and underscores form thematic breaks

***

---

_ _ _

## Too few or unsupported markers remain text

**

--

++ +

## ATX headings accept one through six levels

# Level one #
### Level three ###
###### Level six ######

## ATX headings require valid spacing and depth

#no separator
####### seven hashes
    # indented as code

## Escaped block markers remain paragraph text

\# not a heading

\* not a list item

1\. not an ordered list item

## Setext underlines form level-one and level-two headings

Level one
=========

Level two with *inline content*
--------------------------------

## A Setext underline takes precedence after paragraph text

Paragraph becomes a heading
---

---

## Definitions resolve full reference links

[garden]: /plots/garden "Garden title"
[field report]: <field-report.md>
    'Field report title'

Open the [garden] and [field report].

## Duplicate reference definitions

[same]: /first
[same]: /second

Use the [same] reference after both definitions.

## Malformed reference definitions

[missing destination]:
[unclosed destination]: <garden.md
[unclosed title]: garden.md "title

Use [missing destination] after the malformed definitions.

## Blank lines separate paragraphs

First paragraph
continues on the next nonblank line.



Second paragraph after several blank lines.
