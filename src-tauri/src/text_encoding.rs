use std::{borrow::Cow, collections::HashSet};

use encoding_rs::{EncoderResult, Encoding};
use serde::{Deserialize, Serialize};

const UTF8_BOM: [u8; 3] = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM: [u8; 2] = [0xff, 0xfe];
const UTF16BE_BOM: [u8; 2] = [0xfe, 0xff];
const MIN_ENCODER_OUTPUT_RESERVE: usize = 16;

/// Names are the Encoding Standard names `encoding_rs` reports, so a label such as `iso-8859-1`,
/// which that standard maps to Windows-1252, is not accepted.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub(crate) enum TextEncoding {
    #[serde(rename = "UTF-8")]
    Utf8,
    #[serde(rename = "UTF-16LE")]
    Utf16Le,
    #[serde(rename = "UTF-16BE")]
    Utf16Be,
    #[serde(rename = "windows-1250")]
    Windows1250,
    #[serde(rename = "windows-1251")]
    Windows1251,
    #[serde(rename = "windows-1252")]
    Windows1252,
    #[serde(rename = "windows-1253")]
    Windows1253,
    #[serde(rename = "windows-1254")]
    Windows1254,
    #[serde(rename = "windows-1255")]
    Windows1255,
    #[serde(rename = "windows-1256")]
    Windows1256,
    #[serde(rename = "windows-1257")]
    Windows1257,
    #[serde(rename = "windows-1258")]
    Windows1258,
    #[serde(rename = "ISO-8859-2")]
    Iso8859_2,
    #[serde(rename = "ISO-8859-15")]
    Iso8859_15,
    #[serde(rename = "KOI8-R")]
    Koi8R,
    #[serde(rename = "KOI8-U")]
    Koi8U,
    #[serde(rename = "Shift_JIS")]
    ShiftJis,
    #[serde(rename = "EUC-JP")]
    EucJp,
    #[serde(rename = "GBK")]
    Gbk,
    #[serde(rename = "gb18030")]
    Gb18030,
    #[serde(rename = "Big5")]
    Big5,
    #[serde(rename = "EUC-KR")]
    EucKr,
}

#[derive(Clone, Copy)]
enum Codec {
    Utf8,
    Utf16Le,
    Utf16Be,
    Legacy(&'static Encoding),
}

impl TextEncoding {
    const WITH_BOM: [Self; 3] = [Self::Utf8, Self::Utf16Le, Self::Utf16Be];

    fn codec(self) -> Codec {
        Codec::Legacy(match self {
            Self::Utf8 => return Codec::Utf8,
            Self::Utf16Le => return Codec::Utf16Le,
            Self::Utf16Be => return Codec::Utf16Be,
            Self::Windows1250 => encoding_rs::WINDOWS_1250,
            Self::Windows1251 => encoding_rs::WINDOWS_1251,
            Self::Windows1252 => encoding_rs::WINDOWS_1252,
            Self::Windows1253 => encoding_rs::WINDOWS_1253,
            Self::Windows1254 => encoding_rs::WINDOWS_1254,
            Self::Windows1255 => encoding_rs::WINDOWS_1255,
            Self::Windows1256 => encoding_rs::WINDOWS_1256,
            Self::Windows1257 => encoding_rs::WINDOWS_1257,
            Self::Windows1258 => encoding_rs::WINDOWS_1258,
            Self::Iso8859_2 => encoding_rs::ISO_8859_2,
            Self::Iso8859_15 => encoding_rs::ISO_8859_15,
            Self::Koi8R => encoding_rs::KOI8_R,
            Self::Koi8U => encoding_rs::KOI8_U,
            Self::ShiftJis => encoding_rs::SHIFT_JIS,
            Self::EucJp => encoding_rs::EUC_JP,
            Self::Gbk => encoding_rs::GBK,
            Self::Gb18030 => encoding_rs::GB18030,
            Self::Big5 => encoding_rs::BIG5,
            Self::EucKr => encoding_rs::EUC_KR,
        })
    }

