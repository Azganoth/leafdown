use std::{
    cmp::Ordering,
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use super::{
    FileTreeSortOrder, MarkdownFolderScanResult, MarkdownFolderTree, MarkdownFolderTreeNode,
    ScanDepth, ScanMarkdownFolderError,
};
use crate::document::is_supported_markdown_path;

pub(super) fn scan_folder(
    path: &Path,
    ignored_directories: &[String],
    sort_order: FileTreeSortOrder,
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

    scan_folder_with_depth(path, ignored_directories, depth, sort_order)
}

pub(super) fn scan_folder_with_depth(
    path: &Path,
    ignored_directories: &[String],
    depth: ScanDepth,
    sort_order: FileTreeSortOrder,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    let (tree, has_markdown_files) =
        scan_directory(path, ignored_directories, depth, sort_order, 0)?;

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
    sort_order: FileTreeSortOrder,
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

            let (directory, directory_has_markdown_files) = scan_directory(
                &entry_path,
                ignored_directories,
                depth,
                sort_order,
                current_depth + 1,
            )?;
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

    sort_tree_nodes(&mut children, sort_order);

    Ok((directory_tree(path, children), has_markdown_files))
}

fn directory_tree(path: &Path, children: Vec<MarkdownFolderTreeNode>) -> MarkdownFolderTree {
    MarkdownFolderTree {
        name: file_name_to_string(path),
        path: path_to_string(path),
        children,
    }
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

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn sort_tree_nodes(nodes: &mut [MarkdownFolderTreeNode], sort_order: FileTreeSortOrder) {
    match sort_order {
        FileTreeSortOrder::Name => nodes.sort_by_key(sort_name),
        FileTreeSortOrder::ModifiedDate => nodes.sort_by(compare_modified_date),
        FileTreeSortOrder::Type => nodes.sort_by(compare_type),
    }
}

fn sort_name(node: &MarkdownFolderTreeNode) -> String {
    match node {
        MarkdownFolderTreeNode::Directory { name, .. }
        | MarkdownFolderTreeNode::File { name, .. } => name.to_lowercase(),
    }
}

fn compare_modified_date(
    left: &MarkdownFolderTreeNode,
    right: &MarkdownFolderTreeNode,
) -> Ordering {
    modified_at_unix_ms(right)
        .cmp(&modified_at_unix_ms(left))
        .then_with(|| sort_name(left).cmp(&sort_name(right)))
}

fn compare_type(left: &MarkdownFolderTreeNode, right: &MarkdownFolderTreeNode) -> Ordering {
    node_kind_order(left)
        .cmp(&node_kind_order(right))
        .then_with(|| node_extension(left).cmp(&node_extension(right)))
        .then_with(|| sort_name(left).cmp(&sort_name(right)))
}

fn node_kind_order(node: &MarkdownFolderTreeNode) -> u8 {
    match node {
        MarkdownFolderTreeNode::Directory { .. } => 0,
        MarkdownFolderTreeNode::File { .. } => 1,
    }
}

fn node_extension(node: &MarkdownFolderTreeNode) -> String {
    match node {
        MarkdownFolderTreeNode::Directory { .. } => String::new(),
        MarkdownFolderTreeNode::File { path, .. } => Path::new(path)
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default()
            .to_lowercase(),
    }
}

fn modified_at_unix_ms(node: &MarkdownFolderTreeNode) -> u128 {
    let path = match node {
        MarkdownFolderTreeNode::Directory { path, .. }
        | MarkdownFolderTreeNode::File { path, .. } => PathBuf::from(path),
    };

    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_millis())
}
