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
