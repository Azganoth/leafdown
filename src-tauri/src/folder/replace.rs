use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{
    document::{
        FileMetadataSnapshot, MAX_MARKDOWN_FILE_SIZE_BYTES, OpenMarkdownFileError,
        fingerprint_bytes, is_supported_markdown_path, read_markdown_file_metadata,
    },
    file_utils::{ReadFileError, read_file_with_size_limit, write_file_atomically},
    path_utils::{IoErrorClass, classify_io_error, path_to_string},
    text_encoding::{DocumentEncoding, TextEncoding, UnrepresentableCharacters, encode_text},
};

use super::search::{is_inside_folder, is_symlink};

/// The most files one request checks or writes, so a request cannot hold the backend for a whole
/// folder and the caller can report progress between requests.
const MAX_FILES_PER_REQUEST: usize = 32;

/// A file's planned text and the version of the file it was planned against.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderReplacementFile {
    pub(crate) path: String,
    pub(crate) content: String,
    pub(crate) encoding: DocumentEncoding,
    pub(crate) expected_metadata: FileMetadataSnapshot,
    pub(crate) expected_fingerprint: String,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum FolderReplacementOutcome {
    /// The file still holds the planned version and its text can be encoded; nothing was written.
    Ready {
        path: String,
    },
    Written {
        path: String,
    },
    /// The file is no longer the version the replacement was planned against, so it was left as
    /// it is.
    Stale {
        path: String,
        missing: bool,
    },
    Failed {
        path: String,
        error: FolderReplacementError,
    },
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum FolderReplacementError {
    /// The path lies outside the folder, is a symbolic link, or is not a Markdown file.
    NotArticle,
    UnrepresentableCharacters {
        encoding: TextEncoding,
        characters: Vec<char>,
    },
    PermissionDenied {
        message: String,
    },
    ReadFailed {
        message: String,
    },
    WriteFailed {
        message: String,
    },
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    Preflight,
    Write,
}

/// Checks the files in request order without writing any of them.
pub(super) fn preflight_replacement_files(
    folder_path: &Path,
    files: Vec<FolderReplacementFile>,
) -> Vec<FolderReplacementOutcome> {
    process_files(folder_path, files, Phase::Preflight)
}

/// Writes the files in request order, each on its own: a file that changed since it was planned
/// or cannot be written leaves the others to be written.
pub(super) fn write_replacement_files(
    folder_path: &Path,
    files: Vec<FolderReplacementFile>,
) -> Vec<FolderReplacementOutcome> {
    process_files(folder_path, files, Phase::Write)
}

fn process_files(
    folder_path: &Path,
    files: Vec<FolderReplacementFile>,
    phase: Phase,
) -> Vec<FolderReplacementOutcome> {
    files
        .into_iter()
        .take(MAX_FILES_PER_REQUEST)
        .map(|file| process_file(folder_path, file, phase))
        .collect()
}

fn process_file(
    folder_path: &Path,
    FolderReplacementFile {
        path,
        content,
        encoding,
        expected_metadata,
        expected_fingerprint,
    }: FolderReplacementFile,
    phase: Phase,
) -> FolderReplacementOutcome {
    let file_path = PathBuf::from(path.as_str());
    let path = path_to_string(file_path.as_path());
    let failed = |error| FolderReplacementOutcome::Failed {
        path: path.clone(),
        error,
    };

    if !is_inside_folder(folder_path, file_path.as_path())
        || is_symlink(file_path.as_path())
        || !is_supported_markdown_path(file_path.as_path())
    {
        return failed(FolderReplacementError::NotArticle);
    }

    let bytes = match encode_text(content.as_str(), encoding) {
        Ok(bytes) => bytes,
        Err(UnrepresentableCharacters { characters }) => {
            return failed(FolderReplacementError::UnrepresentableCharacters {
                encoding: encoding.name,
                characters,
            });
        }
    };

    // The check reads the whole file rather than trusting its metadata, and runs again for each
    // file just before it is written, so a change made after the preflight is still caught.
    match check_version(
        file_path.as_path(),
        expected_metadata,
        expected_fingerprint.as_str(),
    ) {
        Ok(VersionCheck::Current) => {}
        Ok(VersionCheck::Changed) => {
            return FolderReplacementOutcome::Stale {
                path,
                missing: false,
            };
        }
        Ok(VersionCheck::Missing) => {
            return FolderReplacementOutcome::Stale {
                path,
                missing: true,
            };
        }
        Err(error) => return failed(error),
    }

    if phase == Phase::Preflight {
        return FolderReplacementOutcome::Ready { path };
    }

    match write_file_atomically(file_path.as_path(), bytes.as_ref()) {
        Ok(()) => FolderReplacementOutcome::Written { path },
        Err(error) => failed(match classify_io_error(error) {
            IoErrorClass::PermissionDenied(message) => {
                FolderReplacementError::PermissionDenied { message }
            }
            IoErrorClass::InvalidPath | IoErrorClass::Missing => {
                FolderReplacementError::WriteFailed {
                    message: "the file's folder is no longer available".to_owned(),
                }
            }
            IoErrorClass::Failed(message) => FolderReplacementError::WriteFailed { message },
        }),
    }
}

enum VersionCheck {
    Current,
    Changed,
    Missing,
}

fn check_version(
    path: &Path,
    expected_metadata: FileMetadataSnapshot,
    expected_fingerprint: &str,
) -> Result<VersionCheck, FolderReplacementError> {
    match read_markdown_file_metadata(path) {
        Ok(metadata) if metadata == expected_metadata => {}
        Ok(_) => return Ok(VersionCheck::Changed),
        Err(OpenMarkdownFileError::MissingFile { .. }) => return Ok(VersionCheck::Missing),
        Err(OpenMarkdownFileError::PermissionDenied { message, .. }) => {
            return Err(FolderReplacementError::PermissionDenied { message });
        }
        Err(OpenMarkdownFileError::MetadataFailed { message, .. }) => {
            return Err(FolderReplacementError::ReadFailed { message });
        }
        Err(_) => return Err(FolderReplacementError::NotArticle),
    }

    match read_file_with_size_limit(path, MAX_MARKDOWN_FILE_SIZE_BYTES) {
        Ok(bytes) if fingerprint_bytes(bytes.as_slice()) == expected_fingerprint => {
            Ok(VersionCheck::Current)
        }
        Ok(_) | Err(ReadFileError::Oversized { .. }) => Ok(VersionCheck::Changed),
        Err(ReadFileError::ReadFailed(error)) => match classify_io_error(error) {
            IoErrorClass::Missing => Ok(VersionCheck::Missing),
            IoErrorClass::PermissionDenied(message) => {
                Err(FolderReplacementError::PermissionDenied { message })
            }
            IoErrorClass::InvalidPath => Err(FolderReplacementError::NotArticle),
            IoErrorClass::Failed(message) => Err(FolderReplacementError::ReadFailed { message }),
        },
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        FolderReplacementError, FolderReplacementFile, FolderReplacementOutcome,
        MAX_FILES_PER_REQUEST, preflight_replacement_files, write_replacement_files,
    };
    use crate::{
        document::{FileMetadataSnapshot, fingerprint_bytes, read_markdown_file_metadata},
        path_utils::path_to_string,
        test_utils::{TestDirectory, create_file_symlink},
        text_encoding::{DocumentEncoding, TextEncoding},
    };

    fn planned(path: &std::path::Path, content: &str) -> FolderReplacementFile {
        planned_in(path, content, DocumentEncoding::UTF8)
    }

    fn planned_in(
        path: &std::path::Path,
        content: &str,
        encoding: DocumentEncoding,
    ) -> FolderReplacementFile {
        let bytes = fs::read(path).unwrap_or_default();
        let metadata = read_markdown_file_metadata(path).unwrap_or(FileMetadataSnapshot {
            size_bytes: 0,
            modified_at_unix_ms: 0,
        });

        FolderReplacementFile {
            path: path_to_string(path),
            content: content.to_owned(),
            encoding,
            expected_metadata: metadata,
            expected_fingerprint: fingerprint_bytes(bytes.as_slice()),
        }
    }

    fn staging_files(directory: &std::path::Path) -> usize {
        fs::read_dir(directory)
            .expect("test directory should be listed")
            .filter(|entry| {
                entry.as_ref().is_ok_and(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .ends_with(".leafdown-tmp")
                })
            })
            .count()
    }

    #[test]
    fn preflight_checks_files_without_writing_them() {
        let root = TestDirectory::new("folder-replace-preflight");
        let path = root.write_file_with_content("note.md", "leaf\n");

        let outcomes =
            preflight_replacement_files(root.path.as_path(), vec![planned(&path, "tree\n")]);

        assert!(matches!(
            outcomes.as_slice(),
            [FolderReplacementOutcome::Ready { .. }]
        ));
        assert_eq!(fs::read_to_string(&path).unwrap(), "leaf\n");
    }

    #[test]
    fn writes_each_planned_file_in_its_encoding_and_byte_order_mark() {
        let root = TestDirectory::new("folder-replace-write");
        let utf8 = root.write_file_with_content("a.md", "leaf\n");
        let utf16 = root.write_file_with_content("docs/b.md", [0xff, 0xfe, b'h', 0, b'i', 0]);
        let utf16_encoding = DocumentEncoding {
            name: TextEncoding::Utf16Le,
            bom: true,
        };

        let outcomes = write_replacement_files(
            root.path.as_path(),
            vec![
                planned(&utf8, "tree\r\n"),
                planned_in(&utf16, "yo", utf16_encoding),
            ],
        );

        assert!(
            outcomes
                .iter()
                .all(|outcome| matches!(outcome, FolderReplacementOutcome::Written { .. }))
        );
        assert_eq!(fs::read(&utf8).unwrap(), b"tree\r\n");
        assert_eq!(fs::read(&utf16).unwrap(), [0xff, 0xfe, b'y', 0, b'o', 0]);
        assert_eq!(staging_files(root.path.as_path()), 0);
    }

    #[test]
    fn leaves_a_file_that_changed_since_it_was_planned_and_writes_the_rest() {
        let root = TestDirectory::new("folder-replace-stale");
        let changed = root.write_file_with_content("changed.md", "leaf\n");
        let removed = root.write_file_with_content("removed.md", "leaf\n");
        let current = root.write_file_with_content("current.md", "leaf\n");
        let plans = vec![
            planned(&changed, "tree\n"),
            planned(&removed, "tree\n"),
            planned(&current, "tree\n"),
        ];

        fs::write(&changed, "LEAF\n").unwrap();
        fs::remove_file(&removed).unwrap();

        let outcomes = write_replacement_files(root.path.as_path(), plans);

        assert!(matches!(
            &outcomes[0],
            FolderReplacementOutcome::Stale { missing: false, .. }
        ));
        assert!(matches!(
            &outcomes[1],
            FolderReplacementOutcome::Stale { missing: true, .. }
        ));
        assert!(matches!(
            &outcomes[2],
            FolderReplacementOutcome::Written { .. }
        ));
        assert_eq!(fs::read_to_string(&changed).unwrap(), "LEAF\n");
        assert!(!removed.exists());
        assert_eq!(fs::read_to_string(&current).unwrap(), "tree\n");
    }

    #[test]
    fn catches_a_change_that_keeps_the_file_metadata() {
        let root = TestDirectory::new("folder-replace-same-metadata");
        let path = root.write_file_with_content("note.md", "leaf\n");
        let mut plan = planned(&path, "tree\n");

        plan.expected_fingerprint = fingerprint_bytes(b"other\n");

        assert!(matches!(
            write_replacement_files(root.path.as_path(), vec![plan]).as_slice(),
            [FolderReplacementOutcome::Stale { missing: false, .. }]
        ));
        assert_eq!(fs::read_to_string(&path).unwrap(), "leaf\n");
    }

    #[test]
    fn refuses_text_its_encoding_cannot_represent_without_writing() {
        let root = TestDirectory::new("folder-replace-unrepresentable");
        let path = root.write_file_with_content("note.md", "leaf\n");
        let plan = planned_in(
            &path,
            "\u{1F343}\n",
            DocumentEncoding {
                name: TextEncoding::Windows1252,
                bom: false,
            },
        );

        let outcomes = write_replacement_files(root.path.as_path(), vec![plan]);

        assert!(matches!(
            outcomes.as_slice(),
            [FolderReplacementOutcome::Failed {
                error: FolderReplacementError::UnrepresentableCharacters { .. },
                ..
            }]
        ));
        assert_eq!(fs::read_to_string(&path).unwrap(), "leaf\n");
    }

    #[test]
    fn refuses_paths_that_are_not_articles_of_the_folder() {
        let root = TestDirectory::new("folder-replace-outside");
        let folder = root.create_directory("folder");
        let outside = root.write_file_with_content("outside.md", "leaf\n");
        let traversal = folder.join("..").join("outside.md");
        let text = root.write_file_with_content("folder/note.txt", "leaf\n");
        let target = root.write_file_with_content("folder/target.md", "leaf\n");
        let link = folder.join("link.md");
        let mut plans = vec![
            planned(&outside, "tree\n"),
            planned(&traversal, "tree\n"),
            planned(&text, "tree\n"),
        ];

        if create_file_symlink(target.as_path(), link.as_path()).is_ok() {
            plans.push(planned(&link, "tree\n"));
        }

        let outcomes = write_replacement_files(folder.as_path(), plans);

        assert!(outcomes.iter().all(|outcome| matches!(
            outcome,
            FolderReplacementOutcome::Failed {
                error: FolderReplacementError::NotArticle,
                ..
            }
        )));
        assert_eq!(fs::read_to_string(&outside).unwrap(), "leaf\n");
        assert_eq!(fs::read_to_string(&target).unwrap(), "leaf\n");
    }

    #[test]
    fn handles_at_most_a_bounded_number_of_files_per_request() {
        let root = TestDirectory::new("folder-replace-count");
        let path = root.write_file_with_content("note.md", "leaf\n");

        let outcomes = preflight_replacement_files(
            root.path.as_path(),
            (0..MAX_FILES_PER_REQUEST + 1)
                .map(|_| planned(&path, "tree\n"))
                .collect(),
        );

        assert_eq!(outcomes.len(), MAX_FILES_PER_REQUEST);
    }
}
