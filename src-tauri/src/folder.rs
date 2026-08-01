use std::{
    io::{self, ErrorKind},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::{
    document::{OpenMarkdownFileError, OpenMarkdownFileResult, read_markdown_file},
    path_utils::path_to_string,
};

mod defaults;
mod index;
mod scan;
mod watch;

pub(crate) use watch::{FolderWatcherState, WatchMarkdownFolderError};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderScanResult {
    pub(crate) path: String,
    pub(crate) tree: MarkdownFolderTree,
    pub(crate) is_empty: bool,
    pub(crate) warnings: Vec<ScanMarkdownFolderWarning>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenMarkdownFolderResult {
    pub(crate) folder: MarkdownFolderScanResult,
    pub(crate) index_document: Option<OpenMarkdownFileResult>,
    pub(crate) index_error: Option<OpenMarkdownFileError>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderTree {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) children: Vec<MarkdownFolderTreeNode>,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum MarkdownFolderTreeNode {
    Directory {
        name: String,
        path: String,
        children: Vec<MarkdownFolderTreeNode>,
    },
    File {
        name: String,
        path: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum ScanMarkdownFolderError {
    InvalidPath { path: String },
    MissingFolder { path: String },
    PermissionDenied { path: String, message: String },
    MetadataFailed { path: String, message: String },
    NotDirectory { path: String },
    ReadDirectoryFailed { path: String, message: String },
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum ScanMarkdownFolderWarning {
    InvalidPath { path: String },
    MissingFolder { path: String },
    PermissionDenied { path: String, message: String },
    MetadataFailed { path: String, message: String },
    ReadDirectoryFailed { path: String, message: String },
    DirectoryEntryFailed { path: String, message: String },
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum OpenMarkdownFolderError {
    ScanFailed { error: ScanMarkdownFolderError },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ScanDepth {
    Recursive,
    RootRestricted,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum FileTreeSortOrder {
    Name,
    ModifiedDate,
    Type,
}

#[tauri::command]
pub(crate) async fn scan_markdown_folder(
    path: String,
    ignored_directories: Option<Vec<String>>,
    sort_order: Option<FileTreeSortOrder>,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    let path = PathBuf::from(path);
    let error_path = path_to_string(path.as_path());
    let ignored_directories = ignored_directories.unwrap_or_else(defaults::ignored_directories);
    let sort_order = sort_order.unwrap_or(FileTreeSortOrder::Name);

    tauri::async_runtime::spawn_blocking(move || {
        scan_folder(path.as_path(), ignored_directories, sort_order)
    })
    .await
    .unwrap_or_else(|error| {
        Err(ScanMarkdownFolderError::ReadDirectoryFailed {
            path: error_path,
            message: error.to_string(),
        })
    })
}

#[tauri::command]
pub(crate) async fn open_markdown_folder(
    path: String,
    index_file_names: Option<Vec<String>>,
    ignored_directories: Option<Vec<String>>,
    sort_order: Option<FileTreeSortOrder>,
) -> Result<OpenMarkdownFolderResult, OpenMarkdownFolderError> {
    let path = PathBuf::from(path);
    let error_path = path_to_string(path.as_path());
    let index_file_names = index_file_names.unwrap_or_else(defaults::index_file_names);
    let ignored_directories = ignored_directories.unwrap_or_else(defaults::ignored_directories);
    let sort_order = sort_order.unwrap_or(FileTreeSortOrder::Name);

    tauri::async_runtime::spawn_blocking(move || {
        open_folder(
            path.as_path(),
            index_file_names,
            ignored_directories,
            sort_order,
        )
    })
    .await
    .unwrap_or_else(|error| {
        Err(OpenMarkdownFolderError::ScanFailed {
            error: ScanMarkdownFolderError::ReadDirectoryFailed {
                path: error_path,
                message: error.to_string(),
            },
        })
    })
}

#[tauri::command]
pub(crate) fn watch_markdown_folder(
    app: AppHandle,
    state: State<'_, FolderWatcherState>,
    path: String,
    ignored_directories: Option<Vec<String>>,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownFolderError> {
    watch::watch_markdown_folder(
        app,
        state,
        path,
        ignored_directories,
        scope_id,
        scope_generation,
    )
}

#[tauri::command]
pub(crate) fn unwatch_markdown_folder(
    state: State<'_, FolderWatcherState>,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownFolderError> {
    watch::unwatch_markdown_folder(state, scope_id, scope_generation)
}

fn open_folder(
    path: &Path,
    index_file_names: Vec<String>,
    ignored_directories: Vec<String>,
    sort_order: FileTreeSortOrder,
) -> Result<OpenMarkdownFolderResult, OpenMarkdownFolderError> {
    let folder = scan_folder(path, ignored_directories, sort_order)
        .map_err(|error| OpenMarkdownFolderError::ScanFailed { error })?;
    let index_path = index::find_root_index_path(&folder.tree, index_file_names.as_slice());
    let (index_document, index_error) = match index_path {
        Some(index_path) => match read_markdown_file(Path::new(index_path)) {
            Ok(index_document) => (Some(index_document), None),
            Err(error) => (None, Some(error)),
        },
        None => (None, None),
    };

    Ok(OpenMarkdownFolderResult {
        folder,
        index_document,
        index_error,
    })
}

fn scan_folder(
    path: &Path,
    ignored_directories: Vec<String>,
    sort_order: FileTreeSortOrder,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    scan::scan_folder(path, ignored_directories.as_slice(), sort_order)
}

fn scan_folder_metadata_error(error: io::Error, path: &Path) -> ScanMarkdownFolderError {
    let path = path_to_string(path);

    match error.kind() {
        ErrorKind::InvalidInput => ScanMarkdownFolderError::InvalidPath { path },
        ErrorKind::NotFound => ScanMarkdownFolderError::MissingFolder { path },
        ErrorKind::PermissionDenied => ScanMarkdownFolderError::PermissionDenied {
            path,
            message: error.to_string(),
        },
        _ => ScanMarkdownFolderError::MetadataFailed {
            path,
            message: error.to_string(),
        },
    }
}

fn scan_folder_read_error(error: io::Error, path: &Path) -> ScanMarkdownFolderError {
    let path = path_to_string(path);

    match error.kind() {
        ErrorKind::InvalidInput => ScanMarkdownFolderError::InvalidPath { path },
        ErrorKind::NotFound => ScanMarkdownFolderError::MissingFolder { path },
        ErrorKind::PermissionDenied => ScanMarkdownFolderError::PermissionDenied {
            path,
            message: error.to_string(),
        },
        _ => ScanMarkdownFolderError::ReadDirectoryFailed {
            path,
            message: error.to_string(),
        },
    }
}

pub(super) fn scan_folder_metadata_warning(
    error: io::Error,
    path: &Path,
) -> ScanMarkdownFolderWarning {
    let path = path_to_string(path);

    match error.kind() {
        ErrorKind::InvalidInput => ScanMarkdownFolderWarning::InvalidPath { path },
        ErrorKind::NotFound => ScanMarkdownFolderWarning::MissingFolder { path },
        ErrorKind::PermissionDenied => ScanMarkdownFolderWarning::PermissionDenied {
            path,
            message: error.to_string(),
        },
        _ => ScanMarkdownFolderWarning::MetadataFailed {
            path,
            message: error.to_string(),
        },
    }
}

pub(super) fn scan_folder_read_warning(error: io::Error, path: &Path) -> ScanMarkdownFolderWarning {
    let path = path_to_string(path);

    match error.kind() {
        ErrorKind::InvalidInput => ScanMarkdownFolderWarning::InvalidPath { path },
        ErrorKind::NotFound => ScanMarkdownFolderWarning::MissingFolder { path },
        ErrorKind::PermissionDenied => ScanMarkdownFolderWarning::PermissionDenied {
            path,
            message: error.to_string(),
        },
        _ => ScanMarkdownFolderWarning::ReadDirectoryFailed {
            path,
            message: error.to_string(),
        },
    }
}

#[cfg(test)]
fn scan_folder_with_depth(
    path: &Path,
    ignored_directories: &[String],
    depth: ScanDepth,
    sort_order: FileTreeSortOrder,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    scan::scan_folder_with_depth(path, ignored_directories, depth, sort_order)
}

#[cfg(test)]
mod tests {
    use std::assert_matches;
    use std::{
        fs,
        io::{self, ErrorKind},
        path::{Path, PathBuf},
        time::{Duration, UNIX_EPOCH},
    };

    use super::{
        FileTreeSortOrder, MarkdownFolderTree, MarkdownFolderTreeNode, ScanDepth,
        ScanMarkdownFolderError, defaults::ignored_directories, open_folder, scan_folder,
        scan_folder_metadata_error, scan_folder_read_error, scan_folder_with_depth,
    };
    use crate::{document::OpenMarkdownFileError, test_utils::TestDirectory};

    #[test]
    fn scans_markdown_files_and_keeps_non_ignored_directories() {
        let root = TestDirectory::new("scan-markdown-folder");
        root.write_file("readme.md");
        root.write_file("notes.MARKDOWN");
        root.write_file("notes.txt");
        root.write_file("nested/draft.md");
        root.create_directory("empty");

        let result = scan_folder(&root.path, ignored_directories(), FileTreeSortOrder::Name)
            .expect("Markdown folder should scan");

        assert!(!result.is_empty);
        assert!(tree_has_file(&result.tree, "readme.md"));
        assert!(tree_has_file(&result.tree, "notes.MARKDOWN"));
        assert!(tree_has_file(&result.tree, "draft.md"));
        assert!(!tree_has_file(&result.tree, "notes.txt"));
        assert!(tree_has_directory(&result.tree, "empty"));
    }

    #[test]
    fn skips_default_ignored_directories_with_platform_case_behavior() {
        let root = TestDirectory::new("scan-ignored-folders");
        root.write_file(".cache/hidden.md");
        root.write_file("NODE_MODULES/dependency.md");

        let result = scan_folder(&root.path, ignored_directories(), FileTreeSortOrder::Name)
            .expect("folder with ignored directories should scan");

        assert!(!tree_has_file(&result.tree, "hidden.md"));

        if cfg!(windows) {
            assert!(!tree_has_file(&result.tree, "dependency.md"));
        } else {
            assert!(tree_has_file(&result.tree, "dependency.md"));
        }
    }

    #[test]
    fn reports_empty_folder_contexts_while_preserving_empty_directories() {
        let root = TestDirectory::new("scan-empty-folder");
        root.create_directory("nested/empty");
        root.write_file("ignored.txt");

        let result = scan_folder(&root.path, ignored_directories(), FileTreeSortOrder::Name)
            .expect("empty Markdown folder should scan");

        assert!(result.is_empty);
        assert!(tree_has_directory(&result.tree, "nested"));
        assert!(tree_has_directory(&result.tree, "empty"));
    }

    #[test]
    fn restricts_root_scans_to_direct_children() {
        let root = TestDirectory::new("scan-root-depth");
        root.write_file("root.md");
        root.write_file("nested/hidden.md");

        let result = scan_folder_with_depth(
            &root.path,
            ignored_directories().as_slice(),
            ScanDepth::RootRestricted,
            FileTreeSortOrder::Name,
        )
        .expect("restricted root scan should complete");

        assert!(tree_has_file(&result.tree, "root.md"));
        assert!(!tree_has_file(&result.tree, "hidden.md"));
        assert!(tree_has_directory(&result.tree, "nested"));
    }

    #[test]
    fn does_not_follow_directory_symlinks() {
        let root = TestDirectory::new("scan-symlink-root");
        let target = TestDirectory::new("scan-symlink-target");
        target.write_file("linked.md");
        let symlink_path = root.path.join("linked-folder");

        if create_directory_symlink(&target.path, &symlink_path).is_err() {
            return;
        }

        let result = scan_folder(&root.path, ignored_directories(), FileTreeSortOrder::Name)
            .expect("folder with a symlink should scan");

        assert!(!tree_has_directory(&result.tree, "linked-folder"));
        assert!(!tree_has_file(&result.tree, "linked.md"));
    }

    #[test]
    fn sorts_directories_before_files_by_name_when_configured() {
        let root = TestDirectory::new("scan-name-sort");
        root.write_file("alpha.md");
        root.create_directory("zeta");

        let result = scan_folder(&root.path, ignored_directories(), FileTreeSortOrder::Name)
            .expect("folder should scan with name sorting");

        assert_eq!(direct_child_names(&result.tree), vec!["zeta", "alpha.md"]);
    }

    #[test]
    fn sorts_tree_nodes_by_type_when_configured() {
        let root = TestDirectory::new("scan-type-sort");
        root.write_file("zeta.md");
        root.write_file("alpha.markdown");
        root.create_directory("notes");

        let result = scan_folder(&root.path, ignored_directories(), FileTreeSortOrder::Type)
            .expect("folder should scan with type sorting");

        assert_eq!(
            direct_child_names(&result.tree),
            vec!["notes", "alpha.markdown", "zeta.md"]
        );
    }

    #[test]
    fn sorts_directories_before_files_by_modified_date_when_configured() {
        let root = TestDirectory::new("scan-modified-date-directory-sort");
        root.create_directory("zeta");
        write_file_with_modified_time(&root, "alpha.md", 2_200_000_000_000);

        let result = scan_folder(
            &root.path,
            ignored_directories(),
            FileTreeSortOrder::ModifiedDate,
        )
        .expect("folder should scan with modified-date sorting");

        assert_eq!(direct_child_names(&result.tree), vec!["zeta", "alpha.md"]);
    }

    #[test]
    fn sorts_tree_nodes_by_modified_date_when_configured() {
        let root = TestDirectory::new("scan-modified-date-sort");
        write_file_with_modified_time(&root, "older.md", 1_700_000_000_000);
        write_file_with_modified_time(&root, "newer.md", 1_700_000_001_000);

        let result = scan_folder(
            &root.path,
            ignored_directories(),
            FileTreeSortOrder::ModifiedDate,
        )
        .expect("folder should scan with modified-date sorting");

        assert_eq!(
            direct_child_names(&result.tree),
            vec!["newer.md", "older.md"]
        );
    }

    #[test]
    fn opens_root_indexes_in_configured_name_order() {
        let root = TestDirectory::new("open-index-order");
        root.write_file("readme.md");
        let expected_index = root.write_file("INDEX.markdown");
        root.write_file("nested/index.md");

        let result = open_folder(
            &root.path,
            vec!["index".to_owned(), "readme".to_owned()],
            ignored_directories(),
            FileTreeSortOrder::Name,
        )
        .expect("folder with indexes should open");

        assert_eq!(
            result
                .index_document
                .expect("configured index should open")
                .path,
            expected_index.to_string_lossy()
        );
    }

    #[test]
    fn prefers_md_indexes_over_markdown_indexes() {
        let root = TestDirectory::new("open-index-extension");
        root.write_file("readme.markdown");
        let expected_index = root.write_file("README.MD");

        let result = open_folder(
            &root.path,
            vec!["readme".to_owned()],
            ignored_directories(),
            FileTreeSortOrder::Name,
        )
        .expect("folder with same-name indexes should open");

        assert_eq!(
            result
                .index_document
                .expect("Markdown index should open")
                .path,
            expected_index.to_string_lossy()
        );
    }

    #[test]
    fn opens_folder_contexts_without_root_indexes() {
        let root = TestDirectory::new("open-folder-only");
        root.write_file("nested/index.md");

        let result = open_folder(
            &root.path,
            vec!["index".to_owned()],
            ignored_directories(),
            FileTreeSortOrder::Name,
        )
        .expect("folder without a root index should open");

        assert!(result.index_document.is_none());
        assert!(!result.folder.is_empty);
    }

    #[test]
    fn opens_folder_contexts_when_root_index_fails_to_open() {
        let root = TestDirectory::new("open-index-error");
        root.write_file_with_content("readme.md", [0xff, 0xfe]);
        root.write_file("article.md");

        let result = open_folder(
            &root.path,
            vec!["readme".to_owned()],
            ignored_directories(),
            FileTreeSortOrder::Name,
        )
        .expect("folder should still open when the index file fails");

        assert!(!result.folder.is_empty);
        assert!(result.index_document.is_none());
        assert_matches!(
            result.index_error,
            Some(OpenMarkdownFileError::InvalidEncoding { .. })
        );
    }

    #[test]
    fn reports_missing_scan_folder_paths() {
        let root = TestDirectory::new("missing-scan-folder");
        let missing_path = root.path("missing");

        let error = scan_folder(
            missing_path.as_path(),
            ignored_directories(),
            FileTreeSortOrder::Name,
        )
        .expect_err("missing folder should fail");

        assert_matches!(
            error,
            ScanMarkdownFolderError::MissingFolder { path }
                if path == missing_path.to_string_lossy()
        );
    }

    #[test]
    fn reports_non_directory_scan_paths() {
        let root = TestDirectory::new("scan-file-path");
        let file_path = root.write_file("readme.md");

        let error = scan_folder(
            file_path.as_path(),
            ignored_directories(),
            FileTreeSortOrder::Name,
        )
        .expect_err("file path should fail as a folder context");

        assert_matches!(
            error,
            ScanMarkdownFolderError::NotDirectory { path } if path == file_path.to_string_lossy()
        );
    }

    #[test]
    fn classifies_scan_folder_metadata_errors() {
        let path = Path::new("bad:path");

        assert_matches!(
            scan_folder_metadata_error(io::Error::from(ErrorKind::InvalidInput), path),
            ScanMarkdownFolderError::InvalidPath { .. }
        );
        assert_matches!(
            scan_folder_metadata_error(io::Error::from(ErrorKind::NotFound), path),
            ScanMarkdownFolderError::MissingFolder { .. }
        );
        assert_matches!(
            scan_folder_metadata_error(io::Error::from(ErrorKind::PermissionDenied), path),
            ScanMarkdownFolderError::PermissionDenied { .. }
        );
        assert_matches!(
            scan_folder_metadata_error(io::Error::from(ErrorKind::Other), path),
            ScanMarkdownFolderError::MetadataFailed { .. }
        );
    }

    #[test]
    fn classifies_scan_folder_read_errors() {
        let path = Path::new("bad:path");

        assert_matches!(
            scan_folder_read_error(io::Error::from(ErrorKind::InvalidInput), path),
            ScanMarkdownFolderError::InvalidPath { .. }
        );
        assert_matches!(
            scan_folder_read_error(io::Error::from(ErrorKind::NotFound), path),
            ScanMarkdownFolderError::MissingFolder { .. }
        );
        assert_matches!(
            scan_folder_read_error(io::Error::from(ErrorKind::PermissionDenied), path),
            ScanMarkdownFolderError::PermissionDenied { .. }
        );
        assert_matches!(
            scan_folder_read_error(io::Error::from(ErrorKind::Other), path),
            ScanMarkdownFolderError::ReadDirectoryFailed { .. }
        );
    }

    fn tree_has_directory(tree: &MarkdownFolderTree, name: &str) -> bool {
        child_nodes_have_directory(&tree.children, name)
    }

    fn direct_child_names(tree: &MarkdownFolderTree) -> Vec<&str> {
        tree.children
            .iter()
            .map(|child| match child {
                MarkdownFolderTreeNode::Directory { name, .. }
                | MarkdownFolderTreeNode::File { name, .. } => name.as_str(),
            })
            .collect()
    }

    fn write_file_with_modified_time(
        root: &TestDirectory,
        relative_path: &str,
        modified_at_unix_ms: u64,
    ) -> PathBuf {
        let path = root.write_file(relative_path);
        let modified_at = UNIX_EPOCH + Duration::from_millis(modified_at_unix_ms);

        fs::File::options()
            .write(true)
            .open(&path)
            .and_then(|file| file.set_modified(modified_at))
            .expect("test file modified time should be set");

        path
    }

    fn child_nodes_have_directory(children: &[MarkdownFolderTreeNode], name: &str) -> bool {
        children.iter().any(|child| match child {
            MarkdownFolderTreeNode::Directory {
                name: child_name,
                children,
                ..
            } => child_name == name || child_nodes_have_directory(children, name),
            MarkdownFolderTreeNode::File { .. } => false,
        })
    }

    fn tree_has_file(tree: &MarkdownFolderTree, name: &str) -> bool {
        tree.children.iter().any(|child| match child {
            MarkdownFolderTreeNode::Directory { children, .. } => {
                child_nodes_have_file(children, name)
            }
            MarkdownFolderTreeNode::File {
                name: child_name, ..
            } => child_name == name,
        })
    }

    fn child_nodes_have_file(children: &[MarkdownFolderTreeNode], name: &str) -> bool {
        children.iter().any(|child| match child {
            MarkdownFolderTreeNode::Directory { children, .. } => {
                child_nodes_have_file(children, name)
            }
            MarkdownFolderTreeNode::File {
                name: child_name, ..
            } => child_name == name,
        })
    }

    #[cfg(unix)]
    fn create_directory_symlink(target: &Path, symlink_path: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(target, symlink_path)
    }

    #[cfg(windows)]
    fn create_directory_symlink(target: &Path, symlink_path: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_dir(target, symlink_path)
    }
}
