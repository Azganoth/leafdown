use std::{assert_matches, fs};

use encoding_rs::{
    EUC_KR, Encoding, GBK, ISO_8859_2, KOI8_R, SHIFT_JIS, UTF_8, UTF_16BE, UTF_16LE, WINDOWS_1250,
    WINDOWS_1251, WINDOWS_1252,
};

use crate::{
    document::{
        LineEnding, OpenMarkdownFileError, SaveMarkdownFileError, read_markdown_file,
        read_markdown_file_with_encoding, write_markdown_file_with_encoding,
    },
    test_utils::TestDirectory,
    text_encoding::DocumentEncoding,
};

fn form(encoding: &'static Encoding, bom: bool) -> DocumentEncoding {
    DocumentEncoding {
        name: encoding.name().to_owned(),
        bom,
    }
}

fn fixture_bytes(text: &str, encoding: &'static Encoding, bom: bool) -> Vec<u8> {
    crate::text_encoding::encode(text, &form(encoding, bom)).expect("fixture is representable")
}

const LATIN: &str = "# Café\n\nNaïve résumé — “quotes” cost 10 €.\n";
const CENTRAL: &str = "# Zažluťoučký kůň\n\nZażółć gęślą jaźń.\n";
const CYRILLIC: &str = "# Привет\n\nЭто пример текста.\n";
const JAPANESE: &str = "# 日本語\n\nこれは文字コードのテキストです。\n";
const CHINESE: &str = "# 中文\n\n这是示例文本内容。\n";
const KOREAN: &str = "# 한국어\n\n예제 텍스트입니다.\n";

fn matrix() -> Vec<(&'static str, &'static Encoding, bool, bool)> {
    // (text, encoding, bom, opens without a selection)
    vec![
        (LATIN, UTF_8, false, true),
        (LATIN, UTF_8, true, true),
        (JAPANESE, UTF_16LE, true, true),
        (JAPANESE, UTF_16BE, true, true),
        (LATIN, WINDOWS_1252, false, false),
        (CENTRAL, WINDOWS_1250, false, false),
        (CENTRAL, ISO_8859_2, false, false),
        (CYRILLIC, WINDOWS_1251, false, false),
        (CYRILLIC, KOI8_R, false, false),
        (JAPANESE, SHIFT_JIS, false, false),
        (CHINESE, GBK, false, false),
        (KOREAN, EUC_KR, false, false),
    ]
}

#[test]
fn untouched_documents_save_back_byte_for_byte_in_every_supported_form() {
    let root = TestDirectory::new("encoding-matrix");

    for (text, encoding, bom, opens_unselected) in matrix() {
        for line_ending in [LineEnding::Lf, LineEnding::Crlf] {
            let body = match line_ending {
                LineEnding::Lf => text.to_owned(),
                LineEnding::Crlf => text.replace('\n', "\r\n"),
            };
            let bytes = fixture_bytes(&body, encoding, bom);
            let name = format!("{}-{}-{:?}.md", encoding.name(), bom, line_ending);
            let path = root.write_file_with_content(&name, bytes.clone());

            let unselected = read_markdown_file(&path);
            let opened = if opens_unselected {
                unselected.expect("BOM or valid UTF-8 opens without a selection")
            } else {
                assert_matches!(
                    unselected,
                    Err(OpenMarkdownFileError::InvalidEncoding { .. }),
                    "{name} must not open without a selection"
                );
                read_markdown_file_with_encoding(&path, Some(encoding.name()))
                    .expect("explicit selection opens the file")
            };

            assert_eq!(opened.encoding, form(encoding, bom), "{name}");
            assert_eq!(opened.content, body, "{name}");
            assert_eq!(opened.line_ending, Some(line_ending), "{name}");

            write_markdown_file_with_encoding(
                &path,
                &opened.content,
                &opened.encoding,
                Some(opened.metadata),
                false,
            )
            .expect("untouched save succeeds");

            assert_eq!(fs::read(&path).unwrap(), bytes, "{name} round trip");
        }
    }
}

#[test]
fn save_as_keeps_the_document_encoding_at_the_new_path() {
    let root = TestDirectory::new("encoding-save-as");
    let bytes = fixture_bytes(JAPANESE, SHIFT_JIS, false);
    let source = root.write_file_with_content("source.md", bytes.clone());
    let opened = read_markdown_file_with_encoding(&source, Some("shift_jis")).unwrap();
    let target = root.path("copy.md");

    write_markdown_file_with_encoding(&target, &opened.content, &opened.encoding, None, false)
        .unwrap();

    assert_eq!(fs::read(&target).unwrap(), bytes);
}

#[test]
fn edits_the_encoding_cannot_represent_refuse_the_save_and_leave_the_file() {
    let root = TestDirectory::new("encoding-unrepresentable");
    let bytes = fixture_bytes(LATIN, WINDOWS_1252, false);
    let path = root.write_file_with_content("latin.md", bytes.clone());
    let opened = read_markdown_file_with_encoding(&path, Some("windows-1252")).unwrap();
    let edited = format!("{}Done ✓ 日本 😀 ✓\n", opened.content);

    let error = write_markdown_file_with_encoding(
        &path,
        &edited,
        &opened.encoding,
        Some(opened.metadata),
        false,
    )
    .expect_err("unrepresentable characters must not be written");

    assert_matches!(
        &error,
        SaveMarkdownFileError::UnrepresentableCharacters { encoding, characters, .. }
            if encoding == "windows-1252" && characters == &["✓", "日", "本", "😀"]
    );
    assert_eq!(fs::read(&path).unwrap(), bytes);

    let json = serde_json::to_value(&error).unwrap();
    assert_eq!(json["kind"], "unrepresentableCharacters");
    assert_eq!(
        json["characters"],
        serde_json::json!(["✓", "日", "本", "😀"])
    );

    write_markdown_file_with_encoding(
        &path,
        &edited,
        &DocumentEncoding::utf8(),
        Some(opened.metadata),
        false,
    )
    .expect("converting to UTF-8 writes every character");

    let reopened = read_markdown_file(&path).unwrap();
    assert_eq!(reopened.encoding, DocumentEncoding::utf8());
    assert_eq!(reopened.content, edited);
}

