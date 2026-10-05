use std::{
    cmp::Ordering,
    fs,
    hash::{DefaultHasher, Hasher},
    io::{self, Read},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};

use crate::{
    file_utils::{ReadFileError, read_file_with_size_limit, write_file_atomically},
    path_utils::{IoErrorClass, classify_io_error, path_to_string},
    text_encoding::{
        DecodeError, DecodedText, DocumentEncoding, TextEncoding, UnrepresentableCharacters,
        decode_text, encode_text,
    },
};

mod watch;

pub(crate) use watch::{DocumentWatcherState, WatchMarkdownDocumentError};

pub(crate) const MARKDOWN_FILE_EXTENSIONS: [&str; 2] = ["md", "markdown"];
pub(crate) const MAX_MARKDOWN_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024;

const FINGERPRINT_CHUNK_SIZE: u64 = 64 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenMarkdownFileResult {
    pub(crate) path: String,
    pub(crate) parent_folder_path: String,
    pub(crate) content: String,
    pub(crate) line_ending: Option<LineEnding>,
    pub(crate) encoding: DocumentEncoding,
    pub(crate) metadata: FileMetadataSnapshot,
    pub(crate) fingerprint: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub(crate) enum LineEnding {
    #[serde(rename = "lf")]
    Lf,
    #[serde(rename = "crlf")]
    Crlf,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileMetadataSnapshot {
    pub(crate) size_bytes: u64,
    pub(crate) modified_at_unix_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveMarkdownFileResult {
    pub(crate) path: String,
    pub(crate) parent_folder_path: String,
    pub(crate) metadata: FileMetadataSnapshot,
    pub(crate) fingerprint: String,
}

/// How a saved file compares with the version the frontend last read or wrote.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum MarkdownFileState {
    Unchanged,
    MetadataChanged {
        metadata: FileMetadataSnapshot,
    },
    ContentChanged {
        metadata: FileMetadataSnapshot,
        fingerprint: String,
    },
    Missing,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum OpenMarkdownFileError {
    UnsupportedFileType {
        path: String,
    },
    InvalidPath {
        path: String,
    },
    MissingFile {
        path: String,
    },
    PermissionDenied {
        path: String,
        message: String,
    },
    OversizedFile {
        path: String,
        size_bytes: u64,
        max_size_bytes: u64,
    },
    InvalidEncoding {
        path: String,
    },
    IrreversibleEncoding {
        path: String,
        encoding: TextEncoding,
    },
    ReadFailed {
        path: String,
        message: String,
    },
    MetadataFailed {
        path: String,
        message: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum SaveMarkdownFileError {
    UnsupportedFileType {
        path: String,
    },
    InvalidPath {
        path: String,
    },
    MissingFile {
        path: String,
    },
    MissingParentFolder {
        path: String,
        parent_folder_path: String,
    },
    PermissionDenied {
        path: String,
        message: String,
    },
    ExternalModification {
        path: String,
        current_metadata: FileMetadataSnapshot,
    },
    UnrepresentableCharacters {
        path: String,
        encoding: TextEncoding,
        characters: Vec<char>,
    },
    WriteFailed {
        path: String,
        message: String,
    },
    MetadataFailed {
        path: String,
        message: String,
    },
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum InspectMarkdownFileError {
    UnsupportedFileType { path: String },
    InvalidPath { path: String },
    PermissionDenied { path: String, message: String },
    ReadFailed { path: String, message: String },
    MetadataFailed { path: String, message: String },
}

#[tauri::command]
pub(crate) async fn open_markdown_file(
    path: String,
    encoding: Option<TextEncoding>,
) -> Result<OpenMarkdownFileResult, OpenMarkdownFileError> {
    let path = PathBuf::from(path);
    let error_path = path_to_string(path.as_path());

    tauri::async_runtime::spawn_blocking(move || read_markdown_file(path.as_path(), encoding))
        .await
        .unwrap_or_else(|error| {
            Err(OpenMarkdownFileError::ReadFailed {
                path: error_path,
                message: error.to_string(),
            })
        })
}

#[tauri::command]
pub(crate) async fn save_markdown_file(
    path: String,
    content: String,
    encoding: DocumentEncoding,
    expected_metadata: Option<FileMetadataSnapshot>,
    overwrite: Option<bool>,
) -> Result<SaveMarkdownFileResult, SaveMarkdownFileError> {
    let path = PathBuf::from(path);
    let error_path = path_to_string(path.as_path());

    tauri::async_runtime::spawn_blocking(move || {
        write_markdown_file(
            path.as_path(),
            content.as_str(),
            encoding,
            expected_metadata,
            overwrite.unwrap_or(false),
        )
    })
    .await
    .unwrap_or_else(|error| {
        Err(SaveMarkdownFileError::WriteFailed {
            path: error_path,
            message: error.to_string(),
        })
    })
}

#[tauri::command]
pub(crate) async fn inspect_markdown_file(
    path: String,
    metadata: FileMetadataSnapshot,
    fingerprint: String,
) -> Result<MarkdownFileState, InspectMarkdownFileError> {
    let path = PathBuf::from(path);
    let error_path = path_to_string(path.as_path());

    tauri::async_runtime::spawn_blocking(move || {
        inspect_markdown_file_state(path.as_path(), metadata, fingerprint.as_str())
    })
    .await
    .unwrap_or_else(|error| {
        Err(InspectMarkdownFileError::ReadFailed {
            path: error_path,
            message: error.to_string(),
        })
    })
}

#[tauri::command]
pub(crate) fn watch_markdown_document(
    app: tauri::AppHandle,
    state: tauri::State<'_, DocumentWatcherState>,
    path: String,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownDocumentError> {
    watch::watch_markdown_document(app, state, path, scope_id, scope_generation)
}

#[tauri::command]
pub(crate) fn unwatch_markdown_document(
    state: tauri::State<'_, DocumentWatcherState>,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownDocumentError> {
    watch::unwatch_markdown_document(state, scope_id, scope_generation)
}

pub(crate) fn read_markdown_file(
    path: &Path,
    chosen_encoding: Option<TextEncoding>,
) -> Result<OpenMarkdownFileResult, OpenMarkdownFileError> {
    let serialized_path = path_to_string(path);

    if !is_supported_markdown_path(path) {
        return Err(OpenMarkdownFileError::UnsupportedFileType {
            path: serialized_path,
        });
    }

    let parent_folder_path =
        path.parent()
            .map(path_to_string)
            .ok_or_else(|| OpenMarkdownFileError::InvalidPath {
                path: serialized_path.clone(),
            })?;
    let metadata = read_file_metadata(path)
        .map_err(|error| open_metadata_error(error, serialized_path.as_str()))?;

    if metadata.size_bytes > MAX_MARKDOWN_FILE_SIZE_BYTES {
        return Err(OpenMarkdownFileError::OversizedFile {
            path: serialized_path,
            size_bytes: metadata.size_bytes,
            max_size_bytes: MAX_MARKDOWN_FILE_SIZE_BYTES,
        });
    }

    let (DecodedText { text, encoding }, fingerprint) =
        read_markdown_file_content(path, serialized_path.as_str(), chosen_encoding)?;

    Ok(OpenMarkdownFileResult {
        path: serialized_path,
        parent_folder_path,
        line_ending: detect_line_ending(&text),
        content: text,
        encoding,
        metadata,
        fingerprint,
    })
}

/// The metadata `read_markdown_file` records for a file, read without reading the file.
pub(crate) fn read_markdown_file_metadata(
    path: &Path,
) -> Result<FileMetadataSnapshot, OpenMarkdownFileError> {
    read_file_metadata(path).map_err(|error| open_metadata_error(error, &path_to_string(path)))
}

pub(crate) fn write_markdown_file(
    path: &Path,
    content: &str,
    encoding: DocumentEncoding,
    expected_metadata: Option<FileMetadataSnapshot>,
    overwrite: bool,
) -> Result<SaveMarkdownFileResult, SaveMarkdownFileError> {
    let serialized_path = path_to_string(path);

    if !is_supported_markdown_path(path) {
        return Err(SaveMarkdownFileError::UnsupportedFileType {
            path: serialized_path,
        });
    }

    let parent_folder_path =
        path.parent()
            .map(path_to_string)
            .ok_or_else(|| SaveMarkdownFileError::InvalidPath {
                path: serialized_path.clone(),
            })?;

    let bytes =
        encode_text(content, encoding).map_err(|UnrepresentableCharacters { characters }| {
            SaveMarkdownFileError::UnrepresentableCharacters {
                path: serialized_path.clone(),
                encoding: encoding.name,
                characters,
            }
        })?;

    verify_file_freshness(path, &serialized_path, expected_metadata, overwrite)?;

    write_file_atomically(path, &bytes)
        .map_err(|error| save_write_error(error, path, serialized_path.as_str()))?;

    let metadata = read_file_metadata(path)
        .map_err(|error| save_metadata_error(error, serialized_path.as_str()))?;

    Ok(SaveMarkdownFileResult {
        path: serialized_path,
        parent_folder_path,
        metadata,
        fingerprint: fingerprint_bytes(&bytes),
    })
}

fn verify_file_freshness(
    path: &Path,
    serialized_path: &str,
    expected_metadata: Option<FileMetadataSnapshot>,
    overwrite: bool,
) -> Result<(), SaveMarkdownFileError> {
    let Some(expected_metadata) = expected_metadata else {
        return Ok(());
    };
    let current_metadata =
        read_file_metadata(path).map_err(|error| save_metadata_error(error, serialized_path))?;

    if !overwrite && current_metadata != expected_metadata {
        return Err(SaveMarkdownFileError::ExternalModification {
            path: serialized_path.to_owned(),
            current_metadata,
        });
    }

    Ok(())
}

pub(crate) fn is_supported_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(is_supported_markdown_extension)
}

fn is_supported_markdown_extension(extension: &str) -> bool {
    MARKDOWN_FILE_EXTENSIONS
        .iter()
        .any(|supported_extension| supported_extension.eq_ignore_ascii_case(extension))
}

fn read_markdown_file_content(
    path: &Path,
    serialized_path: &str,
    chosen_encoding: Option<TextEncoding>,
) -> Result<(DecodedText, String), OpenMarkdownFileError> {
    let bytes =
        read_file_with_size_limit(path, MAX_MARKDOWN_FILE_SIZE_BYTES).map_err(
            |error| match error {
                ReadFileError::ReadFailed(error) => open_read_error(error, serialized_path),
                ReadFileError::Oversized {
                    size_bytes,
                    max_size_bytes,
                } => OpenMarkdownFileError::OversizedFile {
                    path: serialized_path.to_owned(),
                    size_bytes,
                    max_size_bytes,
                },
            },
        )?;
    let fingerprint = fingerprint_bytes(bytes.as_slice());

    let decoded_text =
        decode_text(bytes, chosen_encoding).map_err(|error| match (error, chosen_encoding) {
            (DecodeError::Irreversible, Some(encoding)) => {
                OpenMarkdownFileError::IrreversibleEncoding {
                    path: serialized_path.to_owned(),
                    encoding,
                }
            }
            _ => OpenMarkdownFileError::InvalidEncoding {
                path: serialized_path.to_owned(),
            },
        })?;

    Ok((decoded_text, fingerprint))
}

pub(crate) fn inspect_markdown_file_state(
    path: &Path,
    expected_metadata: FileMetadataSnapshot,
    expected_fingerprint: &str,
) -> Result<MarkdownFileState, InspectMarkdownFileError> {
    let serialized_path = path_to_string(path);

    if !is_supported_markdown_path(path) {
        return Err(InspectMarkdownFileError::UnsupportedFileType {
            path: serialized_path,
        });
    }

    let metadata = match read_file_metadata(path) {
        Ok(metadata) => metadata,
        Err(FileMetadataReadError::MissingFile) => return Ok(MarkdownFileState::Missing),
        Err(FileMetadataReadError::InvalidPath) => {
            return Err(InspectMarkdownFileError::InvalidPath {
                path: serialized_path,
            });
        }
        Err(FileMetadataReadError::PermissionDenied(message)) => {
            return Err(InspectMarkdownFileError::PermissionDenied {
                path: serialized_path,
                message,
            });
        }
        Err(FileMetadataReadError::Failed(message)) => {
            return Err(InspectMarkdownFileError::MetadataFailed {
                path: serialized_path,
                message,
            });
        }
    };

    if metadata == expected_metadata {
        return Ok(MarkdownFileState::Unchanged);
    }

    if !path.is_file() {
        return Ok(MarkdownFileState::Missing);
    }

    let fingerprint = match fs::File::open(path).and_then(fingerprint_reader) {
        Ok(fingerprint) => fingerprint,
        Err(error) => {
            return match classify_io_error(error) {
                IoErrorClass::Missing => Ok(MarkdownFileState::Missing),
                IoErrorClass::InvalidPath => Err(InspectMarkdownFileError::InvalidPath {
                    path: serialized_path,
                }),
                IoErrorClass::PermissionDenied(message) => {
                    Err(InspectMarkdownFileError::PermissionDenied {
                        path: serialized_path,
                        message,
                    })
                }
                IoErrorClass::Failed(message) => Err(InspectMarkdownFileError::ReadFailed {
                    path: serialized_path,
                    message,
                }),
            };
        }
    };

    if fingerprint == expected_fingerprint {
        return Ok(MarkdownFileState::MetadataChanged { metadata });
    }

    Ok(MarkdownFileState::ContentChanged {
        metadata,
        fingerprint,
    })
}

fn fingerprint_bytes(bytes: &[u8]) -> String {
    fingerprint_reader(bytes).expect("reading from a byte slice cannot fail")
}

/// `Hasher` does not promise the same hash for the same bytes written in different pieces, so every
/// caller feeds it the same fixed-size chunks.
fn fingerprint_reader(mut reader: impl Read) -> io::Result<String> {
    let mut hasher = DefaultHasher::new();
    let mut chunk = Vec::new();

    loop {
        chunk.clear();
        reader
            .by_ref()
            .take(FINGERPRINT_CHUNK_SIZE)
            .read_to_end(&mut chunk)?;
        hasher.write(chunk.as_slice());

        if (chunk.len() as u64) < FINGERPRINT_CHUNK_SIZE {
            return Ok(format!("{:016x}", hasher.finish()));
        }
    }
}

fn detect_line_ending(content: &str) -> Option<LineEnding> {
    let bytes = content.as_bytes();
    let mut crlf_count = 0;
    let mut lf_count = 0;
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'\r' && bytes.get(index + 1) == Some(&b'\n') {
            crlf_count += 1;
            index += 2;
            continue;
        }

        if bytes[index] == b'\n' {
            lf_count += 1;
        }

        index += 1;
    }

    match lf_count.cmp(&crlf_count) {
        Ordering::Greater => Some(LineEnding::Lf),
        Ordering::Less => Some(LineEnding::Crlf),
        Ordering::Equal => None,
    }
}

#[derive(Debug)]
enum FileMetadataReadError {
    InvalidPath,
    MissingFile,
    PermissionDenied(String),
    Failed(String),
}

impl std::fmt::Display for FileMetadataReadError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPath => formatter.write_str("invalid path"),
            Self::MissingFile => formatter.write_str("file is missing"),
            Self::PermissionDenied(message) => formatter.write_str(message),
            Self::Failed(message) => formatter.write_str(message),
        }
    }
}

fn read_file_metadata(path: &Path) -> Result<FileMetadataSnapshot, FileMetadataReadError> {
    let metadata = fs::metadata(path).map_err(|error| match classify_io_error(error) {
        IoErrorClass::InvalidPath => FileMetadataReadError::InvalidPath,
        IoErrorClass::Missing => FileMetadataReadError::MissingFile,
        IoErrorClass::PermissionDenied(message) => FileMetadataReadError::PermissionDenied(message),
        IoErrorClass::Failed(message) => FileMetadataReadError::Failed(message),
    })?;
    let modified_at_unix_ms = metadata
        .modified()
        .map_err(|error| FileMetadataReadError::Failed(error.to_string()))?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| FileMetadataReadError::Failed(error.to_string()))?
        .as_millis()
        .try_into()
        .map_err(|error: std::num::TryFromIntError| {
            FileMetadataReadError::Failed(error.to_string())
        })?;

    Ok(FileMetadataSnapshot {
        size_bytes: metadata.len(),
        modified_at_unix_ms,
    })
}

fn open_metadata_error(error: FileMetadataReadError, path: &str) -> OpenMarkdownFileError {
    match error {
        FileMetadataReadError::InvalidPath => OpenMarkdownFileError::InvalidPath {
            path: path.to_owned(),
        },
        FileMetadataReadError::MissingFile => OpenMarkdownFileError::MissingFile {
            path: path.to_owned(),
        },
        FileMetadataReadError::PermissionDenied(message) => {
            OpenMarkdownFileError::PermissionDenied {
                path: path.to_owned(),
                message,
            }
        }
        FileMetadataReadError::Failed(message) => OpenMarkdownFileError::MetadataFailed {
            path: path.to_owned(),
            message,
        },
    }
}

fn open_read_error(error: std::io::Error, path: &str) -> OpenMarkdownFileError {
    match classify_io_error(error) {
        IoErrorClass::InvalidPath => OpenMarkdownFileError::InvalidPath {
            path: path.to_owned(),
        },
        IoErrorClass::Missing => OpenMarkdownFileError::MissingFile {
            path: path.to_owned(),
        },
        IoErrorClass::PermissionDenied(message) => OpenMarkdownFileError::PermissionDenied {
            path: path.to_owned(),
            message,
        },
        IoErrorClass::Failed(message) => OpenMarkdownFileError::ReadFailed {
            path: path.to_owned(),
            message,
        },
    }
}

fn save_metadata_error(error: FileMetadataReadError, path: &str) -> SaveMarkdownFileError {
    match error {
        FileMetadataReadError::InvalidPath => SaveMarkdownFileError::InvalidPath {
            path: path.to_owned(),
        },
        FileMetadataReadError::MissingFile => SaveMarkdownFileError::MissingFile {
            path: path.to_owned(),
        },
        FileMetadataReadError::PermissionDenied(message) => {
            SaveMarkdownFileError::PermissionDenied {
                path: path.to_owned(),
                message,
            }
        }
        FileMetadataReadError::Failed(message) => SaveMarkdownFileError::MetadataFailed {
            path: path.to_owned(),
            message,
        },
    }
}

fn save_write_error(
    error: std::io::Error,
    path: &Path,
    serialized_path: &str,
) -> SaveMarkdownFileError {
    match classify_io_error(error) {
        IoErrorClass::InvalidPath => SaveMarkdownFileError::InvalidPath {
            path: serialized_path.to_owned(),
        },
        IoErrorClass::Missing => save_missing_write_target_error(path, serialized_path),
        IoErrorClass::PermissionDenied(message) => SaveMarkdownFileError::PermissionDenied {
            path: serialized_path.to_owned(),
            message,
        },
        IoErrorClass::Failed(message) => SaveMarkdownFileError::WriteFailed {
            path: serialized_path.to_owned(),
            message,
        },
    }
}

fn save_missing_write_target_error(path: &Path, serialized_path: &str) -> SaveMarkdownFileError {
    let Some(parent_folder) = path.parent() else {
        return SaveMarkdownFileError::InvalidPath {
            path: serialized_path.to_owned(),
        };
    };

    if !parent_folder.exists() {
        return SaveMarkdownFileError::MissingParentFolder {
            path: serialized_path.to_owned(),
            parent_folder_path: path_to_string(parent_folder),
        };
    }

    SaveMarkdownFileError::MissingFile {
        path: serialized_path.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use std::assert_matches;
    use std::{
        fs,
        io::ErrorKind,
        path::{Path, PathBuf},
        time::{Duration, UNIX_EPOCH},
    };

    use super::{
        FINGERPRINT_CHUNK_SIZE, FileMetadataReadError, FileMetadataSnapshot,
        InspectMarkdownFileError, LineEnding, MAX_MARKDOWN_FILE_SIZE_BYTES, MarkdownFileState,
        OpenMarkdownFileError, SaveMarkdownFileError, detect_line_ending, fingerprint_bytes,
        fingerprint_reader, inspect_markdown_file_state, open_metadata_error, open_read_error,
        read_markdown_file, save_metadata_error, save_write_error, write_markdown_file,
    };
    use crate::{
        test_utils::TestDirectory,
        text_encoding::{DocumentEncoding, TextEncoding},
    };

    const FIXTURE_ENCODINGS: [DocumentEncoding; 4] = [
        DocumentEncoding::UTF8,
        DocumentEncoding {
            name: TextEncoding::Utf8,
            bom: true,
        },
        DocumentEncoding {
            name: TextEncoding::Utf16Le,
            bom: true,
        },
        DocumentEncoding {
            name: TextEncoding::Utf16Be,
            bom: true,
        },
    ];

    const FIXTURE_TEXTS: [(&str, LineEnding); 2] = [
        ("# Café 😀\n\n- one\n- two\n", LineEnding::Lf),
        ("# Café 😀\r\n\r\n- one\r\n- two\r\n", LineEnding::Crlf),
    ];

    struct TestFile {
        root: TestDirectory,
        path: PathBuf,
    }

    const LATIN: &str = "# Café\n\nNaïve résumé — “quotes” cost 10 €.\n";
    const CENTRAL_EUROPEAN: &str = "# Zažluťoučký kůň\n\nZażółć gęślą jaźń.\n";
    const CYRILLIC: &str = "# Привет\n\nЭто пример текста.\n";
    const UKRAINIAN: &str = "# Привіт\n\nЇжак і ґанок є.\n";
    const GREEK: &str = "# Καλημέρα\n\nΕλληνικό κείμενο.\n";
    const TURKISH: &str = "# Türkçe\n\nİstanbul'da ağır şoför.\n";
    const HEBREW: &str = "# שלום\n\nזהו טקסט לדוגמה.\n";
    const ARABIC: &str = "# مرحبا\n\nهذا نص تجريبي.\n";
    const BALTIC: &str = "# Labas\n\nŠiaulių ąžuolas, Rīga.\n";
    const VIETNAMESE: &str = "# Ti\u{ea}\u{301}ng Vi\u{ea}\u{323}t\n\n\u{111}\u{1b0}\u{1a1}ng.\n";
    const WESTERN_ISO: &str = "# Café\n\nPrix : 10 €, œuvre, Ÿ.\n";
    const JAPANESE: &str = "# 日本語\n\nこれは文字コードのテキストです。\n";
    const SIMPLIFIED_CHINESE: &str = "# 中文\n\n这是示例文本内容。\n";
    const TRADITIONAL_CHINESE: &str = "# 中文\n\n這是範例文字內容。\n";
    const KOREAN: &str = "# 한국어\n\n예제 텍스트입니다.\n";

    const CHOSEN_ENCODING_FIXTURES: [(TextEncoding, &str); 21] = [
        (TextEncoding::Windows1250, CENTRAL_EUROPEAN),
        (TextEncoding::Windows1251, CYRILLIC),
        (TextEncoding::Windows1252, LATIN),
        (TextEncoding::Windows1253, GREEK),
        (TextEncoding::Windows1254, TURKISH),
        (TextEncoding::Windows1255, HEBREW),
        (TextEncoding::Windows1256, ARABIC),
        (TextEncoding::Windows1257, BALTIC),
        (TextEncoding::Windows1258, VIETNAMESE),
        (TextEncoding::Iso8859_2, CENTRAL_EUROPEAN),
        (TextEncoding::Iso8859_15, WESTERN_ISO),
        (TextEncoding::Koi8R, CYRILLIC),
        (TextEncoding::Koi8U, UKRAINIAN),
        (TextEncoding::ShiftJis, JAPANESE),
        (TextEncoding::EucJp, JAPANESE),
        (TextEncoding::Gbk, SIMPLIFIED_CHINESE),
        (TextEncoding::Gb18030, SIMPLIFIED_CHINESE),
        (TextEncoding::Big5, TRADITIONAL_CHINESE),
        (TextEncoding::EucKr, KOREAN),
        (TextEncoding::Utf16Le, "# Café 😀\n\n日本語\n"),
        (TextEncoding::Utf16Be, "# Café 😀\n\n日本語\n"),
    ];

    fn legacy_encoding(name: TextEncoding) -> &'static encoding_rs::Encoding {
        match name {
            TextEncoding::Windows1250 => encoding_rs::WINDOWS_1250,
            TextEncoding::Windows1251 => encoding_rs::WINDOWS_1251,
            TextEncoding::Windows1252 => encoding_rs::WINDOWS_1252,
            TextEncoding::Windows1253 => encoding_rs::WINDOWS_1253,
            TextEncoding::Windows1254 => encoding_rs::WINDOWS_1254,
            TextEncoding::Windows1255 => encoding_rs::WINDOWS_1255,
            TextEncoding::Windows1256 => encoding_rs::WINDOWS_1256,
            TextEncoding::Windows1257 => encoding_rs::WINDOWS_1257,
            TextEncoding::Windows1258 => encoding_rs::WINDOWS_1258,
            TextEncoding::Iso8859_2 => encoding_rs::ISO_8859_2,
            TextEncoding::Iso8859_15 => encoding_rs::ISO_8859_15,
            TextEncoding::Koi8R => encoding_rs::KOI8_R,
            TextEncoding::Koi8U => encoding_rs::KOI8_U,
            TextEncoding::ShiftJis => encoding_rs::SHIFT_JIS,
            TextEncoding::EucJp => encoding_rs::EUC_JP,
            TextEncoding::Gbk => encoding_rs::GBK,
            TextEncoding::Gb18030 => encoding_rs::GB18030,
            TextEncoding::Big5 => encoding_rs::BIG5,
            TextEncoding::EucKr => encoding_rs::EUC_KR,
            TextEncoding::Utf8 | TextEncoding::Utf16Le | TextEncoding::Utf16Be => {
                panic!("{name:?} is not a legacy encoding")
            }
        }
    }

    fn fixture_bytes(text: &str, encoding: DocumentEncoding) -> Vec<u8> {
        let (bom, body): (&[u8], Vec<u8>) = match encoding.name {
            TextEncoding::Utf8 => (&[0xef, 0xbb, 0xbf], text.as_bytes().to_vec()),
            TextEncoding::Utf16Le => (
                &[0xff, 0xfe],
                text.encode_utf16().flat_map(u16::to_le_bytes).collect(),
            ),
            TextEncoding::Utf16Be => (
                &[0xfe, 0xff],
                text.encode_utf16().flat_map(u16::to_be_bytes).collect(),
            ),
            name => {
                let (body, _, had_unmappable) = legacy_encoding(name).encode(text);
                assert!(!had_unmappable, "{name:?} fixture should be representable");

                (&[], body.into_owned())
            }
        };

        if encoding.bom {
            [bom, body.as_slice()].concat()
        } else {
            body
        }
    }

    fn with_line_ending(text: &str, line_ending: LineEnding) -> String {
        match line_ending {
            LineEnding::Lf => text.to_owned(),
            LineEnding::Crlf => text.replace('\n', "\r\n"),
        }
    }

    fn create_test_file(file_name: &str, content: &str) -> TestFile {
        create_test_file_bytes(file_name, content.as_bytes())
    }

    fn create_test_file_bytes(file_name: &str, content: &[u8]) -> TestFile {
        let root = TestDirectory::new("open-markdown-file");
        let path = root.write_file_with_content(file_name, content);

        TestFile { root, path }
    }

    fn expected_parent(path: &Path) -> String {
        path.parent()
            .expect("test file should have a parent")
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn reads_supported_markdown_files_with_metadata() {
        let file = create_test_file("document.markdown", "# Leafdown\r\n");

        let result = read_markdown_file(&file.path, None).expect("Markdown file should open");

        assert_eq!(result.path, file.path.to_string_lossy());
        assert_eq!(result.parent_folder_path, expected_parent(&file.path));
        assert_eq!(result.content, "# Leafdown\r\n");
        assert_eq!(result.line_ending, Some(LineEnding::Crlf));
        assert_eq!(result.encoding, DocumentEncoding::UTF8);
        assert_eq!(result.metadata.size_bytes, 12);
        assert!(result.metadata.modified_at_unix_ms > 0);
    }

    #[test]
    fn saves_untouched_documents_back_byte_for_byte_in_their_encoding() {
        for encoding in FIXTURE_ENCODINGS {
            for (text, line_ending) in FIXTURE_TEXTS {
                let bytes = fixture_bytes(text, encoding);
                let file = create_test_file_bytes("document.md", bytes.as_slice());
                let case = format!("{encoding:?} {line_ending:?}");

                let opened = read_markdown_file(&file.path, None).expect("fixture should open");

                assert_eq!(opened.content, text, "{case}");
                assert_eq!(opened.encoding, encoding, "{case}");
                assert_eq!(opened.line_ending, Some(line_ending), "{case}");
                assert_eq!(opened.metadata.size_bytes, bytes.len() as u64, "{case}");

                write_markdown_file(
                    &file.path,
                    opened.content.as_str(),
                    opened.encoding,
                    Some(opened.metadata),
                    false,
                )
                .expect("untouched document should save");

                assert_eq!(fs::read(&file.path).unwrap(), bytes, "{case}");

                let save_as_path = file.root.path.join("copy.md");
                write_markdown_file(
                    &save_as_path,
                    opened.content.as_str(),
                    opened.encoding,
                    None,
                    false,
                )
                .expect("untouched document should save as a new file");

                assert_eq!(fs::read(&save_as_path).unwrap(), bytes, "{case}");
            }
        }
    }

    #[test]
    fn saves_untouched_documents_back_byte_for_byte_in_each_chosen_encoding() {
        for (name, text) in CHOSEN_ENCODING_FIXTURES {
            for line_ending in [LineEnding::Lf, LineEnding::Crlf] {
                let text = with_line_ending(text, line_ending);
                let encoding = DocumentEncoding { name, bom: false };
                let bytes = fixture_bytes(text.as_str(), encoding);
                let file = create_test_file_bytes("document.md", bytes.as_slice());
                let case = format!("{name:?} {line_ending:?}");

                assert_matches!(
                    read_markdown_file(&file.path, None),
                    Err(OpenMarkdownFileError::InvalidEncoding { .. }),
                    "{case} should need a chosen encoding"
                );

                let opened =
                    read_markdown_file(&file.path, Some(name)).expect("fixture should open");

                assert_eq!(opened.content, text, "{case}");
                assert_eq!(opened.encoding, encoding, "{case}");
                assert_eq!(opened.line_ending, Some(line_ending), "{case}");

                write_markdown_file(
                    &file.path,
                    opened.content.as_str(),
                    opened.encoding,
                    Some(opened.metadata),
                    false,
                )
                .expect("untouched document should save");

                assert_eq!(fs::read(&file.path).unwrap(), bytes, "{case}");

                let save_as_path = file.root.path.join("copy.md");
                write_markdown_file(
                    &save_as_path,
                    opened.content.as_str(),
                    opened.encoding,
                    None,
                    false,
                )
                .expect("untouched document should save as a new file");

                assert_eq!(fs::read(&save_as_path).unwrap(), bytes, "{case}");
            }
        }
    }

    #[test]
    fn refuses_a_chosen_encoding_that_would_rewrite_untouched_bytes() {
        let cases: [(TextEncoding, &[u8]); 3] = [
            (TextEncoding::ShiftJis, b"# A\n\x87\x90\n"),
            (TextEncoding::Big5, b"# A\n\x87\x40\n"),
            (TextEncoding::Gb18030, b"# A\n\x80\n"),
        ];

        for (name, bytes) in cases {
            let file = create_test_file_bytes("document.md", bytes);

            assert_matches!(
                read_markdown_file(&file.path, Some(name)),
                Err(OpenMarkdownFileError::IrreversibleEncoding { encoding, .. }) if encoding == name,
                "{name:?}"
            );
            assert_eq!(fs::read(&file.path).unwrap(), bytes, "{name:?}");
        }
    }

    #[test]
    fn rejects_bytes_malformed_under_the_chosen_encoding() {
        let cases: [(TextEncoding, &[u8]); 4] = [
            (TextEncoding::ShiftJis, b"# A\n\x82\x20\n"),
            (TextEncoding::EucKr, b"# A\n\xb0\x20\n"),
            (TextEncoding::Utf16Le, &[b'#', 0, b'A']),
            (TextEncoding::Windows1252, b"# A\0\n"),
        ];

        for (name, bytes) in cases {
            let file = create_test_file_bytes("document.md", bytes);

            assert_matches!(
                read_markdown_file(&file.path, Some(name)),
                Err(OpenMarkdownFileError::InvalidEncoding { .. }),
                "{name:?}"
            );
        }
    }

    #[test]
    fn a_byte_order_mark_outranks_the_chosen_encoding() {
        let utf8_bom = DocumentEncoding {
            name: TextEncoding::Utf8,
            bom: true,
        };
        let bytes = fixture_bytes("# Café\n", utf8_bom);
        let file = create_test_file_bytes("document.md", bytes.as_slice());

        let opened = read_markdown_file(&file.path, Some(TextEncoding::Windows1252))
            .expect("file with a byte order mark should open");

        assert_eq!(opened.content, "# Café\n");
        assert_eq!(opened.encoding, utf8_bom);
    }

    #[test]
    fn refuses_to_save_characters_the_encoding_cannot_represent() {
        let windows_1252 = DocumentEncoding {
            name: TextEncoding::Windows1252,
            bom: false,
        };
        let bytes = fixture_bytes(LATIN, windows_1252);
        let file = create_test_file_bytes("document.md", bytes.as_slice());
        let opened = read_markdown_file(&file.path, Some(TextEncoding::Windows1252))
            .expect("fixture should open");
        let edited = format!("{}Done ✓ 日 本 😀 ✓ 日\n", opened.content);

        let error = write_markdown_file(
            &file.path,
            edited.as_str(),
            opened.encoding,
            Some(opened.metadata),
            false,
        )
        .expect_err("unrepresentable characters should refuse the save");

        assert_matches!(
            error,
            SaveMarkdownFileError::UnrepresentableCharacters {
                encoding: TextEncoding::Windows1252,
                characters,
                ..
            } if characters == ['✓', '日', '本', '😀']
        );
        assert_eq!(fs::read(&file.path).unwrap(), bytes);

        write_markdown_file(
            &file.path,
            edited.as_str(),
            DocumentEncoding::UTF8,
            Some(opened.metadata),
            false,
        )
        .expect("document converted to UTF-8 should save");

        assert_eq!(fs::read_to_string(&file.path).unwrap(), edited);
    }

    #[test]
    fn rejects_bytes_without_an_unambiguous_encoding() {
        let cases: [(&str, &[u8]); 9] = [
            (
                "UTF-16LE without BOM",
                &[b'#', 0, b' ', 0, b'A', 0, b'\n', 0],
            ),
            (
                "UTF-16BE without BOM",
                &[0, b'#', 0, b' ', 0, b'A', 0, b'\n'],
            ),
            ("UTF-8 holding U+0000", b"# A\0B\n"),
            ("UTF-16LE holding U+0000", &[0xff, 0xfe, b'A', 0, 0, 0]),
            ("truncated UTF-8 after BOM", &[0xef, 0xbb, 0xbf, b'#', 0xc3]),
            (
                "odd UTF-16LE length after BOM",
                &[0xff, 0xfe, b'#', 0, b'A'],
            ),
            ("odd UTF-16BE length after BOM", &[0xfe, 0xff, 0, b'#', 0]),
            (
                "lone UTF-16LE surrogate after BOM",
                &[0xff, 0xfe, 0x3d, 0xd8, b'A', 0],
            ),
            (
                "lone UTF-16BE surrogate after BOM",
                &[0xfe, 0xff, 0xde, 0x00, 0, b'A'],
            ),
        ];

        for (case, bytes) in cases {
            let file = create_test_file_bytes("document.md", bytes);

            assert_matches!(
                read_markdown_file(&file.path, None),
                Err(OpenMarkdownFileError::InvalidEncoding { .. }),
                "{case}"
            );
        }
    }

    #[test]
    fn reads_empty_markdown_files() {
        let file = create_test_file("empty.md", "");

        let result = read_markdown_file(&file.path, None).expect("empty Markdown file should open");

        assert_eq!(result.content, "");
        assert_eq!(result.line_ending, None);
        assert_eq!(result.metadata.size_bytes, 0);
    }

    #[test]
    fn rejects_missing_markdown_files() {
        let file = create_test_file("missing.md", "");
        fs::remove_file(&file.path).expect("test file should be removed");

        let error =
            read_markdown_file(&file.path, None).expect_err("missing file should be rejected");

        assert_matches!(error, OpenMarkdownFileError::MissingFile { .. });
    }

    #[test]
    fn rejects_markdown_files_larger_than_the_loading_limit() {
        let oversized_content = vec![b'A'; (MAX_MARKDOWN_FILE_SIZE_BYTES + 1) as usize];
        let file = create_test_file_bytes("large.md", oversized_content.as_slice());

        let error =
            read_markdown_file(&file.path, None).expect_err("oversized file should be rejected");

        assert_matches!(
            error,
            OpenMarkdownFileError::OversizedFile {
                size_bytes,
                max_size_bytes,
                ..
            } if size_bytes == MAX_MARKDOWN_FILE_SIZE_BYTES + 1
                && max_size_bytes == MAX_MARKDOWN_FILE_SIZE_BYTES
        );
    }

    #[test]
    fn rejects_invalid_utf8_markdown_files() {
        let file = create_test_file_bytes("invalid.md", &[0x80, 0x81, 0xfe, 0xff]);

        let error =
            read_markdown_file(&file.path, None).expect_err("invalid UTF-8 should be rejected");

        assert_matches!(error, OpenMarkdownFileError::InvalidEncoding { .. });
    }

    #[test]
    fn rejects_unsupported_file_types() {
        let file = create_test_file("notes.txt", "not Markdown");

        let error = read_markdown_file(&file.path, None).expect_err("text file should be rejected");

        assert_matches!(error, OpenMarkdownFileError::UnsupportedFileType { .. });
    }

    #[test]
    fn maps_invalid_path_open_errors() {
        assert_matches!(
            open_metadata_error(FileMetadataReadError::InvalidPath, "bad:path"),
            OpenMarkdownFileError::InvalidPath { .. }
        );
        assert_matches!(
            open_read_error(std::io::Error::from(ErrorKind::InvalidInput), "bad:path"),
            OpenMarkdownFileError::InvalidPath { .. }
        );
    }

    #[test]
    fn writes_supported_markdown_files_with_metadata() {
        let file = create_test_file("document.md", "old content");

        let result = write_markdown_file(
            &file.path,
            "# Leafdown\r\n",
            DocumentEncoding::UTF8,
            None,
            false,
        )
        .expect("Markdown file should be written");

        assert_eq!(result.path, file.path.to_string_lossy());
        assert_eq!(result.parent_folder_path, expected_parent(&file.path));
        assert_eq!(fs::read_to_string(&file.path).unwrap(), "# Leafdown\r\n");
        assert_eq!(result.metadata.size_bytes, 12);
        assert!(result.metadata.modified_at_unix_ms > 0);
    }

    #[test]
    fn creates_supported_markdown_files() {
        let file = create_test_file("placeholder.md", "");
        fs::remove_file(&file.path).expect("placeholder should be removed");

        let result = write_markdown_file(
            &file.path,
            "New document\n",
            DocumentEncoding::UTF8,
            None,
            false,
        )
        .expect("Markdown file should save");

        assert_eq!(fs::read_to_string(&file.path).unwrap(), "New document\n");
        assert_eq!(result.metadata.size_bytes, 13);
    }

    #[test]
    fn reports_missing_parent_folder_when_save_target_parent_does_not_exist() {
        let root = TestDirectory::new("save-missing-parent");
        let path = root.path("missing/readme.md");
        let parent_folder_path = path.parent().unwrap().to_string_lossy().into_owned();

        let error =
            write_markdown_file(&path, "New document\n", DocumentEncoding::UTF8, None, false)
                .expect_err("missing parent folder should be reported separately");

        assert_matches!(
            error,
            SaveMarkdownFileError::MissingParentFolder {
                path: error_path,
                parent_folder_path: error_parent_folder_path,
            } if error_path == path.to_string_lossy()
                && error_parent_folder_path == parent_folder_path
        );
    }

    #[test]
    fn rejects_unsupported_save_file_types() {
        let file = create_test_file("notes.md", "");
        let unsupported_path = file.root.path.join("notes.txt");

        let error = write_markdown_file(
            &unsupported_path,
            "not Markdown",
            DocumentEncoding::UTF8,
            None,
            false,
        )
        .expect_err("text file should be rejected");

        assert_matches!(error, SaveMarkdownFileError::UnsupportedFileType { .. });
        assert!(!unsupported_path.exists());
    }

    #[test]
    fn maps_invalid_path_save_errors() {
        assert_matches!(
            save_metadata_error(FileMetadataReadError::InvalidPath, "bad:path"),
            SaveMarkdownFileError::InvalidPath { .. }
        );
        assert_matches!(
            save_write_error(
                std::io::Error::from(ErrorKind::InvalidInput),
                Path::new("bad:path"),
                "bad:path"
            ),
            SaveMarkdownFileError::InvalidPath { .. }
        );
    }

    #[test]
    fn writes_when_expected_metadata_matches() {
        let file = create_test_file("document.md", "old content");
        let opened = read_markdown_file(&file.path, None).expect("metadata should be read");

        let result = write_markdown_file(
            &file.path,
            "updated",
            DocumentEncoding::UTF8,
            Some(opened.metadata),
            false,
        )
        .expect("fresh Markdown file should save");

        assert_eq!(fs::read_to_string(&file.path).unwrap(), "updated");
        assert_eq!(result.metadata.size_bytes, 7);
    }

    #[test]
    fn rejects_missing_saved_files_when_expected_metadata_is_supplied() {
        let file = create_test_file("document.md", "old content");
        let opened = read_markdown_file(&file.path, None).expect("metadata should be read");
        fs::remove_file(&file.path).expect("test file should be removed");

        let error = write_markdown_file(
            &file.path,
            "updated",
            DocumentEncoding::UTF8,
            Some(opened.metadata),
            false,
        )
        .expect_err("missing saved file should not be recreated");

        assert_matches!(error, SaveMarkdownFileError::MissingFile { .. });
        assert!(!file.path.exists());
    }

    #[test]
    fn rejects_external_modifications_without_overwrite() {
        let file = create_test_file("document.md", "old content");
        let opened = read_markdown_file(&file.path, None).expect("metadata should be read");
        fs::write(&file.path, "external change").expect("test file should be changed");

        let error = write_markdown_file(
            &file.path,
            "updated",
            DocumentEncoding::UTF8,
            Some(opened.metadata),
            false,
        )
        .expect_err("changed saved file should not be overwritten");

        assert_matches!(error, SaveMarkdownFileError::ExternalModification { .. });
        assert_eq!(fs::read_to_string(&file.path).unwrap(), "external change");
    }

    #[test]
    fn rejects_files_rewritten_externally_in_another_encoding() {
        let file = create_test_file("document.md", "# Leafdown\n");
        let opened = read_markdown_file(&file.path, None).expect("metadata should be read");
        let rewritten = fixture_bytes(
            "# Leafdown\n",
            DocumentEncoding {
                name: TextEncoding::Utf16Le,
                bom: true,
            },
        );
        fs::write(&file.path, rewritten.as_slice()).expect("test file should be changed");

        let error = write_markdown_file(
            &file.path,
            opened.content.as_str(),
            opened.encoding,
            Some(opened.metadata),
            false,
        )
        .expect_err("file rewritten in another encoding should not be overwritten");

        assert_matches!(error, SaveMarkdownFileError::ExternalModification { .. });
        assert_eq!(fs::read(&file.path).unwrap(), rewritten);
    }

    #[test]
    fn overwrites_external_modifications_after_confirmation() {
        let file = create_test_file("document.md", "old content");
        let opened = read_markdown_file(&file.path, None).expect("metadata should be read");
        fs::write(&file.path, "external change").expect("test file should be changed");

        write_markdown_file(
            &file.path,
            "updated",
            DocumentEncoding::UTF8,
            Some(opened.metadata),
            true,
        )
        .expect("confirmed overwrite should save");

        assert_eq!(fs::read_to_string(&file.path).unwrap(), "updated");
    }

    #[test]
    fn detects_majority_line_endings() {
        assert_eq!(
            detect_line_ending("first\r\nsecond\r\nthird\n"),
            Some(LineEnding::Crlf)
        );
        assert_eq!(
            detect_line_ending("first\nsecond\nthird\r\n"),
            Some(LineEnding::Lf)
        );
        assert_eq!(detect_line_ending("one\r\ntwo\n"), None);
        assert_eq!(detect_line_ending("no newline"), None);
    }

    #[test]
    fn opening_and_saving_the_same_bytes_report_the_same_fingerprint() {
        let file = create_test_file("document.md", "# Same\n");

        let saved =
            write_markdown_file(&file.path, "# Same\n", DocumentEncoding::UTF8, None, false)
                .expect("Markdown file should save");
        let opened = read_markdown_file(&file.path, None).expect("Markdown file should open");

        assert_eq!(opened.fingerprint, saved.fingerprint);
        assert_ne!(
            fingerprint_bytes(b"# Other\n"),
            opened.fingerprint,
            "different bytes should not share a fingerprint"
        );
    }

    #[test]
    fn fingerprints_a_file_read_in_pieces_like_the_same_bytes_in_memory() {
        let chunk_size = FINGERPRINT_CHUNK_SIZE as usize;

        for length in [
            0,
            1,
            chunk_size - 1,
            chunk_size,
            chunk_size + 1,
            chunk_size * 2,
        ] {
            let bytes = (0..length)
                .map(|index| (index % 251) as u8)
                .collect::<Vec<_>>();
            let file = create_test_file_bytes("document.md", bytes.as_slice());
            let file_fingerprint = fs::File::open(&file.path)
                .and_then(fingerprint_reader)
                .expect("test file should be read");

            assert_eq!(
                file_fingerprint,
                fingerprint_bytes(bytes.as_slice()),
                "{length} bytes"
            );
        }
    }

    #[test]
    fn inspects_an_unchanged_file_from_its_metadata() {
        let file = create_test_file("document.md", "# Leafdown\n");
        let opened = read_markdown_file(&file.path, None).expect("Markdown file should open");

        assert_eq!(
            inspect_markdown_file_state(&file.path, opened.metadata, "not the fingerprint"),
            Ok(MarkdownFileState::Unchanged),
            "matching metadata should not need the file's bytes"
        );
    }

    #[test]
    fn inspects_a_touched_file_as_a_metadata_change() {
        let file = create_test_file("document.md", "# Leafdown\n");
        let opened = read_markdown_file(&file.path, None).expect("Markdown file should open");
        let touched_at = UNIX_EPOCH + Duration::from_millis(opened.metadata.modified_at_unix_ms)
            - Duration::from_secs(60);
        fs::File::options()
            .write(true)
            .open(&file.path)
            .and_then(|touched| touched.set_modified(touched_at))
            .expect("test file should be touched");

        let state = inspect_markdown_file_state(&file.path, opened.metadata, &opened.fingerprint)
            .expect("touched file should be inspected");

        assert_matches!(
            state,
            MarkdownFileState::MetadataChanged { metadata }
                if metadata.size_bytes == opened.metadata.size_bytes
                    && metadata.modified_at_unix_ms != opened.metadata.modified_at_unix_ms
        );
    }

    #[test]
    fn inspects_changed_bytes_as_a_content_change() {
        let file = create_test_file("document.md", "# Leafdown\n");
        let opened = read_markdown_file(&file.path, None).expect("Markdown file should open");
        // A different length changes the metadata even when both writes share a modification time.
        fs::write(&file.path, "# Changed outside\r\n").expect("test file should change");

        let state = inspect_markdown_file_state(&file.path, opened.metadata, &opened.fingerprint)
            .expect("changed file should be inspected");
        let reopened = read_markdown_file(&file.path, None).expect("Markdown file should open");

        assert_eq!(
            state,
            MarkdownFileState::ContentChanged {
                metadata: reopened.metadata,
                fingerprint: reopened.fingerprint,
            }
        );
    }

    #[test]
    fn inspects_a_removed_file_as_missing() {
        let file = create_test_file("document.md", "# Leafdown\n");
        let opened = read_markdown_file(&file.path, None).expect("Markdown file should open");
        fs::remove_file(&file.path).expect("test file should be removed");

        assert_eq!(
            inspect_markdown_file_state(&file.path, opened.metadata, &opened.fingerprint),
            Ok(MarkdownFileState::Missing)
        );

        fs::create_dir(&file.path).expect("a directory should take the file's path");

        assert_eq!(
            inspect_markdown_file_state(&file.path, opened.metadata, &opened.fingerprint),
            Ok(MarkdownFileState::Missing),
            "a directory at the path is not the document"
        );
    }

    #[test]
    fn refuses_to_inspect_unsupported_file_types() {
        let file = create_test_file("document.txt", "text");
        let metadata = FileMetadataSnapshot {
            size_bytes: 4,
            modified_at_unix_ms: 0,
        };

        assert_matches!(
            inspect_markdown_file_state(&file.path, metadata, ""),
            Err(InspectMarkdownFileError::UnsupportedFileType { .. })
        );
    }
}
