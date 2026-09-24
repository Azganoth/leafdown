use std::{fs, path::PathBuf};

use serde::Serialize;

use crate::{
    document::is_supported_markdown_path,
    path_utils::{IoErrorClass, classify_io_error, path_to_string},
};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum DroppedPath {
    Folder { path: String },
    MarkdownFile { path: String },
    Unsupported { path: String },
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum InspectDroppedPathError {
    InvalidPath { path: String },
    MissingPath { path: String },
    PermissionDenied { path: String, message: String },
    MetadataFailed { path: String, message: String },
}

#[tauri::command]
pub(crate) async fn inspect_dropped_path(
    path: String,
) -> Result<DroppedPath, InspectDroppedPathError> {
    let path = PathBuf::from(path);
    let error_path = path_to_string(path.as_path());

    tauri::async_runtime::spawn_blocking(move || classify_dropped_path(path))
        .await
        .unwrap_or_else(|error| {
            Err(InspectDroppedPathError::MetadataFailed {
                path: error_path,
                message: error.to_string(),
            })
        })
}

fn classify_dropped_path(path: PathBuf) -> Result<DroppedPath, InspectDroppedPathError> {
    let serialized_path = path_to_string(path.as_path());
    let metadata =
        fs::metadata(path.as_path()).map_err(|error| match classify_io_error(error) {
            IoErrorClass::InvalidPath => InspectDroppedPathError::InvalidPath {
                path: serialized_path.clone(),
            },
            IoErrorClass::Missing => InspectDroppedPathError::MissingPath {
                path: serialized_path.clone(),
            },
            IoErrorClass::PermissionDenied(message) => InspectDroppedPathError::PermissionDenied {
                path: serialized_path.clone(),
                message,
            },
            IoErrorClass::Failed(message) => InspectDroppedPathError::MetadataFailed {
                path: serialized_path.clone(),
                message,
            },
        })?;

    if metadata.is_dir() {
        return Ok(DroppedPath::Folder {
            path: serialized_path,
        });
    }

    if metadata.is_file() && is_supported_markdown_path(path.as_path()) {
        return Ok(DroppedPath::MarkdownFile {
            path: serialized_path,
        });
    }

    Ok(DroppedPath::Unsupported {
        path: serialized_path,
    })
}

#[cfg(test)]
mod tests {
    use super::{DroppedPath, InspectDroppedPathError, classify_dropped_path};
    use crate::{path_utils::path_to_string, test_utils::TestDirectory};

    #[test]
    fn classifies_folders_markdown_files_and_unsupported_files() {
        let root = TestDirectory::new("inspect-drop");
        let folder_path = root.create_directory("docs");
        let markdown_path = root.write_file("notes.MARKDOWN");
        let unsupported_path = root.write_file("notes.txt");

        assert_eq!(
            classify_dropped_path(folder_path.clone()),
            Ok(DroppedPath::Folder {
                path: path_to_string(folder_path.as_path()),
            })
        );
        assert_eq!(
            classify_dropped_path(markdown_path.clone()),
            Ok(DroppedPath::MarkdownFile {
                path: path_to_string(markdown_path.as_path()),
            })
        );
        assert_eq!(
            classify_dropped_path(unsupported_path.clone()),
            Ok(DroppedPath::Unsupported {
                path: path_to_string(unsupported_path.as_path()),
            })
        );
    }

    #[test]
    fn reports_missing_dropped_paths() {
        let root = TestDirectory::new("inspect-drop-missing");
        let path = root.path("missing.md");

        assert_eq!(
            classify_dropped_path(path.clone()),
            Err(InspectDroppedPathError::MissingPath {
                path: path_to_string(path.as_path()),
            })
        );
    }
}
