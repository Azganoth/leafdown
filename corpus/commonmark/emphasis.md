# Emphasis and Strong Emphasis

## Asterisk delimiters

*emphasis* and **strong emphasis** and ***both together***.

## Underscore delimiters

_emphasis_ and __strong emphasis__ and ___both together___.

## Intraword asterisks can delimit emphasis and strong emphasis

foo*bar*baz and foo**bar**baz use intraword delimiters.

## Intraword underscores remain literal

garden_sensor_name, foo_bar_baz, and foo__bar__baz remain textual, while garden _sensor_ name is emphasized.

## Whitespace and punctuation boundaries

* open* and *close * remain literal.

(*punctuation*) and _“Unicode punctuation”_ can delimit emphasis.

(__strong next to punctuation__) can delimit strong emphasis.

* nonbreaking spaces * remains literal.

## Empty delimiter candidates remain literal

Empty candidates: **, __, ****, and ____.

## Opening-only and closing-only emphasis delimiters

*opening-only asterisk emphasis

closing-only asterisk emphasis*

_opening-only underscore emphasis

closing-only underscore emphasis_

## Opening-only and closing-only strong emphasis delimiters

**opening-only asterisk strong emphasis

closing-only asterisk strong emphasis**

__opening-only underscore strong emphasis

closing-only underscore strong emphasis__

## Incomplete combined emphasis and strong emphasis

***opening-only asterisk combination

closing-only asterisk combination***

***asterisk combination missing one closer**

**asterisk combination with one extra closer***

___opening-only underscore combination

closing-only underscore combination___

___underscore combination missing one closer__

__underscore combination with one extra closer___

## Mismatched delimiter characters remain literal

*asterisk opens but underscore closes_

_underscore opens but asterisk closes*

**asterisks open but underscores close__

__strong opens but asterisks close**

***asterisks open a combination but underscores close___

___underscores open a combination but asterisks close***

## Escaped opening delimiters prevent emphasis

\*not emphasis*

\*\*not strong emphasis**

\*\*\*not combined emphasis and strong emphasis***

## Rule of three

***alpha** beta*

*alpha **beta***

**alpha *beta***

___alpha__ beta_

_alpha __beta___

__alpha _beta___

## Unequal delimiter runs leave unused markers

***text*

***text**

## Matching delimiter characters can nest

*outer *inner* outer*

**outer **inner** outer**

## Mixed asterisk and underscore runs

_**text*

_**text**

_**text**_

## Mixed runs in intraword position

foo*__bar_baz

foo*__bar__baz

foo*__bar__*baz
