use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::{
    document::{
        FileMetadataSnapshot, OpenMarkdownFileError, read_markdown_file,
        read_markdown_file_metadata,
    },
    path_utils::path_to_string,
};

/// The most files one request reads, so a request cannot hold the backend for a whole folder.
const MAX_FILES_PER_REQUEST: usize = 128;
/// The text one request returns before it stops early. A single file under the load limit can
/// exceed it, so a request still returns at least that file.
const MAX_CONTENT_BYTES_PER_REQUEST: usize = 4 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderSearchFileRequest {
    pub(crate) path: String,
    /// The metadata of the version the caller already read, which needs no second read.
    pub(crate) known_metadata: Option<FileMetadataSnapshot>,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum FolderSearchFileOutcome {
    /// The file still has the metadata the caller named.
    Unchanged { path: String },
    Read {
        path: String,
        content: String,
        metadata: FileMetadataSnapshot,
        fingerprint: String,
    },
    /// The file could not be opened as a document, for the reason opening it would give.
    Skipped {
        path: String,
        error: OpenMarkdownFileError,
    },
    /// The path names no article of the folder: it lies outside it or is a symbolic link, which
    /// folder scans never follow.
    NotArticle { path: String },
}

/// Reads the files in request order through the document loader, stopping early once the text
/// read reaches the request's budget. The caller asks again for the files not reached.
pub(super) fn read_search_files(
    folder_path: &Path,
    files: Vec<FolderSearchFileRequest>,
) -> Vec<FolderSearchFileOutcome> {
    let mut outcomes = Vec::new();
    let mut content_bytes = 0;

    for request in files.into_iter().take(MAX_FILES_PER_REQUEST) {
        let outcome = read_search_file(folder_path, request);

        if let FolderSearchFileOutcome::Read { content, .. } = &outcome {
            content_bytes += content.len();
        }

        outcomes.push(outcome);

        if content_bytes >= MAX_CONTENT_BYTES_PER_REQUEST {
            break;
        }
    }

    outcomes
}

fn read_search_file(
    folder_path: &Path,
    FolderSearchFileRequest {
        path,
        known_metadata,
    }: FolderSearchFileRequest,
) -> FolderSearchFileOutcome {
    let file_path = PathBuf::from(path.as_str());

    if !is_inside_folder(folder_path, file_path.as_path()) || is_symlink(file_path.as_path()) {
        return FolderSearchFileOutcome::NotArticle {
            path: path_to_string(file_path.as_path()),
        };
    }

    if let Some(known_metadata) = known_metadata {
        match read_markdown_file_metadata(file_path.as_path()) {
            Ok(metadata) if metadata == known_metadata => {
                return FolderSearchFileOutcome::Unchanged {
                    path: path_to_string(file_path.as_path()),
                };
            }
            Ok(_) => {}
            Err(error) => {
                return FolderSearchFileOutcome::Skipped {
                    path: path_to_string(file_path.as_path()),
                    error,
                };
            }
        }
    }

    match read_markdown_file(file_path.as_path(), None) {
        Ok(document) => FolderSearchFileOutcome::Read {
            path: document.path,
            content: document.content,
            metadata: document.metadata,
            fingerprint: document.fingerprint,
        },
        Err(error) => FolderSearchFileOutcome::Skipped {
            path: path_to_string(file_path.as_path()),
            error,
        },
    }
}

// Paths come from the folder's own scan, so a lexical check suffices: reading is no privilege the
// open command does not already grant, and the scan never descends through a symbolic link.
fn is_inside_folder(folder_path: &Path, path: &Path) -> bool {
    path.strip_prefix(folder_path).is_ok_and(|relative| {
        relative.components().next().is_some()
            && relative
                .components()
                .all(|component| matches!(component, Component::Normal(_)))
    })
}

fn is_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink())
}

#[cfg(test)]
mod tests {
    use super::{
        FolderSearchFileOutcome, FolderSearchFileRequest, MAX_CONTENT_BYTES_PER_REQUEST,
        MAX_FILES_PER_REQUEST, read_search_files,
    };
    use crate::{
        document::{FileMetadataSnapshot, OpenMarkdownFileError},
        path_utils::path_to_string,
        test_utils::{TestDirectory, create_file_symlink},
    };

    fn request(path: &std::path::Path) -> FolderSearchFileRequest {
        FolderSearchFileRequest {
            path: path_to_string(path),
            known_metadata: None,
        }
    }

    fn read_content(outcome: &FolderSearchFileOutcome) -> &str {
        match outcome {
            FolderSearchFileOutcome::Read { content, .. } => content.as_str(),
            other => panic!("expected a read file, got {other:?}"),
        }
    }

    fn read_metadata(outcome: &FolderSearchFileOutcome) -> FileMetadataSnapshot {
        match outcome {
            FolderSearchFileOutcome::Read { metadata, .. } => *metadata,
            other => panic!("expected a read file, got {other:?}"),
        }
    }

