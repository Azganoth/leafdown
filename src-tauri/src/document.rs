use std::{
    cmp::Ordering,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};

use crate::{
    file_utils::{ReadUtf8FileError, read_utf8_file_with_size_limit, write_file_atomically},
    path_utils::path_to_string,
};

pub(crate) const MARKDOWN_FILE_EXTENSIONS: [&str; 2] = ["md", "markdown"];
pub(crate) const MAX_MARKDOWN_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenMarkdownFileResult {
    pub(crate) path: String,
    pub(crate) parent_folder_path: String,
    pub(crate) content: String,
    pub(crate) line_ending: Option<LineEnding>,
    pub(crate) metadata: FileMetadataSnapshot,
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
    WriteFailed {
        path: String,
        message: String,
    },
    MetadataFailed {
        path: String,
        message: String,
    },
}

#[tauri::command]
pub(crate) async fn open_markdown_file(
    path: String,
) -> Result<OpenMarkdownFileResult, OpenMarkdownFileError> {
    let path = PathBuf::from(path);
    let error_path = path_to_string(path.as_path());

    tauri::async_runtime::spawn_blocking(move || read_markdown_file(path.as_path()))
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
    expected_metadata: Option<FileMetadataSnapshot>,
    overwrite: Option<bool>,
) -> Result<SaveMarkdownFileResult, SaveMarkdownFileError> {
    let path = PathBuf::from(path);
    let error_path = path_to_string(path.as_path());

    tauri::async_runtime::spawn_blocking(move || {
        write_markdown_file(
            path.as_path(),
            content.as_str(),
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

pub(crate) fn read_markdown_file(
    path: &Path,
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

    let content = read_markdown_file_content(path, serialized_path.as_str())?;

    Ok(OpenMarkdownFileResult {
        path: serialized_path,
        parent_folder_path,
        line_ending: detect_line_ending(&content),
        content,
        metadata,
    })
}

pub(crate) fn write_markdown_file(
    path: &Path,
    content: &str,
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

    verify_file_freshness(path, &serialized_path, expected_metadata, overwrite)?;

    write_file_atomically(path, content.as_bytes())
        .map_err(|error| save_write_error(error, path, serialized_path.as_str()))?;

    let metadata = read_file_metadata(path)
        .map_err(|error| save_metadata_error(error, serialized_path.as_str()))?;

    Ok(SaveMarkdownFileResult {
        path: serialized_path,
        parent_folder_path,
        metadata,
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
) -> Result<String, OpenMarkdownFileError> {
    read_utf8_file_with_size_limit(path, MAX_MARKDOWN_FILE_SIZE_BYTES).map_err(
        |error| match error {
            ReadUtf8FileError::ReadFailed(error) => open_read_error(error, serialized_path),
            ReadUtf8FileError::Oversized {
                size_bytes,
                max_size_bytes,
            } => OpenMarkdownFileError::OversizedFile {
                path: serialized_path.to_owned(),
                size_bytes,
                max_size_bytes,
            },
            ReadUtf8FileError::InvalidEncoding => OpenMarkdownFileError::InvalidEncoding {
                path: serialized_path.to_owned(),
            },
        },
    )
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
    let metadata = fs::metadata(path).map_err(|error| match error.kind() {
        ErrorKind::InvalidInput => FileMetadataReadError::InvalidPath,
        ErrorKind::NotFound => FileMetadataReadError::MissingFile,
        ErrorKind::PermissionDenied => FileMetadataReadError::PermissionDenied(error.to_string()),
        _ => FileMetadataReadError::Failed(error.to_string()),
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
    match error.kind() {
        ErrorKind::InvalidInput => OpenMarkdownFileError::InvalidPath {
            path: path.to_owned(),
        },
        ErrorKind::NotFound => OpenMarkdownFileError::MissingFile {
            path: path.to_owned(),
        },
        ErrorKind::PermissionDenied => OpenMarkdownFileError::PermissionDenied {
            path: path.to_owned(),
            message: error.to_string(),
        },
        _ => OpenMarkdownFileError::ReadFailed {
            path: path.to_owned(),
            message: error.to_string(),
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
    match error.kind() {
        ErrorKind::InvalidInput => SaveMarkdownFileError::InvalidPath {
            path: serialized_path.to_owned(),
        },
        ErrorKind::NotFound => save_missing_write_target_error(path, serialized_path),
        ErrorKind::PermissionDenied => SaveMarkdownFileError::PermissionDenied {
            path: serialized_path.to_owned(),
            message: error.to_string(),
        },
        _ => SaveMarkdownFileError::WriteFailed {
            path: serialized_path.to_owned(),
            message: error.to_string(),
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
    };

    use super::{
        FileMetadataReadError, LineEnding, MAX_MARKDOWN_FILE_SIZE_BYTES, OpenMarkdownFileError,
        SaveMarkdownFileError, detect_line_ending, open_metadata_error, open_read_error,
        read_markdown_file, save_metadata_error, save_write_error, write_markdown_file,
    };
    use crate::test_utils::TestDirectory;

    struct TestFile {
        root: TestDirectory,
        path: PathBuf,
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

        let result = read_markdown_file(&file.path).expect("Markdown file should open");

        assert_eq!(result.path, file.path.to_string_lossy());
        assert_eq!(result.parent_folder_path, expected_parent(&file.path));
        assert_eq!(result.content, "# Leafdown\r\n");
        assert_eq!(result.line_ending, Some(LineEnding::Crlf));
        assert_eq!(result.metadata.size_bytes, 12);
        assert!(result.metadata.modified_at_unix_ms > 0);
    }

    #[test]
    fn reads_empty_markdown_files() {
        let file = create_test_file("empty.md", "");

        let result = read_markdown_file(&file.path).expect("empty Markdown file should open");

        assert_eq!(result.content, "");
        assert_eq!(result.line_ending, None);
        assert_eq!(result.metadata.size_bytes, 0);
    }

    #[test]
    fn rejects_missing_markdown_files() {
        let file = create_test_file("missing.md", "");
        fs::remove_file(&file.path).expect("test file should be removed");

        let error = read_markdown_file(&file.path).expect_err("missing file should be rejected");

        assert_matches!(error, OpenMarkdownFileError::MissingFile { .. });
    }

    #[test]
    fn rejects_markdown_files_larger_than_the_loading_limit() {
        let oversized_content = vec![b'A'; (MAX_MARKDOWN_FILE_SIZE_BYTES + 1) as usize];
        let file = create_test_file_bytes("large.md", oversized_content.as_slice());

        let error = read_markdown_file(&file.path).expect_err("oversized file should be rejected");

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

        let error = read_markdown_file(&file.path).expect_err("invalid UTF-8 should be rejected");

        assert_matches!(error, OpenMarkdownFileError::InvalidEncoding { .. });
    }

    #[test]
    fn rejects_unsupported_file_types() {
        let file = create_test_file("notes.txt", "not Markdown");

        let error = read_markdown_file(&file.path).expect_err("text file should be rejected");

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

        let result = write_markdown_file(&file.path, "# Leafdown\r\n", None, false)
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

        let result = write_markdown_file(&file.path, "New document\n", None, false)
            .expect("Markdown file should save");

        assert_eq!(fs::read_to_string(&file.path).unwrap(), "New document\n");
        assert_eq!(result.metadata.size_bytes, 13);
    }

    #[test]
    fn reports_missing_parent_folder_when_save_target_parent_does_not_exist() {
        let root = TestDirectory::new("save-missing-parent");
        let path = root.path("missing/readme.md");
        let parent_folder_path = path.parent().unwrap().to_string_lossy().into_owned();

        let error = write_markdown_file(&path, "New document\n", None, false)
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

        let error = write_markdown_file(&unsupported_path, "not Markdown", None, false)
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
        let opened = read_markdown_file(&file.path).expect("metadata should be read");

        let result = write_markdown_file(&file.path, "updated", Some(opened.metadata), false)
            .expect("fresh Markdown file should save");

        assert_eq!(fs::read_to_string(&file.path).unwrap(), "updated");
        assert_eq!(result.metadata.size_bytes, 7);
    }

    #[test]
    fn rejects_missing_saved_files_when_expected_metadata_is_supplied() {
        let file = create_test_file("document.md", "old content");
        let opened = read_markdown_file(&file.path).expect("metadata should be read");
        fs::remove_file(&file.path).expect("test file should be removed");

        let error = write_markdown_file(&file.path, "updated", Some(opened.metadata), false)
            .expect_err("missing saved file should not be recreated");

        assert_matches!(error, SaveMarkdownFileError::MissingFile { .. });
        assert!(!file.path.exists());
    }

    #[test]
    fn rejects_external_modifications_without_overwrite() {
        let file = create_test_file("document.md", "old content");
        let opened = read_markdown_file(&file.path).expect("metadata should be read");
        fs::write(&file.path, "external change").expect("test file should be changed");

        let error = write_markdown_file(&file.path, "updated", Some(opened.metadata), false)
            .expect_err("changed saved file should not be overwritten");

        assert_matches!(error, SaveMarkdownFileError::ExternalModification { .. });
        assert_eq!(fs::read_to_string(&file.path).unwrap(), "external change");
    }

    #[test]
    fn overwrites_external_modifications_after_confirmation() {
        let file = create_test_file("document.md", "old content");
        let opened = read_markdown_file(&file.path).expect("metadata should be read");
        fs::write(&file.path, "external change").expect("test file should be changed");

        write_markdown_file(&file.path, "updated", Some(opened.metadata), true)
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
}
