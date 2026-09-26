# Localization spike

Evidence for [issue #541](https://github.com/Azganoth/leafdown/issues/541), which chooses Leafdown's localization architecture and translation workflow. This branch is not meant to merge.

## Contents

- `inventory/inventory.mjs`: parses every non-test `src/**/*.{ts,tsx}` file with `@babel/parser` and lists string literals that reach the UI: JSX text, accessible-name and label attributes, `title`/`description`/`label` properties, command labels, prose-shaped literals, and prose template literals. It is a heuristic lower bound, not an extractor.
- `inventory/export-command-labels.ts`: exports the command and menu labels from the command metadata as the command portion of `src/locales/en.json`.
- `bundle-probe/`: the same plural-plus-number message formatted by each candidate runtime, built with the repository's Vite and minified.
- The prototype, in the application source:
  - `src/locales/en.json`: the source catalog, 191 ICU MessageFormat messages keyed by stable IDs.
  - `src/lib/i18n/messages.ts`: `MessageId` derived from the source catalog, and the `en-XA` pseudo-locale generated from its parsed messages.
  - `src/lib/i18n/localizer.ts`: locale resolution, a per-locale `Localization` snapshot (`t`, numbers, relative times, lists) over `intl-messageformat`, per-message English fallback, and a change signal.
  - `src/lib/i18n/useLocalization.ts`: the React binding, returning the snapshot through `useSyncExternalStore`.
  - Converted surfaces: every command and menu label (menubar, status bar, editor context popup), the status bar, the preferences title, tabs, and General tab with a new Language preference, document open and save errors, file sizes, recent-item relative times, and the block-selection handles and announcements.
- `oxlint.config.ts` ignores `spikes/**`, so the probe scripts are not held to the application's lint rules.
- `src/lib/i18n/*.test.ts*` and the locale-switch case in `blockSelectionInteraction.test.ts`: the prototype's evidence.

## Running

```sh
node spikes/localization/inventory/inventory.mjs .
node spikes/localization/inventory/inventory.mjs . --list

pnpm install --ignore-workspace --dir spikes/localization/bundle-probe
node spikes/localization/bundle-probe/build.mjs "$(node -e "console.log(require('url').pathToFileURL(require.resolve('vite')).href)")"

pnpm exec vitest run src/lib/i18n src/features/editor/plugins/blockSelectionInteraction.test.ts
```

To see the pseudo-locale, run `pnpm tauri dev` and choose `English (Pseudo-Accents)` under Preferences > General > Language. It is offered only in development builds. Converted text appears accented, bracketed, and about 40 percent longer; text still hard-coded in English appears plain.

## Results

Captured on Windows 11 with Node 24.21 against `99b73813`:

- `results/inventory-summary.txt`, `results/inventory-list.tsv`: 534 occurrences, 432 unique texts, in 243 files, before conversion. 17 are template literals that build a sentence around a value.
- `results/command-messages.json`: the 117 command and menu labels exported from the command metadata.
- `results/bundle-size.txt`: gzip size of each runtime formatting one plural message.
- `results/missing-message-typecheck.txt`: `tsc -b` after deleting `command.file.revealInSidebar` from the source catalog. Every use site of a command label fails to compile.
- `results/prototype-tests.txt`: the localization tests and the block-selection suite, 231 passing.
- `results/full-suite.txt`: the full frontend suite with the prototype applied. 3520 tests pass. The one failure is `formatFileSize` expecting `1024 PB`, which now reads `1,024 PB` because numbers are formatted for the locale.
