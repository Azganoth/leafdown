use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::document::{read_markdown_file, OpenMarkdownFileError, OpenMarkdownFileResult};

mod defaults;
mod index;
mod scan;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderScanResult {
    pub path: String,
    pub tree: MarkdownFolderTree,
    pub is_empty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenMarkdownFolderResult {
    pub folder: MarkdownFolderScanResult,
    pub index_document: Option<OpenMarkdownFileResult>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderTree {
    pub name: String,
    pub path: String,
    pub children: Vec<MarkdownFolderTreeNode>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
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
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum ScanMarkdownFolderError {
    MetadataFailed { path: String, message: String },
    NotDirectory { path: String },
    ReadDirectoryFailed { path: String, message: String },
    DirectoryEntryFailed { path: String, message: String },
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum OpenMarkdownFolderError {
    ScanFailed { error: ScanMarkdownFolderError },
    IndexOpenFailed { error: OpenMarkdownFileError },
}

#[derive(Clone, Copy)]
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
pub(crate) fn scan_markdown_folder(
    path: String,
    ignored_directories: Option<Vec<String>>,
    sort_order: Option<FileTreeSortOrder>,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    scan_folder(
        PathBuf::from(path).as_path(),
        ignored_directories.unwrap_or_else(defaults::ignored_directories),
        sort_order.unwrap_or(FileTreeSortOrder::Name),
    )
}

#[tauri::command]
pub(crate) fn open_markdown_folder(
    path: String,
    index_file_names: Option<Vec<String>>,
    ignored_directories: Option<Vec<String>>,
    sort_order: Option<FileTreeSortOrder>,
) -> Result<OpenMarkdownFolderResult, OpenMarkdownFolderError> {
    open_folder(
        PathBuf::from(path).as_path(),
        index_file_names.unwrap_or_else(defaults::index_file_names),
        ignored_directories.unwrap_or_else(defaults::ignored_directories),
        sort_order.unwrap_or(FileTreeSortOrder::Name),
    )
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
    let index_document = index_path
        .map(|index_path| read_markdown_file(Path::new(index_path)))
        .transpose()
        .map_err(|error| OpenMarkdownFolderError::IndexOpenFailed { error })?;

    Ok(OpenMarkdownFolderResult {
        folder,
        index_document,
    })
}

fn scan_folder(
    path: &Path,
    ignored_directories: Vec<String>,
    sort_order: FileTreeSortOrder,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    scan::scan_folder(path, ignored_directories.as_slice(), sort_order)
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
    use std::{
        fs::{self, create_dir, create_dir_all},
        path::{Path, PathBuf},
        sync::atomic::{AtomicUsize, Ordering},
        thread::sleep,
        time::{Duration, UNIX_EPOCH},
    };

    use super::{
        defaults::ignored_directories, open_folder, scan_folder, scan_folder_with_depth,
        FileTreeSortOrder, MarkdownFolderTree, MarkdownFolderTreeNode, ScanDepth,
    };

    static NEXT_TEST_DIR_ID: AtomicUsize = AtomicUsize::new(0);

    struct TestDirectory {
        path: PathBuf,
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let id = NEXT_TEST_DIR_ID.fetch_add(1, Ordering::Relaxed);
            let path =
                std::env::temp_dir().join(format!("leafdown-{name}-{}-{id}", std::process::id()));

            create_dir(&path).expect("test directory should be created");

            Self { path }
        }

        fn create_directory(&self, relative_path: &str) -> PathBuf {
            let path = self.path.join(relative_path);
            create_dir_all(&path).expect("nested test directory should be created");
            path
        }

        fn write_file(&self, relative_path: &str) -> PathBuf {
            let path = self.path.join(relative_path);

            if let Some(parent) = path.parent() {
                create_dir_all(parent).expect("test file parent should be created");
            }

            fs::write(&path, "# Test\n").expect("test file should be written");
            path
        }
    }

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
    fn sorts_tree_nodes_by_modified_date_when_configured() {
        let root = TestDirectory::new("scan-modified-date-sort");
        let older = root.write_file("older.md");
        let older_modified_at_unix_ms = modified_at_unix_ms(&older);
        write_file_after_timestamp(&root, "newer.md", older_modified_at_unix_ms);

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

    fn modified_at_unix_ms(path: &Path) -> u128 {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .expect("test file modified time should be readable")
            .duration_since(UNIX_EPOCH)
            .expect("test modified time should be after epoch")
            .as_millis()
    }

    fn write_file_after_timestamp(
        root: &TestDirectory,
        relative_path: &str,
        older_than_unix_ms: u128,
    ) -> PathBuf {
        for _ in 0..200 {
            sleep(Duration::from_millis(10));
            let path = root.write_file(relative_path);

            if modified_at_unix_ms(&path) > older_than_unix_ms {
                return path;
            }
        }

        panic!("test filesystem should expose distinct modified times");
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
