# Garden Sensor Toolkit

The toolkit turns field readings into a short report that volunteers can review
without installing the collection software.

## Requirements

- Node.js 24 or newer
- `pnpm` available on the command line
- A checkout containing:
  - `readings/` for source data
  - `reports/` for generated Markdown

## Setup

```sh
pnpm install
pnpm run collect -- --bed north
pnpm run report > reports/latest.md
```

Use `` pnpm run `preview` `` when the preview preset itself contains backticks.
The [reference attachment](../assets/reference.txt) records the expected input
shape, while the [field overview](../environment/article-navigator/01-overview.md)
explains the expected readings.

## Commands

| Command | Purpose | Writes files |
| --- | --- | :---: |
| `pnpm run collect` | Read the connected probe | No |
| `pnpm run report` | Generate the current summary | Yes |
| `pnpm test` | Check conversion rules | No |

> Run collection once per bed. Repeated readings should be recorded as separate
> entries rather than replacing the original measurement.

## Troubleshooting

1. Confirm that the probe appears in the operating-system device list.
2. Run the collection command with `--verbose`.
3. Compare the result with the [placement decision](../environment/article-navigator/nested/probe-placement.markdown).

If the command prints `reading: null`, preserve the log and do **not** invent a
replacement value.
