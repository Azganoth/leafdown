# Environment Scenarios

This directory contains focused folder-context and local-resource inputs that
support manual testing alongside the syntax corpus.

- [`article-navigator/`](./article-navigator/) covers supported extensions,
  nested folders, index precedence, ordering shapes, empty folders, and Unicode
  paths.
- [`asset-handoff.md`](./asset-handoff.md) covers local, missing, remote, unsafe,
  unsupported, and outside-folder destinations.

Loading limits, timestamp ordering, ignored directories, and symlink scanning
are application behaviors covered by automated tests rather than this Markdown
corpus.
