# Definition Lists

## Colon-style definitions

CommonMark
: A strongly specified Markdown dialect.

GFM
: A CommonMark superset with formal extensions.
: A dialect used by GitHub.

## Tilde-style definitions

Corpus
~ A collection of focused test documents.

## Loose term and authored marker spacing

Single-line term

   ~  One definition after a blank line, with authored spacing.

Another definition
: First definition with a lazy
continuation line.
: Second definition for the same term.

## Blocks inside a definition

Container term
: First paragraph of a multi-block definition.

  Second paragraph under the same definition.

  - A nested list item.

  > A nested blockquote.

  ```text
  A fenced code block.
  ```

  Nested term
  : Nested definition.

## Ordinary Markdown candidates

Two consecutive terms
do not share a definition
: This remains ordinary Markdown.

Missing marker whitespace
:This remains ordinary Markdown.

Marker indented four spaces
    : This remains ordinary indented content.
