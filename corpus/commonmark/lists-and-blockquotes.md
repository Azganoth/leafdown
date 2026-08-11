# Lists and Blockquotes

## Lazy blockquote continuation

> First quoted line
lazy continuation without another marker
>
> Final quoted paragraph.

## Lazy continuation cannot begin a new block

> Quoted paragraph before a heading
# heading outside the quote

> Quoted paragraph before a list
- list item outside the quote

## Nested blockquotes and lists

> Outer quote
>
> > Inner quote with **strong text**.
> >
> > - Inner list item

## Bullet-marker forms

- Hyphen item
- Second hyphen item

+ Plus item starts another list

* Asterisk item starts another list

## Ordered-marker forms

3. Starts at three
8. Subsequent source numbers do not set new starts

4) Parenthesis delimiter starts another list
5) Another item

## List interruption of paragraphs

An unordered list may interrupt this paragraph:
- item

An ordered list beginning with one may interrupt:
1. item

An ordered list beginning with two does not interrupt:
2. remains paragraph text

## Tight lists

- alpha
- beta
  - nested one
  - nested two
- gamma

## Loose lists

- First item paragraph.

  Second paragraph in the first item.

- Second item paragraph.

## Mixed nested lists

1. Ordered outer item
   - Bullet child
     > Quote inside the child
     >
     > ```
     > fenced code in the quote
     > ```
2. Final outer item

## Empty list items

* first
*
* third

## A list item can begin with a blank line

-
  content on the line after the marker

## An empty list item cannot interrupt a paragraph

A paragraph that
-
continues instead of becoming a list.

## Marker-padding boundaries

- one space
-  two spaces
-   three spaces
-    four spaces
-     five spaces changes the content indentation boundary

## Ordered-marker digit limit

123456789. nine digits form an ordered-list marker

1234567890. ten digits remain paragraph text
