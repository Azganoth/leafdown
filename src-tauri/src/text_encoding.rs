use std::borrow::Cow;

use serde::{Deserialize, Serialize};

const UTF8_BOM: [u8; 3] = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM: [u8; 2] = [0xff, 0xfe];
const UTF16BE_BOM: [u8; 2] = [0xfe, 0xff];

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub(crate) enum TextEncoding {
    #[serde(rename = "UTF-8")]
    Utf8,
    #[serde(rename = "UTF-16LE")]
    Utf16Le,
    #[serde(rename = "UTF-16BE")]
    Utf16Be,
}

impl TextEncoding {
    const ALL: [Self; 3] = [Self::Utf8, Self::Utf16Le, Self::Utf16Be];

    fn bom(self) -> &'static [u8] {
        match self {
            Self::Utf8 => &UTF8_BOM,
            Self::Utf16Le => &UTF16LE_BOM,
            Self::Utf16Be => &UTF16BE_BOM,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DocumentEncoding {
    pub(crate) name: TextEncoding,
    pub(crate) bom: bool,
}

impl DocumentEncoding {
    pub(crate) const UTF8: Self = Self {
        name: TextEncoding::Utf8,
        bom: false,
    };

    fn bom_bytes(self) -> &'static [u8] {
        if self.bom { self.name.bom() } else { &[] }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct DecodedText {
    pub(crate) text: String,
    pub(crate) encoding: DocumentEncoding,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct InvalidEncoding;

/// U+0000 is refused because UTF-16 text without a byte order mark is often also valid UTF-8,
/// with a NUL between characters.
pub(crate) fn decode_text(mut bytes: Vec<u8>) -> Result<DecodedText, InvalidEncoding> {
    let encoding = detect_encoding(bytes.as_slice());
    let body_start = encoding.bom_bytes().len();
    let text = match encoding.name {
        TextEncoding::Utf8 => {
            bytes.drain(..body_start);
            String::from_utf8(bytes).ok()
        }
        TextEncoding::Utf16Le => decode_utf16(&bytes[body_start..], u16::from_le_bytes),
        TextEncoding::Utf16Be => decode_utf16(&bytes[body_start..], u16::from_be_bytes),
    }
    .filter(|text| !text.contains('\0'))
    .ok_or(InvalidEncoding)?;

    Ok(DecodedText { text, encoding })
}

pub(crate) fn encode_text(text: &str, encoding: DocumentEncoding) -> Cow<'_, [u8]> {
    let bom = encoding.bom_bytes();

    match encoding.name {
        TextEncoding::Utf8 if bom.is_empty() => Cow::Borrowed(text.as_bytes()),
        TextEncoding::Utf8 => Cow::Owned([bom, text.as_bytes()].concat()),
        TextEncoding::Utf16Le => Cow::Owned(encode_utf16(text, bom, u16::to_le_bytes)),
        TextEncoding::Utf16Be => Cow::Owned(encode_utf16(text, bom, u16::to_be_bytes)),
    }
}

fn detect_encoding(bytes: &[u8]) -> DocumentEncoding {
    TextEncoding::ALL
        .into_iter()
        .find(|encoding| bytes.starts_with(encoding.bom()))
        .map_or(DocumentEncoding::UTF8, |name| DocumentEncoding {
            name,
            bom: true,
        })
}

fn decode_utf16(bytes: &[u8], code_unit: fn([u8; 2]) -> u16) -> Option<String> {
    let (code_units, []) = bytes.as_chunks::<2>() else {
        return None;
    };

    char::decode_utf16(code_units.iter().copied().map(code_unit))
        .collect::<Result<String, _>>()
        .ok()
}

fn encode_utf16(text: &str, bom: &[u8], code_unit_bytes: fn(u16) -> [u8; 2]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(bom.len() + text.len() * 2);

    bytes.extend_from_slice(bom);
    bytes.extend(text.encode_utf16().flat_map(code_unit_bytes));
    bytes
}

#[cfg(test)]
mod tests {
    use super::{
        DecodedText, DocumentEncoding, InvalidEncoding, TextEncoding, decode_text, encode_text,
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

    fn decoded(bytes: &[u8]) -> Result<DecodedText, InvalidEncoding> {
        decode_text(bytes.to_vec())
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
    fn rejects_utf16_without_a_byte_order_mark() {
        assert_eq!(decoded(&[b'#', 0, b' ', 0, b'A', 0]), Err(InvalidEncoding));
        assert_eq!(decoded(&[0, b'#', 0, b' ', 0, b'A']), Err(InvalidEncoding));
    }

    #[test]
    fn rejects_decoded_text_containing_nul() {
        assert_eq!(decoded(b"a\0b"), Err(InvalidEncoding));
        assert_eq!(
            decoded(&with_bom(&[0xef, 0xbb, 0xbf], b"a\0b")),
            Err(InvalidEncoding)
        );
        assert_eq!(
            decoded(&[0xff, 0xfe, b'a', 0, 0, 0, b'b', 0]),
            Err(InvalidEncoding)
        );
        assert_eq!(
            decoded(&[0xfe, 0xff, 0, b'a', 0, 0, 0, b'b']),
            Err(InvalidEncoding)
        );
    }

    #[test]
    fn rejects_malformed_utf8() {
        assert_eq!(decoded(&[b'a', 0xc3]), Err(InvalidEncoding));
        assert_eq!(decoded(&[0x80, 0x81]), Err(InvalidEncoding));
        assert_eq!(
            decoded(&with_bom(&[0xef, 0xbb, 0xbf], &[b'a', 0xc3])),
            Err(InvalidEncoding)
        );
        assert_eq!(
            decoded(&with_bom(&[0xef, 0xbb, 0xbf], &[0xed, 0xa0, 0x80])),
            Err(InvalidEncoding)
        );
    }

    #[test]
    fn rejects_malformed_utf16_after_a_byte_order_mark() {
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
                Err(InvalidEncoding)
            );
            assert_eq!(
                decoded(&with_bom(&[0xfe, 0xff], big_endian_body.as_slice())),
                Err(InvalidEncoding)
            );
        }
    }

    #[test]
    fn encodes_text_in_each_encoding_and_byte_order_mark_form() {
        let text = "# é😀\r\n";

        assert_eq!(&*encode_text(text, DocumentEncoding::UTF8), text.as_bytes());
        assert_eq!(
            &*encode_text(text, UTF8_BOM),
            with_bom(&[0xef, 0xbb, 0xbf], text.as_bytes()).as_slice()
        );
        assert_eq!(
            &*encode_text(text, UTF16LE_BOM),
            &[
                0xff, 0xfe, b'#', 0, b' ', 0, 0xe9, 0, 0x3d, 0xd8, 0x00, 0xde, b'\r', 0, b'\n', 0
            ]
        );
        assert_eq!(
            &*encode_text(text, UTF16BE_BOM),
            &[
                0xfe, 0xff, 0, b'#', 0, b' ', 0, 0xe9, 0xd8, 0x3d, 0xde, 0x00, 0, b'\r', 0, b'\n'
            ]
        );
    }

    #[test]
    fn serializes_encodings_with_their_standard_names() {
        assert_eq!(
            serde_json::to_value(UTF16LE_BOM).unwrap(),
            serde_json::json!({ "name": "UTF-16LE", "bom": true })
        );
        assert_eq!(
            serde_json::from_value::<DocumentEncoding>(
                serde_json::json!({ "name": "UTF-16BE", "bom": false })
            )
            .unwrap(),
            DocumentEncoding {
                name: TextEncoding::Utf16Be,
                bom: false,
            }
        );
        assert!(
            serde_json::from_value::<DocumentEncoding>(
                serde_json::json!({ "name": "windows-1252", "bom": false })
            )
            .is_err()
        );
    }
}