    fn bom(self) -> Option<&'static [u8]> {
        match self.codec() {
            Codec::Utf8 => Some(&UTF8_BOM),
            Codec::Utf16Le => Some(&UTF16LE_BOM),
            Codec::Utf16Be => Some(&UTF16BE_BOM),
            Codec::Legacy(_) => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", try_from = "UncheckedDocumentEncoding")]
pub(crate) struct DocumentEncoding {
    pub(crate) name: TextEncoding,
    pub(crate) bom: bool,
}

#[derive(Deserialize)]
struct UncheckedDocumentEncoding {
    name: TextEncoding,
    bom: bool,
}

impl TryFrom<UncheckedDocumentEncoding> for DocumentEncoding {
    type Error = &'static str;

    fn try_from(
        UncheckedDocumentEncoding { name, bom }: UncheckedDocumentEncoding,
    ) -> Result<Self, Self::Error> {
        if bom && name.bom().is_none() {
            return Err("only UTF-8 and UTF-16 have a byte order mark");
        }

        Ok(Self { name, bom })
    }
}

impl DocumentEncoding {
    #[cfg(test)]
    pub(crate) const UTF8: Self = Self {
        name: TextEncoding::Utf8,
        bom: false,
    };

    fn bom_bytes(self) -> &'static [u8] {
        match self.name.bom() {
            Some(bom) if self.bom => bom,
            _ => &[],
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct DecodedText {
    pub(crate) text: String,
    pub(crate) encoding: DocumentEncoding,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum DecodeError {
    Malformed,
    Irreversible,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct UnrepresentableCharacters {
    pub(crate) characters: Vec<char>,
}

/// A byte order mark outranks `chosen`. U+0000 is refused because UTF-16 text without a byte
/// order mark is often also valid UTF-8, with a NUL between characters.
pub(crate) fn decode_text(
    mut bytes: Vec<u8>,
    chosen: Option<TextEncoding>,
) -> Result<DecodedText, DecodeError> {
    let encoding = detect_bom(bytes.as_slice()).unwrap_or(DocumentEncoding {
        name: chosen.unwrap_or(TextEncoding::Utf8),
        bom: false,
    });
    let body_start = encoding.bom_bytes().len();
    let text = match encoding.name.codec() {
        Codec::Utf8 => {
            bytes.drain(..body_start);
            String::from_utf8(bytes).ok()
        }
        Codec::Utf16Le => decode_utf16(&bytes[body_start..], u16::from_le_bytes),
        Codec::Utf16Be => decode_utf16(&bytes[body_start..], u16::from_be_bytes),
        Codec::Legacy(legacy_encoding) => Some(decode_legacy(bytes.as_slice(), legacy_encoding)?),
    }
    .filter(|text| !text.contains('\0'))
    .ok_or(DecodeError::Malformed)?;

    Ok(DecodedText { text, encoding })
}

pub(crate) fn encode_text(
    text: &str,
    encoding: DocumentEncoding,
) -> Result<Cow<'_, [u8]>, UnrepresentableCharacters> {
    let bom = encoding.bom_bytes();

    Ok(match encoding.name.codec() {
        Codec::Utf8 if bom.is_empty() => Cow::Borrowed(text.as_bytes()),
        Codec::Utf8 => Cow::Owned([bom, text.as_bytes()].concat()),
        Codec::Utf16Le => Cow::Owned(encode_utf16(text, bom, u16::to_le_bytes)),
        Codec::Utf16Be => Cow::Owned(encode_utf16(text, bom, u16::to_be_bytes)),
        Codec::Legacy(legacy_encoding) => Cow::Owned(encode_legacy(text, legacy_encoding)?),
    })
}

fn detect_bom(bytes: &[u8]) -> Option<DocumentEncoding> {
    TextEncoding::WITH_BOM
        .into_iter()
        .find(|name| name.bom().is_some_and(|bom| bytes.starts_with(bom)))
        .map(|name| DocumentEncoding { name, bom: true })
}

fn decode_utf16(bytes: &[u8], code_unit: fn([u8; 2]) -> u16) -> Option<String> {
    let (code_units, []) = bytes.as_chunks::<2>() else {
        return None;
    };

    char::decode_utf16(code_units.iter().copied().map(code_unit))
        .collect::<Result<String, _>>()
        .ok()
}

/// Several legacy multibyte encodings decode more than one byte sequence to the same character,
/// so a save of the untouched text could otherwise rewrite bytes the user never edited.
fn decode_legacy(bytes: &[u8], encoding: &'static Encoding) -> Result<String, DecodeError> {
    let text = encoding
        .decode_without_bom_handling_and_without_replacement(bytes)
        .ok_or(DecodeError::Malformed)?
        .into_owned();

    match encode_legacy(text.as_str(), encoding) {
        Ok(encoded) if encoded == bytes => Ok(text),
        _ => Err(DecodeError::Irreversible),
    }
}

fn encode_utf16(text: &str, bom: &[u8], code_unit_bytes: fn(u16) -> [u8; 2]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(bom.len() + text.len() * 2);

    bytes.extend_from_slice(bom);
    bytes.extend(text.encode_utf16().flat_map(code_unit_bytes));
    bytes
}

/// `encoding_rs`'s convenience `encode` writes an HTML numeric character reference for an
/// unmappable character, so only the non-replacing encoder keeps the document's text intact.
fn encode_legacy(
    text: &str,
    encoding: &'static Encoding,
) -> Result<Vec<u8>, UnrepresentableCharacters> {
    let mut encoder = encoding.new_encoder();
    let mut bytes = Vec::with_capacity(text.len());
    let mut characters = Vec::new();
    let mut seen_characters = HashSet::new();
    let mut remaining = text;

    loop {
        let (result, read) =
            encoder.encode_from_utf8_to_vec_without_replacement(remaining, &mut bytes, true);
        remaining = &remaining[read..];

        match result {
            EncoderResult::InputEmpty => break,
            EncoderResult::OutputFull => {
                bytes.reserve(remaining.len().max(MIN_ENCODER_OUTPUT_RESERVE));
            }
            EncoderResult::Unmappable(character) => {
                if seen_characters.insert(character) {
                    characters.push(character);
                }
            }
        }
    }

    if characters.is_empty() {
        Ok(bytes)
    } else {
        Err(UnrepresentableCharacters { characters })
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DecodeError, DecodedText, DocumentEncoding, TextEncoding, UnrepresentableCharacters,
        decode_text, encode_text,
    };

    const UTF8_BOM: DocumentEncoding = DocumentEncoding {
        name: TextEncoding::Utf8,
        bom: true,
    };
    const UTF16LE_BOM: DocumentEncoding = DocumentEncoding {
        name: TextEncoding::Utf16Le,
        bom: true,
    };
    const UTF16BE_BOM: DocumentEncoding = DocumentEncoding {
        name: TextEncoding::Utf16Be,
        bom: true,
    };

    fn encoding_standard_names() -> [(TextEncoding, &'static encoding_rs::Encoding); 22] {
        [
            (TextEncoding::Utf8, encoding_rs::UTF_8),
            (TextEncoding::Utf16Le, encoding_rs::UTF_16LE),
            (TextEncoding::Utf16Be, encoding_rs::UTF_16BE),
            (TextEncoding::Windows1250, encoding_rs::WINDOWS_1250),
            (TextEncoding::Windows1251, encoding_rs::WINDOWS_1251),
            (TextEncoding::Windows1252, encoding_rs::WINDOWS_1252),
            (TextEncoding::Windows1253, encoding_rs::WINDOWS_1253),
            (TextEncoding::Windows1254, encoding_rs::WINDOWS_1254),
            (TextEncoding::Windows1255, encoding_rs::WINDOWS_1255),
            (TextEncoding::Windows1256, encoding_rs::WINDOWS_1256),
            (TextEncoding::Windows1257, encoding_rs::WINDOWS_1257),
            (TextEncoding::Windows1258, encoding_rs::WINDOWS_1258),
            (TextEncoding::Iso8859_2, encoding_rs::ISO_8859_2),
            (TextEncoding::Iso8859_15, encoding_rs::ISO_8859_15),
            (TextEncoding::Koi8R, encoding_rs::KOI8_R),
            (TextEncoding::Koi8U, encoding_rs::KOI8_U),
            (TextEncoding::ShiftJis, encoding_rs::SHIFT_JIS),
            (TextEncoding::EucJp, encoding_rs::EUC_JP),
            (TextEncoding::Gbk, encoding_rs::GBK),
            (TextEncoding::Gb18030, encoding_rs::GB18030),
            (TextEncoding::Big5, encoding_rs::BIG5),
            (TextEncoding::EucKr, encoding_rs::EUC_KR),
        ]
    }

    fn without_bom(name: TextEncoding) -> DocumentEncoding {
        DocumentEncoding { name, bom: false }
    }

    fn decoded(bytes: &[u8]) -> Result<DecodedText, DecodeError> {
        decode_text(bytes.to_vec(), None)
    }

    fn decoded_as(bytes: &[u8], chosen: TextEncoding) -> Result<DecodedText, DecodeError> {
        decode_text(bytes.to_vec(), Some(chosen))
    }

    fn with_bom(bom: &[u8], body: &[u8]) -> Vec<u8> {
        [bom, body].concat()
    }

    #[test]
    fn decodes_utf8_without_a_byte_order_mark() {
        assert_eq!(
            decoded("# Café\n".as_bytes()),
            Ok(DecodedText {
                text: "# Café\n".to_owned(),
                encoding: DocumentEncoding::UTF8,
            })
        );
    }

    #[test]
    fn strips_each_byte_order_mark_from_the_decoded_text() {
        assert_eq!(
            decoded(&with_bom(&[0xef, 0xbb, 0xbf], "# Café".as_bytes())),
            Ok(DecodedText {
                text: "# Café".to_owned(),
                encoding: UTF8_BOM,
            })
        );
        assert_eq!(
            decoded(&[
                0xff, 0xfe, b'#', 0, b' ', 0, 0xe9, 0, 0x3d, 0xd8, 0x00, 0xde
            ]),
            Ok(DecodedText {
                text: "# é😀".to_owned(),
                encoding: UTF16LE_BOM,
            })
        );
        assert_eq!(
            decoded(&[
                0xfe, 0xff, 0, b'#', 0, b' ', 0, 0xe9, 0xd8, 0x3d, 0xde, 0x00
            ]),
            Ok(DecodedText {
                text: "# é😀".to_owned(),
                encoding: UTF16BE_BOM,
            })
        );
    }

    #[test]
    fn decodes_a_lone_byte_order_mark_as_an_empty_document() {
        for (bytes, encoding) in [
            (&[0xef, 0xbb, 0xbf][..], UTF8_BOM),
            (&[0xff, 0xfe][..], UTF16LE_BOM),
            (&[0xfe, 0xff][..], UTF16BE_BOM),
        ] {
            assert_eq!(
                decoded(bytes),
                Ok(DecodedText {
                    text: String::new(),
                    encoding,
                })
            );
        }
    }

    #[test]
    fn rejects_utf16_without_a_byte_order_mark_unless_chosen() {
        let little_endian = [b'#', 0, b' ', 0, b'A', 0];
        let big_endian = [0, b'#', 0, b' ', 0, b'A'];

        assert_eq!(decoded(&little_endian), Err(DecodeError::Malformed));
        assert_eq!(decoded(&big_endian), Err(DecodeError::Malformed));
        assert_eq!(
            decoded_as(&little_endian, TextEncoding::Utf16Le),
            Ok(DecodedText {
                text: "# A".to_owned(),
                encoding: without_bom(TextEncoding::Utf16Le),
            })
        );
        assert_eq!(
            decoded_as(&big_endian, TextEncoding::Utf16Be),
            Ok(DecodedText {
                text: "# A".to_owned(),
                encoding: without_bom(TextEncoding::Utf16Be),
            })
        );
    }

    #[test]
    fn decodes_valid_utf8_in_the_chosen_encoding() {
        assert_eq!(
            decoded_as("RÃ©sumÃ©".as_bytes(), TextEncoding::Windows1252),
            Ok(DecodedText {
                text: "RÃƒÂ©sumÃƒÂ©".to_owned(),
                encoding: without_bom(TextEncoding::Windows1252),
            })
        );
    }

    #[test]
    fn decodes_a_chosen_utf8_as_without_a_choice() {
        assert_eq!(
            decoded_as("# Café\n".as_bytes(), TextEncoding::Utf8),
            decoded("# Café\n".as_bytes())
        );
        assert_eq!(
            decoded_as(&[0xe9], TextEncoding::Utf8),
            Err(DecodeError::Malformed)
        );
    }

    #[test]
    fn a_byte_order_mark_outranks_the_chosen_encoding() {
        assert_eq!(
            decoded_as(
                &with_bom(&[0xef, 0xbb, 0xbf], "Café".as_bytes()),
                TextEncoding::Windows1252
            ),
            Ok(DecodedText {
                text: "Café".to_owned(),
                encoding: UTF8_BOM,
            })
        );
        assert_eq!(
            decoded_as(&[0xff, 0xfe, b'A', 0], TextEncoding::ShiftJis),
            Ok(DecodedText {
                text: "A".to_owned(),
                encoding: UTF16LE_BOM,
            })
        );
    }

    #[test]
    fn rejects_decoded_text_containing_nul() {
        assert_eq!(decoded(b"a\0b"), Err(DecodeError::Malformed));
        assert_eq!(
            decoded(&with_bom(&[0xef, 0xbb, 0xbf], b"a\0b")),
            Err(DecodeError::Malformed)
        );
        assert_eq!(
            decoded(&[0xff, 0xfe, b'a', 0, 0, 0, b'b', 0]),
            Err(DecodeError::Malformed)
        );
        assert_eq!(
            decoded(&[0xfe, 0xff, 0, b'a', 0, 0, 0, b'b']),
            Err(DecodeError::Malformed)
        );
        assert_eq!(
            decoded_as(b"a\0b", TextEncoding::Windows1252),
            Err(DecodeError::Malformed)
        );
        assert_eq!(
            decoded_as(&[b'a', 0, 0, 0], TextEncoding::Utf16Le),
            Err(DecodeError::Malformed)
        );
    }

    #[test]
    fn rejects_malformed_utf8() {
        assert_eq!(decoded(&[b'a', 0xc3]), Err(DecodeError::Malformed));
        assert_eq!(decoded(&[0x80, 0x81]), Err(DecodeError::Malformed));
        assert_eq!(
            decoded(&with_bom(&[0xef, 0xbb, 0xbf], &[b'a', 0xc3])),
            Err(DecodeError::Malformed)
        );
        assert_eq!(
            decoded(&with_bom(&[0xef, 0xbb, 0xbf], &[0xed, 0xa0, 0x80])),
            Err(DecodeError::Malformed)
        );
    }

    #[test]
    fn rejects_malformed_utf16_after_a_byte_order_mark_or_when_chosen() {
        let odd_length = [b'a', 0, b'b'];
        let lone_leading_surrogate = [0x3d, 0xd8, b'a', 0];
        let lone_trailing_surrogate = [0x00, 0xde];
        let truncated_pair = [0x3d, 0xd8];

        for body in [
            &odd_length[..],
            &lone_leading_surrogate,
            &lone_trailing_surrogate,
            &truncated_pair,
        ] {
            let big_endian_body = body
                .chunks(2)
                .flat_map(|pair| pair.iter().rev().copied())
                .collect::<Vec<_>>();

            assert_eq!(
                decoded(&with_bom(&[0xff, 0xfe], body)),
                Err(DecodeError::Malformed)
            );
            assert_eq!(
                decoded(&with_bom(&[0xfe, 0xff], big_endian_body.as_slice())),
                Err(DecodeError::Malformed)
            );
            assert_eq!(
                decoded_as(body, TextEncoding::Utf16Le),
                Err(DecodeError::Malformed)
            );
            assert_eq!(
                decoded_as(big_endian_body.as_slice(), TextEncoding::Utf16Be),
                Err(DecodeError::Malformed)
            );
        }
    }

    #[test]
    fn rejects_bytes_malformed_under_the_chosen_encoding() {
        let cases: [(TextEncoding, &[u8]); 5] = [
            (TextEncoding::ShiftJis, &[0x82, 0x20]),
            (TextEncoding::ShiftJis, &[b'a', 0x82]),
            (TextEncoding::EucKr, &[0xb0, 0x20]),
            (TextEncoding::Big5, &[0xa4]),
            (TextEncoding::Windows1253, &[0xaa]),
        ];

        for (encoding, bytes) in cases {
            assert_eq!(
                decoded_as(bytes, encoding),
                Err(DecodeError::Malformed),
                "{encoding:?}"
            );
        }
    }

    #[test]
    fn rejects_a_choice_that_would_rewrite_untouched_bytes() {
        let cases: [(TextEncoding, &[u8]); 3] = [
            (TextEncoding::ShiftJis, &[0x87, 0x90]),
            (TextEncoding::Big5, &[0x87, 0x40]),
            (TextEncoding::Gb18030, &[0x80]),
        ];

        for (encoding, bytes) in cases {
            assert_eq!(
                decoded_as(bytes, encoding),
                Err(DecodeError::Irreversible),
                "{encoding:?}"
            );
        }
    }

    #[test]
    fn encodes_text_in_each_unicode_encoding_and_byte_order_mark_form() {
        let text = "# é😀\r\n";

        assert_eq!(
            &*encode_text(text, DocumentEncoding::UTF8).unwrap(),
            text.as_bytes()
        );
        assert_eq!(
            &*encode_text(text, UTF8_BOM).unwrap(),
            with_bom(&[0xef, 0xbb, 0xbf], text.as_bytes()).as_slice()
        );
        assert_eq!(
            &*encode_text(text, UTF16LE_BOM).unwrap(),
            &[
                0xff, 0xfe, b'#', 0, b' ', 0, 0xe9, 0, 0x3d, 0xd8, 0x00, 0xde, b'\r', 0, b'\n', 0
            ]
        );
        assert_eq!(
            &*encode_text(text, UTF16BE_BOM).unwrap(),
            &[
                0xfe, 0xff, 0, b'#', 0, b' ', 0, 0xe9, 0xd8, 0x3d, 0xde, 0x00, 0, b'\r', 0, b'\n'
            ]
        );
        assert_eq!(
            &*encode_text(text, without_bom(TextEncoding::Utf16Le)).unwrap(),
            &[
                b'#', 0, b' ', 0, 0xe9, 0, 0x3d, 0xd8, 0x00, 0xde, b'\r', 0, b'\n', 0
            ]
        );
    }

    #[test]
    fn encodes_text_in_a_legacy_encoding() {
        assert_eq!(
            &*encode_text("Café €", without_bom(TextEncoding::Windows1252)).unwrap(),
            &[b'C', b'a', b'f', 0xe9, b' ', 0x80]
        );
        assert_eq!(
            &*encode_text("日本", without_bom(TextEncoding::ShiftJis)).unwrap(),
            &[0x93, 0xfa, 0x96, 0x7b]
        );
    }

    #[test]
    fn grows_the_output_when_a_legacy_encoding_writes_more_bytes_than_utf8() {
        let text = "\u{80}".repeat(64);

        let encoded = encode_text(text.as_str(), without_bom(TextEncoding::Gb18030)).unwrap();

        assert_eq!(encoded.len(), 64 * 4);
        assert_eq!(
            decoded_as(&encoded, TextEncoding::Gb18030).map(|decoded| decoded.text),
            Ok(text)
        );
    }

    #[test]
    fn reports_each_distinct_unrepresentable_character_in_order() {
        assert_eq!(
            encode_text(
                "Done ✓ 日 本 😀 ✓ 日",
                without_bom(TextEncoding::Windows1252)
            ),
            Err(UnrepresentableCharacters {
                characters: vec!['✓', '日', '本', '😀'],
            })
        );
    }

    #[test]
    fn serializes_encodings_with_their_encoding_standard_names() {
        for (name, encoding) in encoding_standard_names() {
            let serialized = serde_json::to_value(name).unwrap();

            assert_eq!(serialized, serde_json::json!(encoding.name()));
            assert_eq!(
                serde_json::from_value::<TextEncoding>(serialized).unwrap(),
                name
            );
        }

        assert_eq!(
            serde_json::to_value(UTF16LE_BOM).unwrap(),
            serde_json::json!({ "name": "UTF-16LE", "bom": true })
        );
    }

    #[test]
    fn rejects_unknown_encoding_names_and_impossible_byte_order_marks() {
        for name in [
            "iso-8859-1",
            "ISO-2022-JP",
            "replacement",
            "x-user-defined",
            "utf-8",
            "",
        ] {
            assert!(
                serde_json::from_value::<TextEncoding>(serde_json::json!(name)).is_err(),
                "{name}"
            );
        }

        assert!(
            serde_json::from_value::<DocumentEncoding>(
                serde_json::json!({ "name": "windows-1252", "bom": true })
            )
            .is_err()
        );
        assert_eq!(
            serde_json::from_value::<DocumentEncoding>(
                serde_json::json!({ "name": "UTF-16BE", "bom": false })
            )
            .unwrap(),
            without_bom(TextEncoding::Utf16Be)
        );
    }
}
