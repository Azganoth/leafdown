# Encoding policy spike

Evidence for [issue #542](https://github.com/Azganoth/leafdown/issues/542), which selected the encoding policy that [#563](https://github.com/Azganoth/leafdown/issues/563) and [#564](https://github.com/Azganoth/leafdown/issues/564) implement. This branch is not meant to merge.

## Contents

- `probe/`: standalone crate over `encoding_rs` 0.8 and `chardetng` 0.1.
  - `encprobe` builds the fixture matrix and compares the BOM-or-UTF-8 rule with `chardetng`. It also prints plausible decodes of the same bytes under other encodings, single-byte round trips, and the behavior of unrepresentable characters.
  - `multibyte` checks, for every decodable two-byte sequence in the multibyte encodings and every byte in the Windows single-byte encodings, whether a strict re-encode reproduces the input.
- `src-tauri/src/text_encoding.rs` and the `document.rs` changes: the backend prototype. `read_markdown_file_with_encoding` and `write_markdown_file_with_encoding` decode and encode through `encoding_rs` and carry `{ name, bom }` through the command results. Decoding refuses U+0000 and any decode whose re-encode differs from the file's bytes. Encoding refuses unrepresentable characters and names them.
- `src-tauri/src/encoding_spike_tests.rs`: the fixture matrix run through those functions.
- `src/features/editor/tests/encodingProbe.test.ts`: what the editor's parse and serialize do with a leading U+FEFF and with NUL characters.

## Running

```sh
cd spikes/encoding-policy/probe
cargo run --release --bin encprobe
cargo run --release --bin multibyte

cd src-tauri
cargo test --lib encoding_spike
cargo test --release --lib times_open -- --nocapture

pnpm exec vitest run --silent=false --disable-console-intercept -t "encoding probe"
```

## Results

Captured on Windows 11 with Rust 1.97.1:

- `results/fixture-matrix.txt`: `encprobe` output.
- `results/round-trip-bytes.txt`: `multibyte` output.
- `results/backend-tests.txt`: the full backend suite with the prototype applied. 167 tests pass. `folder::tests::opens_folder_contexts_when_root_index_fails_to_open` fails as expected: it uses the bytes `FF FE` as an invalid-encoding sample, and under this policy those bytes are a valid empty UTF-16LE document.
- `results/release-timing.txt`: opening and saving a 3.8 MB Shift_JIS file in a release build, including the round-trip check. An earlier run in the same session measured 84 ms and 86 ms.
- `results/editor-probe.jsonl`: a leading U+FEFF is dropped by the parse, so a save writes the file without its BOM. Each NUL becomes U+FFFD in the saved Markdown.
