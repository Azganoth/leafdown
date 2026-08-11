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

## A header and delimiter row without body rows

| Bed | Moisture |
| --- | --- |

## Pipe rows without a delimiter row

| Bed | Moisture |
| North | 31% |

## Cell splitting precedes inline parsing

| Form | Value |
| --- | --- |
| unescaped in code | `alpha|beta` |

## Tables can appear inside containers

- | Bed | Moisture |
  | --- | --- |
  | North | 31% |

> | Bed | Moisture |
> | --- | --- |
> | South | 42% |

## Another block construct terminates the table

| A | B |
| --- | --- |
| one | two |
> A blockquote interrupts the table.
