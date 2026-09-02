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

A save rewrites this. Owned by issue #321.

The collection step is recorded as an indented block:

    pnpm run collect -- --bed north
    pnpm run report

## Inline-code delimiter length

A save rewrites this. Owned by `docs/specification.md`, which settles the
canonical backtick run for projection.

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

A save rewrites this, turning a line ending in two spaces into one ending in a
backslash. No issue, decision, or specification owns the class yet, so this
section is the only record of it.

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

## Blank lines and final newline

A save keeps this, since issue #193. It is what survives rather than a form
chosen between, so it belongs to neither group above.

There are three blank lines after this paragraph, which hold one blank
paragraph that survives a save and reopen, and the file ends without a trailing
blank run.



The last line of the document.