#[test]
fn a_bom_outranks_an_explicit_selection() {
    let root = TestDirectory::new("encoding-bom-wins");
    let path = root.write_file_with_content("bom.md", fixture_bytes(LATIN, UTF_8, true));

    let opened = read_markdown_file_with_encoding(&path, Some("windows-1252")).unwrap();

    assert_eq!(opened.encoding, form(UTF_8, true));
    assert_eq!(opened.content, LATIN);
}

#[test]
fn rejects_bytes_that_do_not_decode_losslessly() {
    let root = TestDirectory::new("encoding-rejects");
    let cases: [(&str, Vec<u8>, Option<&str>); 6] = [
        ("truncated-utf8.md", b"# Caf\xC3".to_vec(), None),
        (
            "bom-then-invalid.md",
            b"\xEF\xBB\xBF# \xFF\n".to_vec(),
            None,
        ),
        ("utf16-odd.md", b"\xFF\xFE#\x00A".to_vec(), None),
        (
            "utf16-lone-surrogate.md",
            b"\xFF\xFE\x00\xD8A\x00".to_vec(),
            None,
        ),
        (
            "utf16le-no-bom.md",
            "# Title\n"
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect(),
            None,
        ),
        (
            "sjis-bad-trail.md",
            b"# \x81\x20\n".to_vec(),
            Some("shift_jis"),
        ),
    ];

    for (name, bytes, selection) in cases {
        let path = root.write_file_with_content(name, bytes);

        assert_matches!(
            read_markdown_file_with_encoding(&path, selection),
            Err(OpenMarkdownFileError::InvalidEncoding { .. }),
            "{name}"
        );
    }

    let path = root.write_file_with_content("unknown-label.md", b"text".to_vec());
    assert_matches!(
        read_markdown_file_with_encoding(&path, Some("cp437")),
        Err(OpenMarkdownFileError::UnknownEncoding { .. })
    );
}

#[test]
fn refuses_a_selection_that_would_rewrite_untouched_bytes() {
    let root = TestDirectory::new("encoding-irreversible");
    let cases: [(&str, &[u8], &str); 3] = [
        ("sjis-nec-duplicate.md", b"# \x87\x90\n", "shift_jis"),
        ("big5-hkscs.md", b"# \x87\x40\n", "big5"),
        ("gb18030-euro-byte.md", b"# \x80\n", "gb18030"),
    ];

    for (name, bytes, label) in cases {
        let path = root.write_file_with_content(name, bytes);

        assert_matches!(
            read_markdown_file_with_encoding(&path, Some(label)),
            Err(OpenMarkdownFileError::IrreversibleEncoding { .. }),
            "{name}"
        );
    }
}

#[test]
fn times_open_and_save_at_the_size_limit() {
    let root = TestDirectory::new("encoding-timing");
    let line = "日本語のテキストとASCII text mixed 1234567890.\n";
    let mut text = String::new();
    while text.len() < 4_500_000 {
        text.push_str(line);
    }
    let bytes = fixture_bytes(&text, SHIFT_JIS, false);
    let path = root.write_file_with_content("large.md", bytes.clone());

    let started = std::time::Instant::now();
    let opened = read_markdown_file_with_encoding(&path, Some("shift_jis")).unwrap();
    let opened_in = started.elapsed();
    let started = std::time::Instant::now();
    write_markdown_file_with_encoding(&path, &opened.content, &opened.encoding, None, false)
        .unwrap();
    let saved_in = started.elapsed();

    eprintln!(
        "shift_jis {} bytes on disk: open {:?}, save {:?}",
        bytes.len(),
        opened_in,
        saved_in
    );
    assert_eq!(fs::read(&path).unwrap(), bytes);
}

#[test]
fn a_utf16_bom_alone_is_an_empty_document() {
    let root = TestDirectory::new("encoding-bare-bom");
    let path = root.write_file_with_content("bare.md", vec![0xFF, 0xFE]);

    let opened = read_markdown_file(&path).unwrap();

    assert_eq!(opened.content, "");
    assert_eq!(opened.encoding, form(UTF_16LE, true));
}

#[test]
fn an_external_rewrite_in_another_encoding_is_caught_by_the_metadata_check() {
    let root = TestDirectory::new("encoding-external-change");
    let path = root.write_file_with_content("doc.md", fixture_bytes(LATIN, WINDOWS_1252, false));
    let opened = read_markdown_file_with_encoding(&path, Some("windows-1252")).unwrap();
    let external = fixture_bytes(LATIN, UTF_16LE, true);
    fs::write(&path, &external).unwrap();

    let error = write_markdown_file_with_encoding(
        &path,
        &opened.content,
        &opened.encoding,
        Some(opened.metadata),
        false,
    )
    .expect_err("the external rewrite must be detected");

    assert_matches!(error, SaveMarkdownFileError::ExternalModification { .. });
    assert_eq!(fs::read(&path).unwrap(), external);
    assert_eq!(
        read_markdown_file(&path).unwrap().encoding,
        form(UTF_16LE, true)
    );
}
