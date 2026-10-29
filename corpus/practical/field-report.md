# Community Garden Sensor Pilot

## Week 4 field report

The south-bed sensors held their target range through the first dry week. A
_temporary_ watering schedule became **necessary** only after the evening
readings drifted, and the ***calibration review*** confirmed that the probes
were still healthy.[^calibration]

The team used [the **sensor calibration** *review* notes](../environment/article-navigator/01-overview.md "Calibration review")
to compare the new probes with the earlier manual readings. The old estimate is
now ~~superseded~~, while the revised watering threshold remains under review.

> “The readings are useful when they tell us when _not_ to water.”
>
> > “Start with the north bed, then leave the south-bed schedule alone unless
> > the manual gauge disagrees.”
> >
> > — coordinator's reply
>
> — Mara, garden volunteer

### What changed

1. Reposition the north-bed probe before the next rain.
2. Publish the short calibration note for the volunteer team.
3. Review the replacement-battery estimate with the coordinator.

The kit is grouped by the volunteer who will use it:

- Measurement supplies
  - Spare battery and probe cloth
  - Manual moisture gauge
- Handoff material
  - Printed layout
  - Camera checklist

- [x] Record the first week of readings.
- [x] Compare the new probe against the manual gauge.
- [ ] Move the north-bed probe.
  - [ ] Photograph the mounting point.
  - [ ] Add the final location to the map.

### Reading summary

| Bed | Latest reading | Working interpretation |
| :-- | :------------: | ---------------------- |
| North | `31%` | Reposition the probe before changing the schedule. |
| South | `42%` | Keep the current plan through Friday. |
| Herbs | `38%` | Ask for one more manual reading. |

### Implementation note

```typescript
interface Reading {
  bed: string;
  moisture: number;
}

const needsFollowUp = ({ moisture }: Reading) => moisture < 35;
```

![Garden project leaf](../assets/leaf.svg)

---

## Next visit

The next visit is scheduled for Tuesday morning. The team will bring one spare
battery, the printed layout, and the notes from the [placement decision](../environment/article-navigator/nested/probe-placement.markdown).

[^calibration]: The south-bed probe was checked against the manual gauge at
    08:30. The readings differed by less than two percentage points.

## Navigation and folding walkthrough

1. Hover the outline dots, then move over its titles. Use [the large mixed document](large-document.md) in a short window to check overflow: its edges fade where more headings lie beyond them; moving over the dots scrolls it, while the titles hold still for choosing.
2. Tab into the outline. Use Up, Down, Home, End, Enter, and Escape. Choosing a heading puts the caret at that heading; Escape returns focus without editing.
3. Choose each of the two `Calibration` headings. Each must reach its own numbered paragraph rather than the first matching label.
4. Change the outline level limit to H6 and inspect the skipped levels and headings inside containers. Restore your preferred level afterward. List, quote, and callout headings identify their container in their tooltip and accessible name.
5. Fold `Foldable parent` and choose `Hidden child` in the outline. Navigation unfolds the containing section. Fold the child and parent separately, then unfold the parent: check that the child's independent fold is retained.
6. Scroll to the final screen and choose the final callout heading. The view stops at the document's end without losing the selected heading. Open Find and repeat navigation; headings should stay clear of the search panel.
7. In a scratch copy, rename a heading, change its level, and Undo/Redo. The outline must follow the document. Return to the original to compare without saving edits.

## Calibration

Calibration destination one. This section describes the north bed. Selecting the first matching outline row should land here.

## Calibration

Calibration destination two. This section describes the south bed. Selecting the second matching outline row should land here.

## Foldable parent

The parent owns the following H3 section until the next heading at its own level.

### Hidden child

Fold the child independently before folding its parent. Choosing the child in the outline should reveal the section needed to reach its heading.

#### Deeper observation

This fourth-level heading remains associated with its enclosing section while it is excluded by the default outline level limit.

## Skipped heading levels

An H5 follows this H2 without intervening H3 or H4 headings.

##### Deep measurement

The hierarchy must use the authored levels rather than inventing missing headings.

###### Deepest measurement

This H6 remains reachable when all heading levels are listed.

## A deliberately long heading describing the north garden calibration procedure and the measurements that must remain distinguishable in a narrow outline

Inspect the long label at a narrow width. Its text must remain identifiable without displacing the editor's content.

## Headings inside containers

> ### Quoted observation
>
> The quoted heading has a container-qualified outline name.

- ### Listed observation

  The listed heading belongs to this item.

> [!NOTE]
> ### Callout observation
> The callout heading has its own container-qualified outline name.
