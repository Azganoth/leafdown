# Tables

## A header and delimiter row form a table

| Bed | Moisture |
| --- | --- |
| North | 31% |
| South | 42% |

## Alignment markers and outer pipes are optional

Bed | Reading | Action
:--- | :-----: | -----:
North | 31% | Move
South | 42% | Hold

## Escaped pipes remain inside cells

| Form | Value |
| --- | --- |
| escaped | alpha\|beta |
| code | `alpha\|beta` |
| strong | **alpha\|beta** |

## Ragged body rows are padded or truncated

| A | B |
| --- | --- |
| one |
| two | three | ignored |

## Header and delimiter cell counts must match

| Header | Cells |
| --- |
| the count mismatch prevents a table | so these lines stay paragraph text |

## A header and delimiter row without body rows

Tab through this table, then insert its first body row in a scratch copy.

| Header only | No body rows |
| --- | --- |

## Pipe rows without a delimiter row

| No delimiter row | so these lines |
| stay paragraph text | with literal pipes |

## Cell splitting precedes inline parsing

| Form | First cell | Second cell |
| --- | --- | --- |
| an unescaped pipe splits first | `code opens | never closes` |

## Tables can appear inside containers

The tables retain their own controls inside these narrower containers. Edit a
scratch copy and check that the cells and controls stay reachable.

- | Bed | Moisture |
  | --- | --- |
  | North | A listed table retains its own controls and stays inside this item during edits. |

> | Bed | Moisture |
> | --- | --- |
> | South | A longer explanation inside a narrower container should remain reachable without making surrounding prose scroll sideways. |

## Another block construct terminates the table

| A | B |
| --- | --- |
| one | two |
> A blockquote interrupts the table.

Use a narrow window to make this eight-column table overflow horizontally. The surrounding prose should continue to wrap within the document. Repeat in a wide window and in both appearances.

## Table layout and controls in Leafdown

1. Scroll the table sideways and the document vertically. Row and column grips, insertion boundaries, and the table popup should remain aligned with their cells and reachable near the viewport edges.
2. Inspect the long prose and unbroken identifier. Text must remain accessible, and rows with wrapped content should keep their cells aligned.
3. In a scratch copy, select a row and a column from their grips, insert at a boundary, and reorder by dragging. Check the first and last rows and columns as well as an interior one.
4. Change a column's alignment, save, and reopen. Check the delimiter row and the rendered alignment. Undo edits before continuing a different case.
5. Move between cells with Tab and Shift+Tab, including the last cell. Check focus and the caret after inserting or removing a row.

## Mixed-height readings

