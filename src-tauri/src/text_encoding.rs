use encoding_rs::{EncoderResult, Encoding, UTF_8, UTF_16BE, UTF_16LE};
use serde::{Deserialize, Serialize};

const MAX_REPORTED_UNREPRESENTABLE_CHARACTERS: usize = 8;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DocumentEncoding {
    pub(crate) name: String,
    pub(crate) bom: bool,
}

impl DocumentEncoding {
    pub(crate) fn utf8() -> Self {
        Self::new(UTF_8, false)
    }

    fn new(encoding: &'static Encoding, bom: bool) -> Self {
        Self {
            name: encoding.name().to_owned(),
            bom,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum DecodeError {
    UnknownEncoding,
    Malformed,
    ContainsNul,
    Irreversible,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum EncodeError {
    UnknownEncoding,
    Unrepresentable { characters: Vec<char> },
}

pub(crate) fn decode(
    bytes: &[u8],
    selected: Option<&str>,
) -> Result<(String, DocumentEncoding), DecodeError> {
    let (encoding, bom, body) = match Encoding::for_bom(bytes) {
        Some((encoding, bom_length)) => (encoding, true, &bytes[bom_length..]),
        None => match selected {
            Some(label) => (
                resolve(label).ok_or(DecodeError::UnknownEncoding)?,
                false,
                bytes,
            ),
            None => (UTF_8, false, bytes),
        },
    };
    let text = encoding
        .decode_without_bom_handling_and_without_replacement(body)
        .ok_or(DecodeError::Malformed)?
        .into_owned();

    if text.contains('\0') {
        return Err(DecodeError::ContainsNul);
    }

    let document_encoding = DocumentEncoding::new(encoding, bom);

    if encoding != UTF_8 && encode(&text, &document_encoding).ok().as_deref() != Some(bytes) {
        return Err(DecodeError::Irreversible);
    }

    Ok((text, document_encoding))
}

pub(crate) fn encode(text: &str, target: &DocumentEncoding) -> Result<Vec<u8>, EncodeError> {
    let encoding = resolve(target.name.as_str()).ok_or(EncodeError::UnknownEncoding)?;
    let mut bytes = Vec::with_capacity(text.len() + 3);

    if target.bom {
        bytes.extend_from_slice(bom_bytes(encoding));
    }

    if encoding == UTF_8 {
        bytes.extend_from_slice(text.as_bytes());
        return Ok(bytes);
    }

    if encoding == UTF_16LE || encoding == UTF_16BE {
        for unit in text.encode_utf16() {
            bytes.extend_from_slice(&if encoding == UTF_16LE {
                unit.to_le_bytes()
            } else {
                unit.to_be_bytes()
            });
        }
        return Ok(bytes);
    }

    let unrepresentable = collect_unrepresentable_characters(text, encoding);

    if !unrepresentable.is_empty() {
        return Err(EncodeError::Unrepresentable {
            characters: unrepresentable,
        });
    }

    let mut encoder = encoding.new_encoder();
    bytes.reserve(
        encoder
            .max_buffer_length_from_utf8_without_replacement(text.len())
            .unwrap_or(text.len() * 4),
    );
    let (result, _) = encoder.encode_from_utf8_to_vec_without_replacement(text, &mut bytes, true);
    debug_assert_eq!(result, EncoderResult::InputEmpty);

    Ok(bytes)
}

fn resolve(name: &str) -> Option<&'static Encoding> {
    Encoding::for_label_no_replacement(name.as_bytes())
}

fn bom_bytes(encoding: &'static Encoding) -> &'static [u8] {
    if encoding == UTF_16LE {
        &[0xFF, 0xFE]
    } else if encoding == UTF_16BE {
        &[0xFE, 0xFF]
    } else {
        &[0xEF, 0xBB, 0xBF]
    }
}

fn collect_unrepresentable_characters(text: &str, encoding: &'static Encoding) -> Vec<char> {
    let mut characters = Vec::new();
    let mut remaining = text;
    let mut scratch = Vec::new();

    while !remaining.is_empty() && characters.len() < MAX_REPORTED_UNREPRESENTABLE_CHARACTERS {
        let mut encoder = encoding.new_encoder();
        scratch.clear();
        scratch.reserve(remaining.len() * 4 + 16);
        let (result, read) =
            encoder.encode_from_utf8_to_vec_without_replacement(remaining, &mut scratch, true);

        match result {
            EncoderResult::Unmappable(character) => {
                if !characters.contains(&character) {
                    characters.push(character);
                }
                remaining = &remaining[read..];
            }
            EncoderResult::InputEmpty | EncoderResult::OutputFull => break,
        }
    }

    characters
}
