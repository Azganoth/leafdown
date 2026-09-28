# Math

## Dollar delimiters

Einstein wrote $E = mc^2$, while prices like $5 and $10, $20,000 and $30,000, and US$5 stay text.

TeX keeps $\{x\}$, $a\,b$, $a \\ b$, and $50\%$ exactly.

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

## Other delimiters shown as source

Inline: `\(a^2 + b^2 = c^2\)`.

```
\[
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
\]
```

## Code spans and escaping prevent math interpretation

Escaped \$x$ and code `$x$` remain distinct from $x$.

Unclosed $x + y remains a boundary case.
