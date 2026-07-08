use std::{
    cmp::Reverse,
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use super::{
    scan_folder_metadata_error, scan_folder_metadata_warning, scan_folder_read_error,
    scan_folder_read_warning, FileTreeSortOrder, MarkdownFolderScanResult, MarkdownFolderTree,
    MarkdownFolderTreeNode, ScanDepth, ScanMarkdownFolderError, ScanMarkdownFolderWarning,
};
use crate::{document::is_supported_markdown_path, path_utils::path_to_string};

pub(super) fn scan_folder(
    path: &Path,
    ignored_directories: &[String],
    sort_order: FileTreeSortOrder,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    let metadata = fs::metadata(path).map_err(|error| scan_folder_metadata_error(error, path))?;

    if !metadata.is_dir() {
        return Err(ScanMarkdownFolderError::NotDirectory {
            path: path_to_string(path),
        });
    }

    scan_folder_with_depth(
        path,
        ignored_directories,
        scan_depth_for_path(path),
        sort_order,
    )
}

pub(super) fn scan_folder_with_depth(
    path: &Path,
    ignored_directories: &[String],
    depth: ScanDepth,
    sort_order: FileTreeSortOrder,
) -> Result<MarkdownFolderScanResult, ScanMarkdownFolderError> {
    let mut warnings = Vec::new();
    let (tree, has_markdown_files) =
        scan_root_directory(path, ignored_directories, depth, sort_order, &mut warnings)?;

    Ok(MarkdownFolderScanResult {
        path: path_to_string(path),
        tree,
        is_empty: !has_markdown_files,
        warnings,
    })
}

fn scan_root_directory(
    path: &Path,
    ignored_directories: &[String],
    depth: ScanDepth,
    sort_order: FileTreeSortOrder,
    warnings: &mut Vec<ScanMarkdownFolderWarning>,
) -> Result<(MarkdownFolderTree, bool), ScanMarkdownFolderError> {
    let entries = fs::read_dir(path).map_err(|error| scan_folder_read_error(error, path))?;

    scan_directory_entries(
        path,
        entries,
        ignored_directories,
        depth,
        sort_order,
        0,
        warnings,
    )
}

fn scan_directory(
    path: &Path,
    ignored_directories: &[String],
    depth: ScanDepth,
    sort_order: FileTreeSortOrder,
    current_depth: usize,
    warnings: &mut Vec<ScanMarkdownFolderWarning>,
) -> Result<Option<(MarkdownFolderTree, bool)>, ScanMarkdownFolderError> {
    if matches!(depth, ScanDepth::RootRestricted) && current_depth > 0 {
        return Ok(Some((directory_tree(path, Vec::new()), false)));
    }

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) if current_depth == 0 => {
            return Err(scan_folder_read_error(error, path));
        }
        Err(error) => {
            warnings.push(scan_folder_read_warning(error, path));
            return Ok(None);
        }
    };

    scan_directory_entries(
        path,
        entries,
        ignored_directories,
        depth,
        sort_order,
        current_depth,
        warnings,
    )
    .map(Some)
}

fn scan_directory_entries(
    path: &Path,
    entries: fs::ReadDir,
    ignored_directories: &[String],
    depth: ScanDepth,
    sort_order: FileTreeSortOrder,
    current_depth: usize,
    warnings: &mut Vec<ScanMarkdownFolderWarning>,
) -> Result<(MarkdownFolderTree, bool), ScanMarkdownFolderError> {
    let mut children = Vec::new();
    let mut has_markdown_files = false;

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(ScanMarkdownFolderWarning::DirectoryEntryFailed {
                    path: path_to_string(path),
                    message: error.to_string(),
                });
                continue;
            }
        };
        let entry_path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                warnings.push(scan_folder_metadata_warning(error, &entry_path));
                continue;
            }
        };

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

            let Some((directory, directory_has_markdown_files)) = scan_directory(
                &entry_path,
                ignored_directories,
                depth,
                sort_order,
                current_depth + 1,
                warnings,
            )?
            else {
                continue;
            };
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

pub(super) fn scan_depth_for_path(path: &Path) -> ScanDepth {
    if is_filesystem_root(path) {
        ScanDepth::RootRestricted
    } else {
        ScanDepth::Recursive
    }
}

fn is_filesystem_root(path: &Path) -> bool {
    path.has_root() && path.parent().is_none()
}

pub(super) fn is_ignored_directory(name: &str, ignored_directories: &[String]) -> bool {
    ignored_directories.iter().any(|ignored_directory| {
        if cfg!(windows) {
            ignored_directory.eq_ignore_ascii_case(name)
        } else {
            ignored_directory == name
        }
    })
}

fn sort_tree_nodes(nodes: &mut [MarkdownFolderTreeNode], sort_order: FileTreeSortOrder) {
    match sort_order {
        FileTreeSortOrder::Name => nodes.sort_by_cached_key(sort_name),
        FileTreeSortOrder::ModifiedDate => {
            nodes.sort_by_cached_key(|node| (Reverse(modified_at_unix_ms(node)), sort_name(node)))
        }
        FileTreeSortOrder::Type => nodes.sort_by_cached_key(|node| {
            (node_kind_order(node), node_extension(node), sort_name(node))
        }),
    }
}

fn sort_name(node: &MarkdownFolderTreeNode) -> String {
    match node {
        MarkdownFolderTreeNode::Directory { name, .. }
        | MarkdownFolderTreeNode::File { name, .. } => name.to_lowercase(),
    }
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
