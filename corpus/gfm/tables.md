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

| A | B |
| --- |
| one | two |

## Another block construct terminates the table

| A | B |
| --- | --- |
| one | two |
> A blockquote interrupts the table.