    #[test]
    fn reads_files_in_request_order_through_the_document_loader() {
        let root = TestDirectory::new("folder-search-read");
        let first = root.write_file_with_content("b.md", "# Second\n");
        let second =
            root.write_file_with_content("docs/a.markdown", [0xff, 0xfe, b'h', 0, b'i', 0]);

        let outcomes = read_search_files(
            root.path.as_path(),
            vec![request(first.as_path()), request(second.as_path())],
        );

        assert_eq!(outcomes.len(), 2);
        assert_eq!(read_content(&outcomes[0]), "# Second\n");
        assert_eq!(read_content(&outcomes[1]), "hi");
    }

    #[test]
    fn reports_a_file_unchanged_while_it_keeps_the_known_metadata() {
        let root = TestDirectory::new("folder-search-unchanged");
        let path = root.write_file_with_content("note.md", "leaf\n");
        let metadata = read_metadata(
            &read_search_files(root.path.as_path(), vec![request(path.as_path())])[0],
        );
        let known = |known_metadata| FolderSearchFileRequest {
            path: path_to_string(path.as_path()),
            known_metadata: Some(known_metadata),
        };

        assert!(matches!(
            read_search_files(root.path.as_path(), vec![known(metadata)]).as_slice(),
            [FolderSearchFileOutcome::Unchanged { .. }]
        ));

        let stale = FileMetadataSnapshot {
            size_bytes: metadata.size_bytes + 1,
            ..metadata
        };

        assert_eq!(
            read_content(&read_search_files(root.path.as_path(), vec![known(stale)])[0]),
            "leaf\n"
        );
    }

    #[test]
    fn skips_files_the_loader_refuses_and_reads_the_rest() {
        let root = TestDirectory::new("folder-search-skipped");
        let invalid = root.write_file_with_content("invalid.md", [b'a', 0xff, b'b']);
        let oversized = root.write_file_with_content(
            "oversized.md",
            vec![b'a'; (crate::document::MAX_MARKDOWN_FILE_SIZE_BYTES + 1) as usize],
        );
        let missing = root.path("missing.md");
        let readable = root.write_file_with_content("readable.md", "leaf\n");

        let outcomes = read_search_files(
            root.path.as_path(),
            vec![
                request(invalid.as_path()),
                request(oversized.as_path()),
                request(missing.as_path()),
                request(readable.as_path()),
            ],
        );

        assert!(matches!(
            &outcomes[0],
            FolderSearchFileOutcome::Skipped {
                error: OpenMarkdownFileError::InvalidEncoding { .. },
                ..
            }
        ));
        assert!(matches!(
            &outcomes[1],
            FolderSearchFileOutcome::Skipped {
                error: OpenMarkdownFileError::OversizedFile { .. },
                ..
            }
        ));
        assert!(matches!(
            &outcomes[2],
            FolderSearchFileOutcome::Skipped {
                error: OpenMarkdownFileError::MissingFile { .. },
                ..
            }
        ));
        assert_eq!(read_content(&outcomes[3]), "leaf\n");
    }

    #[test]
    fn refuses_paths_outside_the_folder() {
        let root = TestDirectory::new("folder-search-outside");
        let folder = root.create_directory("folder");
        let outside = root.write_file_with_content("outside.md", "leaf\n");
        let traversal = folder.join("..").join("outside.md");

        let outcomes = read_search_files(
            folder.as_path(),
            vec![
                request(outside.as_path()),
                request(traversal.as_path()),
                request(folder.as_path()),
            ],
        );

        assert!(
            outcomes
                .iter()
                .all(|outcome| matches!(outcome, FolderSearchFileOutcome::NotArticle { .. }))
        );
    }

    #[test]
    fn refuses_a_symlinked_file() {
        let root = TestDirectory::new("folder-search-symlink");
        let target = root.write_file_with_content("target.md", "leaf\n");
        let link = root.path("link.md");

        if create_file_symlink(target.as_path(), link.as_path()).is_err() {
            return;
        }

        assert!(matches!(
            read_search_files(root.path.as_path(), vec![request(link.as_path())]).as_slice(),
            [FolderSearchFileOutcome::NotArticle { .. }]
        ));
    }

    #[test]
    fn stops_once_a_request_has_read_its_budget() {
        let root = TestDirectory::new("folder-search-budget");
        let large = vec![b'a'; MAX_CONTENT_BYTES_PER_REQUEST / 2 + 1];
        let paths = (0..3)
            .map(|index| root.write_file_with_content(&format!("{index}.md"), large.as_slice()))
            .collect::<Vec<_>>();

        let outcomes = read_search_files(
            root.path.as_path(),
            paths.iter().map(|path| request(path.as_path())).collect(),
        );

        assert_eq!(outcomes.len(), 2);
    }

    #[test]
    fn reads_at_most_a_bounded_number_of_files_per_request() {
        let root = TestDirectory::new("folder-search-count");
        let path = root.write_file_with_content("note.md", "leaf\n");

        let outcomes = read_search_files(
            root.path.as_path(),
            (0..MAX_FILES_PER_REQUEST + 1)
                .map(|_| request(path.as_path()))
                .collect(),
        );

        assert_eq!(outcomes.len(), MAX_FILES_PER_REQUEST);
    }
}
