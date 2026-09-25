use std::{
    fs,
    io::{self, ErrorKind},
    path::{Component, Path, PathBuf},
};

use serde::Serialize;

use crate::{
    document::{MARKDOWN_FILE_EXTENSIONS, is_supported_markdown_path},
    path_utils::{IoErrorClass, classify_io_error, path_to_string},
};

#[cfg(windows)]
const WINDOWS_RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderEntryResult {
    pub(crate) path: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum InvalidEntryNameReason {
    Empty,
    ReservedName,
    InvalidCharacter,
    TrailingDotOrSpace,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum FolderEntryError {
    InvalidName {
        name: String,
        reason: InvalidEntryNameReason,
    },
    UnsupportedExtension {
        name: String,
    },
    AlreadyExists {
        path: String,
    },
    OutsideFolder {
        path: String,
    },
    InvalidPath {
        path: String,
    },
    MissingEntry {
        path: String,
    },
    NotDirectory {
        path: String,
    },
    PermissionDenied {
        path: String,
        message: String,
    },
    OperationFailed {
        path: String,
        message: String,
    },
    TrashFailed {
        path: String,
        message: String,
    },
}

pub(super) fn create_markdown_article(
    folder_path: &Path,
    parent_path: &Path,
    name: &str,
    default_extension: &str,
) -> Result<FolderEntryResult, FolderEntryError> {
    let default_extension = parse_markdown_extension(default_extension)?;
    let file_name = markdown_file_name(name, default_extension)?;

    ensure_directory_inside_folder(folder_path, parent_path)?;

    let path = parent_path.join(file_name.as_str());

    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path.as_path())
        .map_err(|error| entry_io_error(error, path.as_path()))?;

    Ok(FolderEntryResult {
        path: path_to_string(path.as_path()),
    })
}

pub(super) fn create_article_directory(
    folder_path: &Path,
    parent_path: &Path,
    name: &str,
) -> Result<FolderEntryResult, FolderEntryError> {
    validate_entry_name(name)?;
    ensure_directory_inside_folder(folder_path, parent_path)?;

    let path = parent_path.join(name);

    fs::create_dir(path.as_path()).map_err(|error| entry_io_error(error, path.as_path()))?;

    Ok(FolderEntryResult {
        path: path_to_string(path.as_path()),
    })
}

pub(super) fn rename_folder_entry(
    folder_path: &Path,
    path: &Path,
    name: &str,
) -> Result<FolderEntryResult, FolderEntryError> {
    let (parent_path, current_name) = split_folder_entry_path(folder_path, path)?;
    let metadata = fs::symlink_metadata(path).map_err(|error| entry_io_error(error, path))?;
    let next_name = if metadata.is_dir() {
        validate_entry_name(name)?;
        name.to_owned()
    } else {
        let current_extension = Path::new(current_name.as_str())
            .extension()
            .and_then(|extension| extension.to_str())
            .filter(|extension| is_markdown_extension(extension))
            .ok_or_else(|| FolderEntryError::UnsupportedExtension {
                name: current_name.clone(),
            })?
            .to_owned();

        markdown_file_name(name, current_extension.as_str())?
    };

    if next_name == current_name {
        return Ok(FolderEntryResult {
            path: path_to_string(path),
        });
    }

    let next_path = parent_path.join(next_name.as_str());

    if !is_same_entry_or_missing(path, next_path.as_path()) {
        return Err(FolderEntryError::AlreadyExists {
            path: path_to_string(next_path.as_path()),
        });
    }

    fs::rename(path, next_path.as_path()).map_err(|error| entry_io_error(error, path))?;

    Ok(FolderEntryResult {
        path: path_to_string(next_path.as_path()),
    })
}

pub(super) fn trash_folder_entry(folder_path: &Path, path: &Path) -> Result<(), FolderEntryError> {
    split_folder_entry_path(folder_path, path)?;

    let metadata = fs::symlink_metadata(path).map_err(|error| entry_io_error(error, path))?;

    if !metadata.is_dir() && !is_supported_markdown_path(path) {
        return Err(FolderEntryError::UnsupportedExtension {
            name: path
                .file_name()
                .map(|file_name| file_name.to_string_lossy().into_owned())
                .unwrap_or_default(),
        });
    }

    // `trash` never falls back to deleting permanently; on Windows an item the Recycle Bin
    // cannot hold is refused or confirmed by the shell's own warning.
    trash::delete(path).map_err(|error| trash_error(error, path))
}

fn markdown_file_name(name: &str, default_extension: &str) -> Result<String, FolderEntryError> {
    validate_entry_name(name)?;

    match Path::new(name).extension() {
        None => Ok(format!("{name}.{default_extension}")),
        Some(extension) if extension.to_str().is_some_and(is_markdown_extension) => {
            Ok(name.to_owned())
        }
        Some(_) => Err(FolderEntryError::UnsupportedExtension {
            name: name.to_owned(),
        }),
    }
}

fn parse_markdown_extension(extension: &str) -> Result<&str, FolderEntryError> {
    let extension = extension.strip_prefix('.').unwrap_or(extension);

    if is_markdown_extension(extension) {
        Ok(extension)
    } else {
        Err(FolderEntryError::UnsupportedExtension {
            name: extension.to_owned(),
        })
    }
}

fn is_markdown_extension(extension: &str) -> bool {
    MARKDOWN_FILE_EXTENSIONS
        .iter()
        .any(|supported| extension.eq_ignore_ascii_case(supported))
}

fn validate_entry_name(name: &str) -> Result<(), FolderEntryError> {
    let invalid = |reason| {
        Err(FolderEntryError::InvalidName {
            name: name.to_owned(),
            reason,
        })
    };

    if name.trim().is_empty() {
        return invalid(InvalidEntryNameReason::Empty);
    }

    if name == "." || name == ".." {
        return invalid(InvalidEntryNameReason::ReservedName);
    }

    if name.chars().any(is_invalid_name_character) {
        return invalid(InvalidEntryNameReason::InvalidCharacter);
    }

    #[cfg(windows)]
    {
        if name.ends_with('.') || name.ends_with(' ') {
            return invalid(InvalidEntryNameReason::TrailingDotOrSpace);
        }

        let stem = name.split('.').next().unwrap_or(name).trim_end();

        if WINDOWS_RESERVED_NAMES
            .iter()
            .any(|reserved| stem.eq_ignore_ascii_case(reserved))
        {
            return invalid(InvalidEntryNameReason::ReservedName);
        }
    }

    Ok(())
}

fn is_invalid_name_character(character: char) -> bool {
    if matches!(character, '/' | '\\') || character.is_control() {
        return true;
    }

    cfg!(windows) && matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
}

/// Returns the entry's parent and name after proving the parent lies inside the folder context,
/// which also rules out the folder context root itself.
fn split_folder_entry_path(
    folder_path: &Path,
    path: &Path,
) -> Result<(PathBuf, String), FolderEntryError> {
    let invalid_path = || FolderEntryError::InvalidPath {
        path: path_to_string(path),
    };
    let name = match path.components().next_back() {
        Some(Component::Normal(name)) => name.to_str().ok_or_else(invalid_path)?.to_owned(),
        _ => return Err(invalid_path()),
    };
    let parent_path = path.parent().ok_or_else(invalid_path)?;

    ensure_directory_inside_folder(folder_path, parent_path)?;

    Ok((parent_path.to_path_buf(), name))
}

fn ensure_directory_inside_folder(
    folder_path: &Path,
    directory_path: &Path,
) -> Result<(), FolderEntryError> {
    let canonical_folder =
        fs::canonicalize(folder_path).map_err(|error| entry_io_error(error, folder_path))?;
    let canonical_directory =
        fs::canonicalize(directory_path).map_err(|error| entry_io_error(error, directory_path))?;

    if !canonical_directory.starts_with(canonical_folder.as_path()) {
        return Err(FolderEntryError::OutsideFolder {
            path: path_to_string(directory_path),
        });
    }

    if !canonical_directory.is_dir() {
        return Err(FolderEntryError::NotDirectory {
            path: path_to_string(directory_path),
        });
    }

    Ok(())
}

/// A case-only rename names an entry that already exists on a case-insensitive filesystem, and
/// `fs::rename` would replace any other existing file instead of refusing.
fn is_same_entry_or_missing(path: &Path, next_path: &Path) -> bool {
    if fs::symlink_metadata(next_path).is_err() {
        return true;
    }

    match (fs::canonicalize(path), fs::canonicalize(next_path)) {
        (Ok(current), Ok(next)) => current == next,
        _ => false,
    }
}

fn entry_io_error(error: io::Error, path: &Path) -> FolderEntryError {
    let path = path_to_string(path);

    if error.kind() == ErrorKind::AlreadyExists {
        return FolderEntryError::AlreadyExists { path };
    }

    if error.kind() == ErrorKind::NotADirectory {
        return FolderEntryError::NotDirectory { path };
    }

    match classify_io_error(error) {
        IoErrorClass::InvalidPath => FolderEntryError::InvalidPath { path },
        IoErrorClass::Missing => FolderEntryError::MissingEntry { path },
        IoErrorClass::PermissionDenied(message) => {
            FolderEntryError::PermissionDenied { path, message }
        }
        IoErrorClass::Failed(message) => FolderEntryError::OperationFailed { path, message },
    }
}

fn trash_error(error: trash::Error, path: &Path) -> FolderEntryError {
    let path_string = path_to_string(path);

    match error {
        trash::Error::CanonicalizePath { .. } if fs::symlink_metadata(path).is_err() => {
            FolderEntryError::MissingEntry { path: path_string }
        }
        error => FolderEntryError::TrashFailed {
            path: path_string,
            message: error.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use std::assert_matches;
    use std::fs;

    use super::{
        FolderEntryError, InvalidEntryNameReason, create_article_directory,
        create_markdown_article, rename_folder_entry, trash_folder_entry,
    };
    use crate::test_utils::TestDirectory;

    #[test]
    fn creates_markdown_articles_with_the_default_extension() {
        let root = TestDirectory::new("entries-create-default-extension");
        let docs = root.create_directory("docs");

        let result = create_markdown_article(&root.path, &docs, "Plan", ".markdown")
            .expect("article should be created");

        assert_eq!(result.path, docs.join("Plan.markdown").to_string_lossy());
        assert_eq!(
            fs::read(docs.join("Plan.markdown")).expect("created article should be read"),
            b""
        );
    }

    #[test]
    fn keeps_explicit_markdown_extensions_when_creating_articles() {
        let root = TestDirectory::new("entries-create-explicit-extension");

        let result = create_markdown_article(&root.path, &root.path, "Notes.MD", ".md")
            .expect("article should be created");

        assert_eq!(result.path, root.path("Notes.MD").to_string_lossy());
    }

    #[test]
    fn rejects_unsupported_explicit_extensions_before_writing() {
        let root = TestDirectory::new("entries-create-unsupported-extension");

        let error = create_markdown_article(&root.path, &root.path, "notes.txt", ".md")
            .expect_err("unsupported extension should be refused");

        assert_matches!(error, FolderEntryError::UnsupportedExtension { name } if name == "notes.txt");
        assert!(!root.path("notes.txt").exists());
        assert!(!root.path("notes.txt.md").exists());
    }

    #[test]
    fn rejects_article_creation_collisions_without_touching_the_existing_file() {
        let root = TestDirectory::new("entries-create-collision");
        let existing = root.write_file_with_content("notes.md", "# Keep\n");

        let error = create_markdown_article(&root.path, &root.path, "notes", ".md")
            .expect_err("collision should be refused");

        assert_matches!(error, FolderEntryError::AlreadyExists { .. });
        assert_eq!(
            fs::read_to_string(existing).expect("existing file should be read"),
            "# Keep\n"
        );
    }

    #[test]
    fn rejects_invalid_entry_names() {
        let root = TestDirectory::new("entries-invalid-names");

        for (name, reason) in [
            ("", InvalidEntryNameReason::Empty),
            ("   ", InvalidEntryNameReason::Empty),
            ("..", InvalidEntryNameReason::ReservedName),
            ("nested/name", InvalidEntryNameReason::InvalidCharacter),
            ("nested\\name", InvalidEntryNameReason::InvalidCharacter),
        ] {
            let error = create_article_directory(&root.path, &root.path, name)
                .expect_err("invalid name should be refused");

            assert_matches!(
                error,
                FolderEntryError::InvalidName { reason: actual, .. } if actual == reason,
                "{name:?} should be refused as {reason:?}"
            );
        }

        assert_eq!(
            fs::read_dir(&root.path)
                .expect("test directory should be listed")
                .count(),
            0
        );
    }

    #[cfg(windows)]
    #[test]
    fn rejects_names_windows_cannot_hold() {
        let root = TestDirectory::new("entries-windows-names");

        for (name, reason) in [
            ("what?", InvalidEntryNameReason::InvalidCharacter),
            ("a:b", InvalidEntryNameReason::InvalidCharacter),
            ("trailing.", InvalidEntryNameReason::TrailingDotOrSpace),
            ("trailing ", InvalidEntryNameReason::TrailingDotOrSpace),
            ("con", InvalidEntryNameReason::ReservedName),
            ("COM1.md", InvalidEntryNameReason::ReservedName),
        ] {
            let error = create_markdown_article(&root.path, &root.path, name, ".md")
                .expect_err("invalid name should be refused");

            assert_matches!(
                error,
                FolderEntryError::InvalidName { reason: actual, .. } if actual == reason,
                "{name:?} should be refused as {reason:?}"
            );
        }
    }

    #[test]
    fn creates_directories_and_refuses_existing_ones() {
        let root = TestDirectory::new("entries-create-directory");

        let result = create_article_directory(&root.path, &root.path, "guides")
            .expect("directory should be created");

        assert_eq!(result.path, root.path("guides").to_string_lossy());
        assert!(root.path("guides").is_dir());

        let error = create_article_directory(&root.path, &root.path, "guides")
            .expect_err("existing directory should be refused");

        assert_matches!(error, FolderEntryError::AlreadyExists { .. });
    }

    #[test]
    fn refuses_to_create_outside_the_folder_context() {
        let root = TestDirectory::new("entries-create-outside");
        let folder = root.create_directory("context");
        let outside = root.create_directory("outside");

        let error = create_markdown_article(&folder, &outside, "escape", ".md")
            .expect_err("outside parent should be refused");

        assert_matches!(error, FolderEntryError::OutsideFolder { .. });

        let error = create_markdown_article(&folder, &folder.join(".."), "escape", ".md")
            .expect_err("parent traversal should be refused");

        assert_matches!(error, FolderEntryError::OutsideFolder { .. });
        assert!(!outside.join("escape.md").exists());
        assert!(!root.path("escape.md").exists());
    }

    #[test]
    fn reports_missing_and_non_directory_parents() {
        let root = TestDirectory::new("entries-create-parent-errors");
        let file = root.write_file("notes.md");

        let error = create_article_directory(&root.path, &root.path("missing"), "child")
            .expect_err("missing parent should be refused");

        assert_matches!(error, FolderEntryError::MissingEntry { .. });

        let error = create_article_directory(&root.path, &file, "child")
            .expect_err("file parent should be refused");

        assert_matches!(error, FolderEntryError::NotDirectory { .. });
    }

    #[test]
    fn renames_articles_keeping_their_extension_when_none_is_typed() {
        let root = TestDirectory::new("entries-rename-article");
        let article = root.write_file_with_content("docs/draft.markdown", "# Draft\n");

        let result =
            rename_folder_entry(&root.path, &article, "final").expect("article should rename");

        let renamed = root.path("docs").join("final.markdown");
        assert_eq!(result.path, renamed.to_string_lossy());
        assert!(!article.exists());
        assert_eq!(
            fs::read_to_string(renamed).expect("renamed article should be read"),
            "# Draft\n"
        );
    }

    #[test]
    fn renames_directories_with_their_contents() {
        let root = TestDirectory::new("entries-rename-directory");
        root.write_file("drafts/nested/idea.md");

        let result = rename_folder_entry(&root.path, &root.path("drafts"), "archive")
            .expect("directory should rename");

        assert_eq!(result.path, root.path("archive").to_string_lossy());
        assert!(root.path("archive/nested/idea.md").is_file());
        assert!(!root.path("drafts").exists());
    }

    #[test]
    fn refuses_rename_collisions_without_replacing_the_destination() {
        let root = TestDirectory::new("entries-rename-collision");
        let source = root.write_file_with_content("a.md", "# A\n");
        let destination = root.write_file_with_content("b.md", "# B\n");

        let error =
            rename_folder_entry(&root.path, &source, "b.md").expect_err("collision should fail");

        assert_matches!(error, FolderEntryError::AlreadyExists { .. });
        assert_eq!(
            fs::read_to_string(&source).expect("source should remain"),
            "# A\n"
        );
        assert_eq!(
            fs::read_to_string(&destination).expect("destination should remain"),
            "# B\n"
        );
    }

    #[test]
    fn allows_case_only_renames() {
        let root = TestDirectory::new("entries-rename-case");
        let source = root.write_file("readme.md");

        let result =
            rename_folder_entry(&root.path, &source, "README.md").expect("case rename should work");

        assert_eq!(result.path, root.path("README.md").to_string_lossy());
        let names = fs::read_dir(&root.path)
            .expect("test directory should be listed")
            .map(|entry| {
                entry
                    .expect("entry should be read")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        assert_eq!(names, ["README.md"]);
    }

    #[test]
    fn refuses_to_rename_or_trash_the_folder_context_root() {
        let root = TestDirectory::new("entries-root");
        let folder = root.create_directory("context");

        let error = rename_folder_entry(&folder, &folder, "renamed")
            .expect_err("root rename should be refused");

        assert_matches!(error, FolderEntryError::OutsideFolder { .. });

        let error = trash_folder_entry(&folder, &folder).expect_err("root trash should be refused");

        assert_matches!(error, FolderEntryError::OutsideFolder { .. });
        assert!(folder.is_dir());
    }

    #[test]
    fn refuses_to_rename_missing_entries() {
        let root = TestDirectory::new("entries-rename-missing");

        let error = rename_folder_entry(&root.path, &root.path("gone.md"), "other")
            .expect_err("missing entry should fail");

        assert_matches!(error, FolderEntryError::MissingEntry { .. });
    }

    #[test]
    fn refuses_to_trash_non_markdown_files() {
        let root = TestDirectory::new("entries-trash-unsupported");
        let file = root.write_file("notes.txt");

        let error =
            trash_folder_entry(&root.path, &file).expect_err("non-Markdown file should be kept");

        assert_matches!(error, FolderEntryError::UnsupportedExtension { .. });
        assert!(file.is_file());
    }

    #[test]
    fn reports_missing_entries_when_trashing() {
        let root = TestDirectory::new("entries-trash-missing");

        let error = trash_folder_entry(&root.path, &root.path("gone.md"))
            .expect_err("missing entry should fail");

        assert_matches!(error, FolderEntryError::MissingEntry { .. });
    }
}
