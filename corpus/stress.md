# Parser Stress Cases

## Long backtick runs

```````````````` code containing ``````````````` backticks ````````````````

## Long emphasis runs

************alpha************

____________beta____________

***alpha **beta *gamma* beta** alpha***

## Deep container nesting

> 1. level one
>    - level two
>      > level three
>      >
>      > 1. level four
>      >    - level five
>      >      > level six
>      >      >
>      >      > - level seven
>      >      >   1. level eight

## Dense inline nesting

[**Strong with *emphasis, `code`, ~~strike, ![image](./assets/leaf.svg), and a reference[^dense]~~***](destination(one(two)).md "Dense title")

[^dense]: Footnote content with [another link](other.md) and `code`.

## Wide table

| 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 |
| --: | :-: | :-- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a | b | c | d | e | f | g | h | i | j | k | l |
| `1` | **2** | *3* | ~~4~~ | [5](five.md) | 6\|six | 7 | 8 | 9 | 10 | 11 | 12 |

## Dense punctuation

!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~ ¡¿«»—…、。〈〉《》「」『』【】

## Link destination nested to 32 levels

[depth](((((((((((((((((((((((((((((((((leaf)))))))))))))))))))))))))))))))))

## Link destination nested to 33 levels

[depth]((((((((((((((((((((((((((((((((((leaf))))))))))))))))))))))))))))))))))
