# Autolink Literals

## WWW and scheme-prefixed URLs are recognized

www.example.com/path

www.localhost

https://example.com/path

http://example.com

## Email addresses are recognized

testing@example.com and first.last+tag@example.co.uk

## Left-context punctuation controls recognition

(www.example.com) *https://example.com* _www.example.org_ ~www.example.net~

prefixwww.example.com

## Trailing punctuation is excluded from the link

Visit https://example.com/one, https://example.com/two. and (https://example.com/three).

Balanced path: https://example.com/a(b)c and unmatched path: https://example.com/a(b)).

## Invalid domains remain literal

www.example_.com

https://example.invalid_path

name@example
