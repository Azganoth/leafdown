# Code Blocks and Spans

## Four spaces create an indented code block

    alpha
      beta

## Indented code cannot interrupt a paragraph

This paragraph starts normally.
    Four spaces do not interrupt an existing paragraph.

## Backtick and tilde fences delimit code blocks

```typescript
const leaf = true;
```

~~~
tilde fence
~~~

## A shorter run does not close a fence

````
The next run is too short to close.
```
Still code.
````

## Info-string rules differ between backtick and tilde fences

``` language+escaped
valid backtick info string
```

~~~ language`with-backtick
valid tilde info string
~~~

## Three leading spaces open a fence while four create indented code

   ```
   three leading spaces still open a fence
   ```

    ```
    four leading spaces form indented code instead
    ```

## Matching runs allow embedded backticks

`plain code` and ``code with a ` backtick`` and ```code with `` two```.

## One edge space is stripped from each side

`  padded  `

## Interior spaces remain unchanged

`multiple   internal   spaces`

## All-space code spans keep their spaces

`  `

## Unicode whitespace is not stripped

` nonbreaking `

## Code spans may contain line endings

`alpha
beta`

## Opening-only and closing-only backtick sequences

Opening-only one: `code

Closing-only one: code`

Opening-only two: ``code

Closing-only two: code``

Opening-only three: ```code

Closing-only three: code```

## Mismatched backtick sequence lengths remain literal

One opens but two close: `code``

Two open but one closes: ``code`

Two open but three close: ``code```

Three open but two close: ```code``

## An escaped opening backtick prevents a code span

\`not code`
