Field Notes That Show What A Save Changes
=========================================

Every section below names one form and says whether a save rewrites it or keeps
it. Save the document, reopen it, and compare each section against what it
claims. A section that says a save rewrites it and comes back unchanged is a
stale claim in this document; a section that says a save keeps it and comes back
changed is a defect in the editor. Each section names the issue, decision, or
specification that owns its form, so the two can be told apart without measuring
the corpus.

## Indented code

A save keeps this. The code block retains its authored indented form, as
specified in `docs/specification.md` under Serialization And Output.

The collection step is recorded as an indented block:

    pnpm run collect -- --bed north
    pnpm run report

## Inline-code delimiter length

A save keeps this. The authored backtick run keeps its extra length over the
shortest usable run, as specified in `docs/specification.md` under Inline
Content.

The command ``pnpm run collect`` uses a two-backtick run around content that
needs only one.

## Table cell padding

A save rewrites this. Owned by `Preserve the form a file was written in` in
`docs/decisions.md`, which normalizes a layout computed across a column because
no node owns one. This claim is durable rather than pending.

| Bed       | Latest reading | Working interpretation      |
| :-------- | -------------: | --------------------------- |
| North     |          `31%` | Reposition before rewatering |
| South     |          `42%` | Hold the current plan       |

## Hard break spelling

A save keeps this. The two spaces on the first line and the backslash on the
second remain distinct hard-break spellings, as specified in
`docs/specification.md` under Serialization And Output.

The gauge was read at 08:30.  
The probe was reseated at 08:45.\
The second reading followed at 09:00.

Setext underlines
-----------------

A save keeps this, since issue #316. The underline keeps the length it was
written at, and its character follows the heading's level.

The title above and this heading use Setext underlines. Both carry heading
levels that ATX syntax can also express.

## Emphasis delimiter characters

A save keeps this. The preset's emphasis and strong marks carry the marker they
were authored with, so no Leafdown change was needed.

The _watering schedule_ and the __replacement estimate__ use underscore
delimiters, while the *manual gauge* and the **north bed** use asterisks. Both
pairs carry the same emphasis and strong emphasis.

## Bullet and ordered markers

A save keeps this, since issue #355. An ordered list also keeps the numbers its
items were written with, apart from the first, which is the start the file is
read back with.

+ Spare battery
+ Probe cloth

* Printed layout
* Camera checklist

3. Reposition the north-bed probe.
8. Publish the calibration note.
9. Review the battery estimate.

## Reference links against inline links

A save keeps this, since issue #260. Each reference is written back in the form
it was authored in, with its definition, rather than as an inline copy of the
destination.

The [calibration review][review] and the
[placement decision](../environment/article-navigator/nested/probe-placement.markdown)
point at comparable notes through different link forms.

[review]: ../environment/article-navigator/01-overview.md "Calibration review"

## Selections without a faithful semantic equivalent

This section describes an interaction rather than a form a save decides, so it
makes no claim either way.

Select only the delimiters of **this strong run**, only the destination inside
[this link](../environment/article-navigator/01-overview.md), only the title in
[this titled link](../environment/article-navigator/01-overview.md "Calibration review"),
and only part of this footnote reference[^partial]. Copy each selection and
paste it into a new paragraph.

[^partial]: The reference above is selected partially on purpose.

## Source projection walkthrough

Open this file from the corpus so the local images resolve. For edits, copy the
whole corpus to a temporary folder or make a sibling copy here; preserve relative
asset paths. Use light and dark appearances and check a narrow window as well as
a wide one.

## Adjacent objects

Move the caret from either direction to each junction with no intervening space.
Both objects should project as one source run. Type a separator, leave the run,
and Undo; the neighboring objects should survive.

**strong**_emphasis_

[local report](field-report.md)[technical guide](technical-readme.md)

&copy;&amp;

[^shared][^other]

## Ownership inside formatting

Enter each link from within its label and from the surrounding marked text.
The link owns a caret inside its label; the complete marked fragment owns a
caret in the surrounding text. Leaving without editing preserves the source.

**Before [the *field* report](field-report.md "Field report") after.**

**Marked character &copy; and &nbsp; spacing.**

**Marked footnote[^shared] after text.**

## Images retain their preview

Click each image. Its full source should appear above the retained image.
The linked image projects the complete link and image source together.
Leave each unchanged and check that no edit or dirty state was introduced.

![Standalone leaf](../assets/leaf.svg "Leaf illustration")

[![Linked leaf](../assets/leaf.svg)](field-report.md)

**![Marked leaf](../assets/leaf.svg)**

## Selection and clipboard boundaries

Select across the plain text and formatting in this paragraph: plain before
**strong middle** and plain after. A crossing selection should not become a
single source projection.

Inside [this titled link](field-report.md "Field report"), select only part of
the destination, copy it, and paste into a temporary paragraph. It should stay
literal text. Repeat with only the delimiters of **this strong phrase**.

Select across the boundary between **this marked phrase** and
[the next link](technical-readme.md). Copy as Markdown, paste into a temporary
paragraph, and Undo. Confirm both the selection and the objects remain intact.

[^shared]: A shared projection reference.

[^other]: A neighboring projection reference.

## Blank lines and final newline

A save keeps this, since issue #193. It is what survives rather than a form
chosen between, so it belongs to neither group above.

There are three blank lines after this paragraph, which hold one blank
paragraph that survives a save and reopen, and the file ends without a trailing
blank run.



The last line of the document.
