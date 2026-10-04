// The exported page is read outside Leafdown, so it carries its own light reading styles rather
// than the application's theme tokens.
export const HTML_EXPORT_STYLESHEET = `
:root {
  color-scheme: light;
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #ffffff;
  color: #1f2328;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  font-size: 16px;
  line-height: 1.6;
  overflow-wrap: break-word;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

main {
  max-width: 48rem;
  margin: 0 auto;
  padding: 2.5rem 1rem 4rem;
}

h1, h2, h3, h4, h5, h6 {
  margin: 1.6em 0 0.6em;
  font-weight: 600;
  line-height: 1.25;
}

h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1em; }
h5 { font-size: 0.875em; }
h6 { font-size: 0.85em; color: #59636e; }

h1, h2 {
  padding-bottom: 0.3em;
  border-bottom: 1px solid #d1d9e0;
}

article > :first-child {
  margin-top: 0;
}

p, blockquote, ul, ol, dl, table, pre, figure, details, aside, .paragraph, .math-display {
  margin: 0 0 1em;
}

a {
  color: #0969da;
}

a:not([href]) {
  color: inherit;
  text-decoration: underline dotted;
}

hr {
  height: 0.25em;
  margin: 1.5em 0;
  border: 0;
  background: #d1d9e0;
}

blockquote {
  padding: 0 1em;
  border-left: 0.25em solid #d1d9e0;
  color: #59636e;
}

ul, ol {
  padding-left: 2em;
}

li + li {
  margin-top: 0.25em;
}

.tight > li > p {
  margin: 0;
}

li > ul, li > ol {
  margin-bottom: 0;
}

.contains-task-list {
  padding-left: 1.5em;
}

.task-list-item {
  list-style: none;
}

.task-list-item > input {
  margin: 0 0.4em 0 -1.3em;
  vertical-align: middle;
}

dt {
  font-weight: 600;
}

dd {
  margin: 0 0 0.5em 1.5em;
}

code, kbd, samp, pre {
  font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.875em;
}

:not(pre) > code {
  padding: 0.15em 0.35em;
  border-radius: 0.375em;
  background: #eff1f3;
}

kbd {
  padding: 0.1em 0.35em;
  border: 1px solid #d1d9e0;
  border-radius: 0.375em;
  background: #f6f8fa;
}

pre {
  overflow-x: auto;
  padding: 1em;
  border-radius: 0.5em;
  background: #f6f8fa;
  line-height: 1.45;
}

pre > code {
  font-size: inherit;
  white-space: pre;
}

table {
  display: block;
  max-width: 100%;
  width: max-content;
  overflow-x: auto;
  border-collapse: collapse;
}

th, td {
  padding: 0.4em 0.8em;
  border: 1px solid #d1d9e0;
}

th {
  font-weight: 600;
  background: #f6f8fa;
}

img {
  max-width: 100%;
  height: auto;
}

figure {
  overflow-x: auto;
  padding: 1em;
  border: 1px solid #d1d9e0;
  border-radius: 0.5em;
  background: #ffffff;
  text-align: center;
}

figure > img {
  display: inline-block;
}

.image-placeholder {
  display: inline-block;
  padding: 0.25em 0.5em;
  border: 1px dashed #afb8c1;
  border-radius: 0.375em;
  color: #59636e;
  font-size: 0.875em;
}

.image-placeholder > code {
  margin-left: 0.4em;
}

.raw-html-source, .math-source {
  color: #59636e;
}

.math-display {
  overflow-x: auto;
  overflow-y: hidden;
}

.callout {
  padding: 0.5em 1em;
  border-left: 0.25em solid #0969da;
  border-radius: 0.375em;
  background: #f6f8fa;
}

.callout-success { border-left-color: #1a7f37; }
.callout-warning { border-left-color: #9a6700; }
.callout-danger { border-left-color: #d1242f; }
.callout-important { border-left-color: #8250df; }

.callout-title, details.callout > summary {
  margin: 0 0 0.5em;
  font-weight: 600;
}

details.callout > summary {
  cursor: pointer;
}

.callout > :last-child {
  margin-bottom: 0;
}

.footnotes {
  margin-top: 3em;
  padding-top: 1em;
  border-top: 1px solid #d1d9e0;
  color: #59636e;
  font-size: 0.875em;
}

.footnote-ref {
  font-size: 0.75em;
  line-height: 0;
}

.footnote-backref {
  margin-left: 0.3em;
  text-decoration: none;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`;
