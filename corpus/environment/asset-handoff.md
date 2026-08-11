# Asset Handoff

## Reading material

- The [field overview](./article-navigator/01-overview.md?mode=edit#reading-summary)
  and [placement decision](./article-navigator/nested/probe-placement.markdown)
  are local Markdown notes.
- The [reference attachment](../assets/reference.txt) is a local non-Markdown file.
- The [missing handoff note](./missing-document.md) is intentionally absent.
- The [contact address](mailto:testing@example.com),
  [remote report](https://example.com/report.md), and
  [unsafe destination](javascript:alert) exercise non-file destinations.
- The [project specification](../../docs/specification.md) resolves outside the
  corpus folder context.

## Shared images

![Local SVG](../assets/leaf.svg)

![Local PNG with spaces and parentheses](<../assets/icon with spaces (v1).png>)

- ![Missing map](<../assets/missing image.png>)
- ![Remote image](https://example.com/image.png)
- ![Protocol-relative image](//example.com/image.png)
- ![Unsupported bitmap](../assets/unsupported.bmp)
- ![Outside icon](../../src-tauri/icons/128x128.png)

## Raw HTML embeds

<img src="../assets/leaf.svg" alt="Raw HTML image" />

<video src="./missing-clip.mp4" controls></video>

<audio src="./missing-tone.mp3" controls></audio>

<iframe src="./article-navigator/01-overview.md"></iframe>

<embed src="../../docs/specification.md" type="application/pdf" />