| Bed | Time | Moisture | Status | Observation | Token | Follow-up | Owner |
| :--- | :---: | ---: | :--- | :--- | :--- | :--- | :--- |
| Bed 01 | 08:01 | 30% | Ready | A deliberately long observation records the probe position, the preceding rainfall, and the manual comparison so this cell wraps onto several rows at narrow widths. | `probe-01` | Reposition before the next reading and record the changed depth. | みどり |
| Bed 02 | 08:02 | 31% | **Review** | Reading 02 agrees with the manual gauge. | sensor_north_bed_unbroken_identifier_unbroken_identifier_unbroken_identifier_unbroken_identifier_unbroken_identifier_unbroken_identifier_unbroken_identifier_unbroken_identifier_unbroken_identifier_unbroken_identifier_unbroken_identifier_unbroken_identifier_end | Inspect tomorrow | João |
| Bed 03 | 08:03 | 32% | Ready | Reading 03 agrees with the manual gauge. | `probe-03` | Inspect tomorrow | みどり |
| Bed 04 | 08:04 | 33% | **Review** | Reading 04 agrees with the manual gauge. | `probe-04` | Reposition before the next reading and record the changed depth. | João |
| Bed 05 | 08:05 | 34% | Ready | A deliberately long observation records the probe position, the preceding rainfall, and the manual comparison so this cell wraps onto several rows at narrow widths. | `probe-05` | Inspect tomorrow | みどり |
| Bed 06 | 08:06 | 35% | **Review** | Reading 06 agrees with the manual gauge. | `probe-06` | Inspect tomorrow | João |
| Bed 07 | 08:07 | 36% | Ready | Reading 07 agrees with the manual gauge. | `probe-07` | Reposition before the next reading and record the changed depth. | みどり |
| Bed 08 | 08:08 | 37% | **Review** | Reading 08 agrees with the manual gauge. | `probe-08` | Inspect tomorrow | João |
| Bed 09 | 08:09 | 38% | Ready | A deliberately long observation records the probe position, the preceding rainfall, and the manual comparison so this cell wraps onto several rows at narrow widths. | `probe-09` | Inspect tomorrow | みどり |
| Bed 10 | 08:10 | 39% | **Review** | Reading 10 agrees with the manual gauge. | `probe-10` | Reposition before the next reading and record the changed depth. | João |
| Bed 11 | 08:11 | 40% | Ready | Reading 11 agrees with the manual gauge. | `probe-11` | Inspect tomorrow | みどり |
| Bed 12 | 08:12 | 41% | **Review** | Reading 12 agrees with the manual gauge. | `probe-12` | Inspect tomorrow | João |
| Bed 13 | 08:13 | 42% | Ready | A deliberately long observation records the probe position, the preceding rainfall, and the manual comparison so this cell wraps onto several rows at narrow widths. | `probe-13` | Reposition before the next reading and record the changed depth. | みどり |
| Bed 14 | 08:14 | 43% | **Review** | Reading 14 agrees with the manual gauge. | `probe-14` | Inspect tomorrow | João |
| Bed 15 | 08:15 | 44% | Ready | Reading 15 agrees with the manual gauge. | `probe-15` | Inspect tomorrow | みどり |
| Bed 16 | 08:16 | 45% | **Review** | Reading 16 agrees with the manual gauge. | `probe-16` | Reposition before the next reading and record the changed depth. | João |
| Bed 17 | 08:17 | 46% | Ready | A deliberately long observation records the probe position, the preceding rainfall, and the manual comparison so this cell wraps onto several rows at narrow widths. | `probe-17` | Inspect tomorrow | みどり |
| Bed 18 | 08:18 | 47% | **Review** | Reading 18 agrees with the manual gauge. | `probe-18` | Inspect tomorrow | João |
| Bed 19 | 08:19 | 48% | Ready | Reading 19 agrees with the manual gauge. | `probe-19` | Reposition before the next reading and record the changed depth. | みどり |
| Bed 20 | 08:20 | 49% | **Review** | Reading 20 agrees with the manual gauge. | `probe-20` | Inspect tomorrow | João |
| Bed 21 | 08:21 | 50% | Ready | A deliberately long observation records the probe position, the preceding rainfall, and the manual comparison so this cell wraps onto several rows at narrow widths. | `probe-21` | Inspect tomorrow | みどり |
| Bed 22 | 08:22 | 51% | **Review** | Reading 22 agrees with the manual gauge. | `probe-22` | Reposition before the next reading and record the changed depth. | João |
| Bed 23 | 08:23 | 52% | Ready | Reading 23 agrees with the manual gauge. | `probe-23` | Inspect tomorrow | みどり |
| Bed 24 | 08:24 | 53% | **Review** | Reading 24 agrees with the manual gauge. | `probe-24` | Inspect tomorrow | João |
| Bed 25 | 08:25 | 54% | Ready | A deliberately long observation records the probe position, the preceding rainfall, and the manual comparison so this cell wraps onto several rows at narrow widths. | `probe-25` | Reposition before the next reading and record the changed depth. | みどり |
| Bed 26 | 08:26 | 55% | **Review** | Reading 26 agrees with the manual gauge. | `probe-26` | Inspect tomorrow | João |
| Bed 27 | 08:27 | 56% | Ready | Reading 27 agrees with the manual gauge. | `probe-27` | Inspect tomorrow | みどり |
| Bed 28 | 08:28 | 57% | **Review** | Reading 28 agrees with the manual gauge. | `probe-28` | Reposition before the next reading and record the changed depth. | João |
| Bed 29 | 08:29 | 58% | Ready | A deliberately long observation records the probe position, the preceding rainfall, and the manual comparison so this cell wraps onto several rows at narrow widths. | `probe-29` | Inspect tomorrow | みどり |
| Bed 30 | 08:30 | 59% | **Review** | Reading 30 agrees with the manual gauge. | `probe-30` | Inspect tomorrow | João |
| Bed 31 | 08:31 | 60% | Ready | Reading 31 agrees with the manual gauge. | `probe-31` | Reposition before the next reading and record the changed depth. | みどり |
| Bed 32 | 08:32 | 61% | **Review** | Reading 32 agrees with the manual gauge. | `probe-32` | Inspect tomorrow | João |

## After the wide table

This paragraph should fit the document width even after the table has been scrolled to its right edge.
