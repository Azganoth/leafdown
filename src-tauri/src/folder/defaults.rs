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
const DEFAULT_INDEX_FILE_NAMES: [&str; 2] = ["readme", "index"];

pub(super) fn ignored_directories() -> Vec<String> {
    to_owned_values(DEFAULT_IGNORED_DIRECTORIES)
}

pub(super) fn index_file_names() -> Vec<String> {
    to_owned_values(DEFAULT_INDEX_FILE_NAMES)
}

fn to_owned_values<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(ToOwned::to_owned).collect()
}
