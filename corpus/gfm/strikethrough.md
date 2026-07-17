# Strikethrough

## One- and two-tilde forms

~single tilde~ and ~~double tilde~~.

## Three tildes remain literal inline text

Inline ~~~three tildes do not strike~~~ remains literal.

## Empty delimiter candidates remain literal

Empty candidates: ~~ and ~~~~ remain literal inline text.

## Opening-only and closing-only tilde delimiters

~opening-only single-tilde strikethrough

closing-only single-tilde strikethrough~

~~opening-only double-tilde strikethrough

closing-only double-tilde strikethrough~~

## Mismatched tilde delimiter lengths

~single tilde opens but double tildes close~~

~~double tildes open but a single tilde closes~

## Whitespace prevents delimiter pairing

~ opening space~ and ~closing space ~ remain literal.

~~ opening space~~ and ~~closing space ~~ remain literal.

## Escaped opening tildes prevent strikethrough

\~not single-tilde strikethrough~

\~\~not double-tilde strikethrough~~

## Strikethrough does not cross a paragraph boundary

This ~~does not cross

a paragraph boundary~~.

## Strikethrough can contain other inline constructs

~~strike with **strong**, *emphasis*, `code`, and [a link](destination.md)~~

**strong containing ~~strikethrough~~**

## Crossing strikethrough and emphasis delimiters

~~**strikethrough opens, strong opens, strikethrough closes~~**

**~~strong opens, strikethrough opens, strong closes**~~
