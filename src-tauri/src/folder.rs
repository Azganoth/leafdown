use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

use crate::document::{is_supported_markdown_path, path_to_string};

const DEFAULT_IGNORED_DIRECTORIES: [&str; 8] = [
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "target",
    "dist",
    "build",
    ".cache",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownFolderScanResult {
    pub path: String,
    pub tree: MarkdownFolderTree,
    pub is_empty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownFolderTree {
    pub name: String,
    pub path: String,
    pub children: Vec<MarkdownFolderTreeNode>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MarkdownFolderTreeNode {
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
pub enum ScanMarkdownFolderError {
    MetadataFailed { path: String, message: String },
    NotDirectory { path: String },
    ReadDirectoryFailed { path: String, message: String },
    DirectoryEntryFailed { path: String, message: String },
}

#[derive(Clone, Copy)]
enum ScanDepth {
    Recursive,
    RootRestricted,
}

#[tauri::command]
pub fn scan_markdown_folder(
    path: String,
    ignored_directories: Option<Vec<String>>,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    scan_folder(
        PathBuf::from(path).as_path(),
        ignored_directories.unwrap_or_else(default_ignored_directories),
    )
}

fn scan_folder(
    path: &Path,
    ignored_directories: Vec<String>,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    let metadata = fs::metadata(path).map_err(|error| ScanMarkdownFolderError::MetadataFailed {
        path: path_to_string(path),
        message: error.to_string(),
    })?;

    if !metadata.is_dir() {
        return Err(ScanMarkdownFolderError::NotDirectory {
            path: path_to_string(path),
        });
    }

    let depth = if is_filesystem_root(path) {
        ScanDepth::RootRestricted
    } else {
        ScanDepth::Recursive
    };

    scan_folder_with_depth(path, ignored_directories.as_slice(), depth)
}

fn scan_folder_with_depth(
    path: &Path,
    ignored_directories: &[String],
    depth: ScanDepth,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    let (tree, has_markdown_files) = scan_directory(path, ignored_directories, depth, 0)?;

    Ok(MarkdownFolderScanResult {
        path: path_to_string(path),
        tree,
        is_empty: !has_markdown_files,
    })
}

fn scan_directory(
    path: &Path,
    ignored_directories: &[String],
    depth: ScanDepth,
    current_depth: usize,
) -> Result<(MarkdownFolderTree, bool), ScanMarkdownFolderError> {
    if matches!(depth, ScanDepth::RootRestricted) && current_depth > 0 {
        return Ok((directory_tree(path, Vec::new()), false));
    }

    let entries =
        fs::read_dir(path).map_err(|error| ScanMarkdownFolderError::ReadDirectoryFailed {
            path: path_to_string(path),
            message: error.to_string(),
        })?;
    let mut children = Vec::new();
    let mut has_markdown_files = false;

    for entry in entries {
        let entry = entry.map_err(|error| ScanMarkdownFolderError::DirectoryEntryFailed {
            path: path_to_string(path),
            message: error.to_string(),
        })?;
        let entry_path = entry.path();
        let file_type =
            entry
                .file_type()
                .map_err(|error| ScanMarkdownFolderError::MetadataFailed {
                    path: path_to_string(&entry_path),
                    message: error.to_string(),
                })?;

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            if is_ignored_directory(
                entry.file_name().to_string_lossy().as_ref(),
                ignored_directories,
            ) {
                continue;
            }

            let (directory, directory_has_markdown_files) =
                scan_directory(&entry_path, ignored_directories, depth, current_depth + 1)?;
            children.push(MarkdownFolderTreeNode::Directory {
                name: directory.name,
                path: directory.path,
                children: directory.children,
            });
            has_markdown_files |= directory_has_markdown_files;
            continue;
        }

        if file_type.is_file() && is_supported_markdown_path(&entry_path) {
            children.push(MarkdownFolderTreeNode::File {
                name: file_name_to_string(&entry_path),
                path: path_to_string(&entry_path),
            });
            has_markdown_files = true;
        }
    }

    sort_tree_nodes(&mut children);

    Ok((directory_tree(path, children), has_markdown_files))
}

fn directory_tree(path: &Path, children: Vec<MarkdownFolderTreeNode>) -> MarkdownFolderTree {
    MarkdownFolderTree {
        name: file_name_to_string(path),
        path: path_to_string(path),
        children,
    }
}

fn default_ignored_directories() -> Vec<String> {
    DEFAULT_IGNORED_DIRECTORIES
        .into_iter()
        .map(ToOwned::to_owned)
        .collect()
}

fn file_name_to_string(path: &Path) -> String {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned()
}

fn is_filesystem_root(path: &Path) -> bool {
    path.has_root() && path.parent().is_none()
}

fn is_ignored_directory(name: &str, ignored_directories: &[String]) -> bool {
    ignored_directories.iter().any(|ignored_directory| {
        if cfg!(windows) {
            ignored_directory.eq_ignore_ascii_case(name)
        } else {
            ignored_directory == name
        }
    })
}

fn sort_tree_nodes(nodes: &mut [MarkdownFolderTreeNode]) {
    nodes.sort_by_key(sort_name);
}

fn sort_name(node: &MarkdownFolderTreeNode) -> String {
    match node {
        MarkdownFolderTreeNode::Directory { name, .. }
        | MarkdownFolderTreeNode::File { name, .. } => name.to_lowercase(),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, create_dir, create_dir_all},
        path::{Path, PathBuf},
        sync::atomic::{AtomicUsize, Ordering},
    };

    use super::{
        default_ignored_directories, scan_folder, scan_folder_with_depth, MarkdownFolderTree,
        MarkdownFolderTreeNode, ScanDepth,
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

        let result = scan_folder(&root.path, default_ignored_directories())
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

        let result = scan_folder(&root.path, default_ignored_directories())
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

        let result = scan_folder(&root.path, default_ignored_directories())
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
            default_ignored_directories().as_slice(),
            ScanDepth::RootRestricted,
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

        let result = scan_folder(&root.path, default_ignored_directories())
            .expect("folder with a symlink should scan");

        assert!(!tree_has_directory(&result.tree, "linked-folder"));
        assert!(!tree_has_file(&result.tree, "linked.md"));
    }

    fn tree_has_directory(tree: &MarkdownFolderTree, name: &str) -> bool {
        child_nodes_have_directory(&tree.children, name)
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
