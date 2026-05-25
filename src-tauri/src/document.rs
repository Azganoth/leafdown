use std::{
    cmp::Ordering,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};

pub(crate) const MARKDOWN_FILE_EXTENSIONS: [&str; 2] = ["md", "markdown"];
pub(crate) const MAX_MARKDOWN_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenMarkdownFileResult {
    pub path: String,
    pub parent_folder_path: String,
    pub content: String,
    pub line_ending: Option<LineEnding>,
    pub metadata: FileMetadataSnapshot,
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
    pub size_bytes: u64,
    pub modified_at_unix_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveMarkdownFileResult {
    pub path: String,
    pub parent_folder_path: String,
    pub metadata: FileMetadataSnapshot,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
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
#[serde(tag = "kind", rename_all = "camelCase")]
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
pub(crate) fn open_markdown_file(
    path: String,
) -> Result<OpenMarkdownFileResult, OpenMarkdownFileError> {
    read_markdown_file(PathBuf::from(path).as_path())
}

#[tauri::command]
pub(crate) fn save_markdown_file(
    path: String,
    content: String,
    expected_metadata: Option<FileMetadataSnapshot>,
    overwrite: Option<bool>,
) -> Result<SaveMarkdownFileResult, SaveMarkdownFileError> {
    write_markdown_file(
        PathBuf::from(path).as_path(),
        content.as_str(),
        expected_metadata,
        overwrite.unwrap_or(false),
    )
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

    let content_bytes =
        fs::read(path).map_err(|error| open_read_error(error, serialized_path.as_str()))?;
    let content_size_bytes = content_bytes.len().try_into().unwrap_or(u64::MAX);

    if content_size_bytes > MAX_MARKDOWN_FILE_SIZE_BYTES {
        return Err(OpenMarkdownFileError::OversizedFile {
            path: serialized_path,
            size_bytes: content_size_bytes,
            max_size_bytes: MAX_MARKDOWN_FILE_SIZE_BYTES,
        });
    }

    let content =
        String::from_utf8(content_bytes).map_err(|_| OpenMarkdownFileError::InvalidEncoding {
            path: serialized_path.clone(),
        })?;

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

    fs::write(path, content).map_err(|error| save_write_error(error, serialized_path.as_str()))?;

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
    let current_metadata = read_file_metadata(path).map_err(|error| match error {
        FileMetadataReadError::MissingFile => SaveMarkdownFileError::MissingFile {
            path: serialized_path.to_owned(),
        },
        FileMetadataReadError::PermissionDenied(message) => {
            SaveMarkdownFileError::PermissionDenied {
                path: serialized_path.to_owned(),
                message,
            }
        }
        FileMetadataReadError::Failed(message) => SaveMarkdownFileError::MetadataFailed {
            path: serialized_path.to_owned(),
            message,
        },
    })?;

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
    MissingFile,
    PermissionDenied(String),
    Failed(String),
}

impl std::fmt::Display for FileMetadataReadError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingFile => formatter.write_str("file is missing"),
            Self::PermissionDenied(message) => formatter.write_str(message),
            Self::Failed(message) => formatter.write_str(message),
        }
    }
}

fn read_file_metadata(path: &Path) -> Result<FileMetadataSnapshot, FileMetadataReadError> {
    let metadata = fs::metadata(path).map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            FileMetadataReadError::MissingFile
        } else if error.kind() == ErrorKind::PermissionDenied {
            FileMetadataReadError::PermissionDenied(error.to_string())
        } else {
            FileMetadataReadError::Failed(error.to_string())
        }
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

