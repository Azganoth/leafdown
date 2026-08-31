# Text, Characters, and Line Breaks

## Unicode text

Greek: χρῆν. Combining: é and é. Emoji: 🌿 👩🏽‍💻. RTL: العربية.

## Backslash escapes

\!\"\#\$\%\&\'\(\)\*\+\,\-\.\/\:\;\<\=\>\?\@\[\\\]\^\_\`\{\|\}\~

## Non-escapable characters retain the backslash

\A \a \3 \φ \« and backslash-space: \ followed.

## Valid character references

&copy; &#169; &#xA9; &AElig; &#0;

## Invalid character references

&copy &MadeUpEntity; &#; &#x; &#12345678; &#x1234567;

## Character references do not create Markdown structure

&#35; not a heading

&#42;not emphasis&#42;

&#42; not a list item

## Internal spaces

Multiple     internal     spaces stay inside this paragraph.

## Tab boundaries

#	Heading after a tab separator

*	*	*	

>		quoted tab-stop content

-		list item with tab indentation

- parent

	- child indented by a tab

## Hard breaks using spaces

Two spaces follow this line.  
This line follows the break.

Three spaces follow this line.   
This line follows the second break.

## Trailing whitespace that does not create a hard break

One space follows this line. 
This line continues the same paragraph.

Two spaces follow the end of this paragraph.  

## Trailing whitespace a parse keeps

A no-break space ends this paragraph. 

An em space ends this paragraph. 

An ideographic space ends this paragraph.　

### A no-break space ends this heading 

- A no-break space ends this list item. 

> A no-break space ends this quote. 

A no-break space follows the space that ends this paragraph.  

A no-break space precedes the space that ends this paragraph.  

## Hard breaks using a backslash

A backslash follows this line.\
This line follows the break.

## Soft breaks

This line ends normally.
This line continues the paragraph.

## Breaks inside inline constructs

*emphasis with a hard break  
inside it*

[link with a backslash break\
inside it](destination.md)

`code with a line
ending inside it`

## Control-like text remains editable

Literal labels: U+0000 NUL, U+0009 TAB, U+000B VT, U+000C FF, U+000D CR,
U+000A LF, U+001F US, and U+007F DEL.

The exact-byte fixtures contain representative actual code units in isolation.

## Trailing backslash at EOF

The final backslash is at the end of the block and file.\
