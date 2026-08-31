# Autolink Literals

## WWW and scheme-prefixed URLs are recognized

www.example.com/path

www.localhost

https://example.com/path

http://example.com

## Email addresses are recognized

testing@example.com and first.last+tag@example.co.uk

## Left-context punctuation controls recognition

Parenthesis before the link: (www.example.com)

Asterisk before the link: *https://example.com*

Underscore before the link: _www.example.org_

Tilde before the link: ~www.example.net~

Word character before the link: prefixwww.example.com

## Trailing punctuation is excluded from the link

Visit https://example.com/one, https://example.com/two. and (https://example.com/three).

Balanced path: https://example.com/a(b)c and unmatched path: https://example.com/a(b)).

Entity-shaped run that names nothing: https://example.com&notarealentity;

Run without its semicolon, which the link takes in: https://example.com&copy

Numeric reference, which the link takes in: https://example.com&#62;

## An adjacent angle bracket stays outside the link

Escaped bracket before an email and a plain one after: \<test@example.com>

Character references around a URL: &lt;https://example.com&gt;

Character reference after a URL: https://example.com&gt;

## Invalid domains remain literal

www.example_.com

https://example.invalid_path

name@example
