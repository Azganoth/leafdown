use std::{
    cmp::Ordering,
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};

pub(crate) const MARKDOWN_FILE_EXTENSIONS: [&str; 2] = ["md", "markdown"];

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

#[derive(Debug, Serialize)]
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
    UnsupportedFileType { path: String },
    MissingParentFolder { path: String },
    ReadFailed { path: String, message: String },
    MetadataFailed { path: String, message: String },
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum SaveMarkdownFileError {
    UnsupportedFileType { path: String },
    MissingParentFolder { path: String },
    WriteFailed { path: String, message: String },
    MetadataFailed { path: String, message: String },
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
) -> Result<SaveMarkdownFileResult, SaveMarkdownFileError> {
    write_markdown_file(PathBuf::from(path).as_path(), content.as_str())
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

    let parent_folder_path = path.parent().map(path_to_string).ok_or_else(|| {
        OpenMarkdownFileError::MissingParentFolder {
            path: serialized_path.clone(),
        }
    })?;
    let metadata =
        read_file_metadata(path).map_err(|message| OpenMarkdownFileError::MetadataFailed {
            path: serialized_path.clone(),
            message,
        })?;
    let content = fs::read_to_string(path).map_err(|error| OpenMarkdownFileError::ReadFailed {
        path: serialized_path.clone(),
        message: error.to_string(),
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
) -> Result<SaveMarkdownFileResult, SaveMarkdownFileError> {
    let serialized_path = path_to_string(path);

    if !is_supported_markdown_path(path) {
        return Err(SaveMarkdownFileError::UnsupportedFileType {
            path: serialized_path,
        });
    }

    let parent_folder_path = path.parent().map(path_to_string).ok_or_else(|| {
        SaveMarkdownFileError::MissingParentFolder {
            path: serialized_path.clone(),
        }
    })?;

    fs::write(path, content).map_err(|error| SaveMarkdownFileError::WriteFailed {
        path: serialized_path.clone(),
        message: error.to_string(),
    })?;

    let metadata =
        read_file_metadata(path).map_err(|message| SaveMarkdownFileError::MetadataFailed {
            path: serialized_path.clone(),
            message,
        })?;

    Ok(SaveMarkdownFileResult {
        path: serialized_path,
        parent_folder_path,
        metadata,
    })
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

fn read_file_metadata(path: &Path) -> Result<FileMetadataSnapshot, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified_at_unix_ms = metadata
        .modified()
        .map_err(|error| error.to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis()
        .try_into()
        .map_err(|error: std::num::TryFromIntError| error.to_string())?;

    Ok(FileMetadataSnapshot {
        size_bytes: metadata.len(),
        modified_at_unix_ms,
    })
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
        OpenMarkdownFileError, SaveMarkdownFileError,
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

        let result = write_markdown_file(&file.path, "# Leafdown\r\n")
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

        let result =
            write_markdown_file(&file.path, "New document\n").expect("Markdown file should save");

        assert_eq!(fs::read_to_string(&file.path).unwrap(), "New document\n");
        assert_eq!(result.metadata.size_bytes, 13);
    }

    #[test]
    fn rejects_unsupported_save_file_types() {
        let file = create_test_file("notes.md", "");
        let unsupported_path = file.root.join("notes.txt");

        let error = write_markdown_file(&unsupported_path, "not Markdown")
            .expect_err("text file should be rejected");

        assert!(matches!(
            error,
            SaveMarkdownFileError::UnsupportedFileType { .. }
        ));
        assert!(!unsupported_path.exists());
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
