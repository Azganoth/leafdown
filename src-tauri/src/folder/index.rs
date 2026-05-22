use std::path::Path;

use super::{MarkdownFolderTree, MarkdownFolderTreeNode};
use crate::document::MARKDOWN_FILE_EXTENSIONS;

pub(super) fn find_root_index_path<'a>(
    tree: &'a MarkdownFolderTree,
    index_file_names: &[String],
) -> Option<&'a str> {
    for index_file_name in index_file_names {
        for extension in MARKDOWN_FILE_EXTENSIONS {
            let index_path = tree.children.iter().find_map(|child| match child {
                MarkdownFolderTreeNode::File { name, path }
                    if is_index_file(name, index_file_name, extension) =>
                {
                    Some(path.as_str())
                }
                MarkdownFolderTreeNode::Directory { .. } | MarkdownFolderTreeNode::File { .. } => {
                    None
                }
            });

            if index_path.is_some() {
                return index_path;
            }
        }
    }

    None
}

fn is_index_file(file_name: &str, index_file_name: &str, extension: &str) -> bool {
    let path = Path::new(file_name);

    path.file_stem()
        .and_then(|stem| stem.to_str())
        .is_some_and(|stem| stem.eq_ignore_ascii_case(index_file_name))
        && path
            .extension()
            .and_then(|candidate_extension| candidate_extension.to_str())
            .is_some_and(|candidate_extension| candidate_extension.eq_ignore_ascii_case(extension))
}