fn save_write_error(error: std::io::Error, path: &str) -> SaveMarkdownFileError {
    match error.kind() {
        ErrorKind::NotFound => SaveMarkdownFileError::MissingFile {
            path: path.to_owned(),
        },
        ErrorKind::PermissionDenied => SaveMarkdownFileError::PermissionDenied {
            path: path.to_owned(),
            message: error.to_string(),
        },
        _ => SaveMarkdownFileError::WriteFailed {
            path: path.to_owned(),
            message: error.to_string(),
        },
    }
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, create_dir},
        path::{Path, PathBuf},
        sync::atomic::{AtomicUsize, Ordering},
    };

    use super::{
        detect_line_ending, read_markdown_file, write_markdown_file, LineEnding,
        OpenMarkdownFileError, SaveMarkdownFileError, MAX_MARKDOWN_FILE_SIZE_BYTES,
    };

    static NEXT_TEST_DIR_ID: AtomicUsize = AtomicUsize::new(0);

    struct TestFile {
        root: PathBuf,
        path: PathBuf,
    }

    impl Drop for TestFile {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn create_test_file(file_name: &str, content: &str) -> TestFile {
        create_test_file_bytes(file_name, content.as_bytes())
    }

    fn create_test_file_bytes(file_name: &str, content: &[u8]) -> TestFile {
        let id = NEXT_TEST_DIR_ID.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "leafdown-open-markdown-file-{}-{id}",
            std::process::id()
        ));
        let path = root.join(file_name);

        create_dir(&root).expect("test directory should be created");
        fs::write(&path, content).expect("test file should be written");

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

        assert!(matches!(error, OpenMarkdownFileError::MissingFile { .. }));
    }

    #[test]
    fn rejects_markdown_files_larger_than_the_loading_limit() {
        let oversized_content = vec![b'A'; (MAX_MARKDOWN_FILE_SIZE_BYTES + 1) as usize];
        let file = create_test_file_bytes("large.md", oversized_content.as_slice());

        let error = read_markdown_file(&file.path).expect_err("oversized file should be rejected");

        assert!(matches!(
            error,
            OpenMarkdownFileError::OversizedFile {
                size_bytes,
                max_size_bytes,
                ..
            } if size_bytes == MAX_MARKDOWN_FILE_SIZE_BYTES + 1
                && max_size_bytes == MAX_MARKDOWN_FILE_SIZE_BYTES
        ));
    }

    #[test]
    fn rejects_invalid_utf8_markdown_files() {
        let file = create_test_file_bytes("invalid.md", &[0x80, 0x81, 0xfe, 0xff]);

        let error = read_markdown_file(&file.path).expect_err("invalid UTF-8 should be rejected");

        assert!(matches!(
            error,
            OpenMarkdownFileError::InvalidEncoding { .. }
        ));
    }

    #[test]
    fn rejects_unsupported_file_types() {
        let file = create_test_file("notes.txt", "not Markdown");

        let error = read_markdown_file(&file.path).expect_err("text file should be rejected");

        assert!(matches!(
            error,
            OpenMarkdownFileError::UnsupportedFileType { .. }
        ));
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
    fn rejects_unsupported_save_file_types() {
        let file = create_test_file("notes.md", "");
        let unsupported_path = file.root.join("notes.txt");

        let error = write_markdown_file(&unsupported_path, "not Markdown", None, false)
            .expect_err("text file should be rejected");

        assert!(matches!(
            error,
            SaveMarkdownFileError::UnsupportedFileType { .. }
        ));
        assert!(!unsupported_path.exists());
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

        assert!(matches!(error, SaveMarkdownFileError::MissingFile { .. }));
        assert!(!file.path.exists());
    }

    #[test]
    fn rejects_external_modifications_without_overwrite() {
        let file = create_test_file("document.md", "old content");
        let opened = read_markdown_file(&file.path).expect("metadata should be read");
        fs::write(&file.path, "external change").expect("test file should be changed");

        let error = write_markdown_file(&file.path, "updated", Some(opened.metadata), false)
            .expect_err("changed saved file should not be overwritten");

        assert!(matches!(
            error,
            SaveMarkdownFileError::ExternalModification { .. }
        ));
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
