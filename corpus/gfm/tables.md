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
