# Code Blocks and Spans

## Four spaces create an indented code block

    four spaces open the block
      two further spaces stay in the content

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

## The info string's first word is the language and the rest is metadata

```typescript title="leaf.ts"  {1}
const leaf = true;
```

## A backtick in a backtick info string does not open a fence

``` language`with-backtick
the preceding line stays paragraph text rather than opening a code block

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

## Code presentation in Leafdown

Use a fresh open to check the initial collapsed states. Test in light and dark appearances at a narrow and a wide window width. Copy this file into `corpus/scratch/` before editing it; the image-free examples need no folder resources.

## Nine lines stay fully visible

This block has 9 source lines and no per-block expand bar or collapse chevron. Document-wide toggles may still appear because other blocks in this document are long.

```text
source line 01
source line 02
source line 03
source line 04
source line 05
source line 06
source line 07
source line 08
source line 09
```

## Ten lines show eight and hide two

This block has 10 source lines. On opening, expect the first 8 and `Show 2 more lines`. Expand it, then collapse it again from its chevron.

```text
source line 01
source line 02
source line 03
source line 04
source line 05
source line 06
source line 07
source line 08
source line 09
source line 10
```

## A realistic highlighted block exceeds twenty lines

This TypeScript block has 25 source lines, including blank lines. It opens with `Show 17 more lines`. Highlighting and the language badge remain available in either state.

```typescript
interface Reading {
  bed: string;
  moisture: number;
  inspected: boolean;
}

const readings: Reading[] = [
  { bed: "north", moisture: 31, inspected: true },
  { bed: "south", moisture: 42, inspected: false },
  { bed: "herbs", moisture: 38, inspected: true },
];

const summarize = (items: Reading[]) => {
  const inspected = items.filter((item) => item.inspected);
  const dry = inspected.filter((item) => item.moisture < 35);

  return {
    inspected: inspected.length,
    followUp: dry.map((item) => item.bed),
  };
};

const report = summarize(readings);
console.log("Inspected beds:", report.inspected);
console.log("Follow-up beds:", report.followUp.join(", "));
```

## Wrapped rows keep their source-line count

With soft wrap on, narrow the window until lines 7 and 8 wrap. The collapsed preview still contains 8 complete source lines, with one line number per source line. With wrapping off, scroll the code sideways; the surrounding prose must continue to fit the page.

```text
wrapped sample line 01
wrapped sample line 02
wrapped sample line 03
wrapped sample line 04
wrapped sample line 05
wrapped sample line 06
line 07: Before the fade, this deliberately long source line should occupy several visual rows in a narrow window while keeping just one line number; resizing must not change which source lines the collapsed block retains.
line 08: The final visible source line also wraps across several visual rows, and all of those rows belong to the collapsed preview before its bottom fade; the next source line stays hidden until the block expands.
line 09: This long hidden source line becomes visible when ArrowDown leaves the last wrapped row of line eight, when the expand bar is pressed, or when Find selects a match here: WRAPPED-HIDDEN-TARGET.
wrapped sample line 10
wrapped sample line 11
wrapped sample line 12
```

## Blank source lines count too

The empty third and sixth lines count toward this 10-line block. Expect `Show 2 more lines`, with line numbers skipping no source positions.

```text
first line
second line

fourth line
fifth line

seventh line
eighth line
ninth line
tenth line
```

## An unlabeled fence still collapses

This 10-line block has no language. Its faint language control appears on hover or focus, and its collapse controls remain usable.

```
unlabeled line 01
unlabeled line 02
unlabeled line 03
unlabeled line 04
unlabeled line 05
unlabeled line 06
unlabeled line 07
unlabeled line 08
unlabeled line 09
unlabeled line 10
```

## An unknown language keeps its name without highlighting

This tilde fence has 10 lines, an unknown language, and metadata. Changing its language and undoing the change should retain the fence and metadata.

~~~garden-sensor title="raw readings"
unknown language line 01
unknown language line 02
unknown language line 03
unknown language line 04
unknown language line 05
unknown language line 06
unknown language line 07
unknown language line 08
unknown language line 09
unknown language line 10
~~~

## Indented code has no language badge

This indented block has 10 lines and collapses without gaining a fence or a language badge when saved.

    indented line 01
    indented line 02
    indented line 03
    indented line 04
    indented line 05
    indented line 06
    indented line 07
    indented line 08
    indented line 09
    indented line 10

## State and editing walkthrough

1. Reopen the document, then place the caret at the end of the eighth line of the 10-line text block. ArrowRight should expand it to reach the next line; repeat with ArrowDown. For the wrapped sample, moving between wrapped rows above the final row should not expand it.
2. Find `WRAPPED-HIDDEN-TARGET` in the wrapped block. Selecting that result should reveal its line. Close Find, collapse the block, and check that the caret rests on the last shown line.
3. Use `Fold or unfold section` (`Mod+.`) inside a long code block. It toggles the code before considering the heading section.
4. Toggle line numbers, soft wrap, and expand all. Check several blocks; repeat with the nested examples in [Syntax Interactions](../interactions.md#nested-blocks-collapse-independently). None of these view actions should mark the document dirty. Restore your preferred wrap and numbering settings afterward; they also affect other documents.
5. Select all and copy as Markdown while blocks are collapsed. Paste into a scratch document: hidden lines must still be present. An unchanged save and reopen keeps every source line and resets the collapse state.
6. In a scratch copy, grow the nine-line block to ten lines; it should remain expanded. Paste a long block; it also starts expanded. Shorten an existing long block below ten lines; its per-block collapse controls disappear. Undo and Redo the edits and confirm the source is restored.
