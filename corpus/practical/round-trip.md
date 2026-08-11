Field Notes That Change Shape When Saved
========================================

Every section below is written in a form the editor is expected to normalize.
Save the document, reopen it, and compare each section against this description.
A difference named here is intended; a difference that is not named here is not.

Setext Underlines
-----------------

The title above and this heading use Setext underlines. Both carry heading
levels that ATX syntax can also express.

## Emphasis delimiter characters

The _watering schedule_ and the __replacement estimate__ use underscore
delimiters, while the *manual gauge* and the **north bed** use asterisks. Both
pairs carry the same emphasis and strong emphasis.

## Bullet and ordered markers

+ Spare battery
+ Probe cloth

* Printed layout
* Camera checklist

3. Reposition the north-bed probe.
8. Publish the calibration note.
9. Review the battery estimate.

## Indented code

The collection step is recorded as an indented block:

    pnpm run collect -- --bed north
    pnpm run report

## Inline-code delimiter length

The command ``pnpm run collect`` uses a two-backtick run around content that
needs only one.

## Reference links against inline links

The [calibration review][review] and the
[placement decision](../environment/article-navigator/nested/probe-placement.markdown)
point at comparable notes through different link forms.

[review]: ../environment/article-navigator/01-overview.md "Calibration review"

## Table cell padding

| Bed       | Latest reading | Working interpretation      |
| :-------- | -------------: | --------------------------- |
| North     |          `31%` | Reposition before rewatering |
| South     |          `42%` | Hold the current plan       |

## Hard break spelling

The gauge was read at 08:30.  
The probe was reseated at 08:45.\
The second reading followed at 09:00.

## Selections without a faithful semantic equivalent

Select only the delimiters of **this strong run**, only the destination inside
[this link](../environment/article-navigator/01-overview.md), only the title in
[this titled link](../environment/article-navigator/01-overview.md "Calibration review"),
and only part of this footnote reference[^partial]. Copy each selection and
paste it into a new paragraph.

[^partial]: The reference above is selected partially on purpose.

## Blank lines and final newline

There are three blank lines after this paragraph and the file ends without a
trailing blank run.



The last line of the document.
