# Math

## Dollar delimiters

Einstein wrote $E = mc^2$, while prices like $5 and $10, $20,000 and $30,000, and US$5 stay text.

TeX keeps $\{x\}$, $a\,b$, $a \\ b$, and $50\%$ exactly.

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

## Rendering

A display span mid-paragraph $$\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$$ keeps display style within its line.

GitHub's backtick form renders without its backticks: $`\sqrt{2}`$.

| Norm   |
| ------ |
| $x\|y$ |

TeX that does not parse keeps its source: $\frac{a$.

Untrusted commands render as inert text: $\href{https://example.com}{link}$, $\url{https://example.com}$, and $\htmlClass{x}{y}$.

$$
\begin{pmatrix}
a_{11} & a_{12} & a_{13} & a_{14} & a_{15} & a_{16} & a_{17} & a_{18} & a_{19} & a_{1,10} & a_{1,11} & a_{1,12} \\
a_{21} & a_{22} & a_{23} & a_{24} & a_{25} & a_{26} & a_{27} & a_{28} & a_{29} & a_{2,10} & a_{2,11} & a_{2,12}
\end{pmatrix}
$$

## Fenced math

```math
\int_0^1 x^2\,dx = \frac{1}{3}
```

~~~math title=equation
\sum_{i=1}^{n} i
~~~

```Math
This is code rather than rendered math.
```

```math
\frac{a
```

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
