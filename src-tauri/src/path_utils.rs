use std::{
    fs,
    io::ErrorKind,
    path::{Component, Path, PathBuf},
};

pub(crate) fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum MarkdownReferencePathResolution {
    Resolved(PathBuf),
    UntitledRelative,
    OutsideFolder(PathBuf),
}

pub(crate) enum ExistingPathResolution {
    Found { is_file: bool, path: String },
    InvalidPath { path: String },
    Missing { path: String },
    PermissionDenied { path: String, message: String },
    MetadataFailed { path: String, message: String },
}

pub(crate) fn parse_file_url_path(target: &str) -> Option<PathBuf> {
    let path = target.strip_prefix("file://")?;

    if !path.starts_with('/') {
        return None;
    }

    let mut decoded_path = percent_decode_path(path)?;

    if cfg!(windows)
        && decoded_path.len() >= 4
        && decoded_path.as_bytes().first() == Some(&b'/')
        && decoded_path
            .as_bytes()
            .get(1)
            .is_some_and(u8::is_ascii_alphabetic)
        && decoded_path.as_bytes().get(2) == Some(&b':')
        && decoded_path.as_bytes().get(3) == Some(&b'/')
    {
        decoded_path.remove(0);
    }

    Some(PathBuf::from(decoded_path))
}

pub(crate) fn has_uri_scheme(target: &str) -> bool {
    let Some(separator_index) = target.find(':') else {
        return false;
    };

    let scheme = &target[..separator_index];

    !scheme.is_empty()
        && scheme
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_alphabetic())
        && scheme.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')
        })
}

pub(crate) fn resolves_outside_folder(path: &Path, folder_context_path: Option<&Path>) -> bool {
    let Some(folder_context_path) = folder_context_path else {
        return false;
    };
    let target_exists = path.exists();
    let folder_path = if target_exists {
        canonicalize_or_normalize(folder_context_path)
    } else {
        normalize_path_lexically(folder_context_path)
    };
    let target_path = if target_exists {
        canonicalize_or_normalize(path)
    } else {
        normalize_path_lexically(path)
    };

    !target_path.starts_with(folder_path)
}

pub(crate) fn resolve_markdown_reference_path(
    document_path: Option<&Path>,
    folder_context_path: Option<&Path>,
    target_path: &Path,
    allow_outside_folder: bool,
) -> MarkdownReferencePathResolution {
    let target_is_absolute = target_path.is_absolute();
    let resolved_path = if target_is_absolute {
        normalize_path_lexically(target_path)
    } else {
        let Some(document_parent) = document_path.and_then(Path::parent) else {
            return MarkdownReferencePathResolution::UntitledRelative;
        };

        normalize_path_lexically(document_parent.join(target_path).as_path())
    };

    let folder_context_path = folder_context_path.or_else(|| document_path.and_then(Path::parent));
    let is_absolute_target_without_context = target_is_absolute && folder_context_path.is_none();

    if !allow_outside_folder
        && (is_absolute_target_without_context
            || resolves_outside_folder(resolved_path.as_path(), folder_context_path))
    {
        return MarkdownReferencePathResolution::OutsideFolder(resolved_path);
    }

    MarkdownReferencePathResolution::Resolved(resolved_path)
}

pub(crate) fn canonicalize_or_original(path: &Path) -> String {
    fs::canonicalize(path)
        .map(|path| path_to_string(path.as_path()))
        .unwrap_or_else(|_| path_to_string(path))
}

pub(crate) fn resolve_existing_path(path: &Path) -> ExistingPathResolution {
    match fs::metadata(path) {
        Ok(metadata) => ExistingPathResolution::Found {
            is_file: metadata.is_file(),
            path: canonicalize_or_original(path),
        },
        Err(error) => match error.kind() {
            ErrorKind::InvalidInput => ExistingPathResolution::InvalidPath {
                path: path_to_string(path),
            },
            ErrorKind::NotFound => ExistingPathResolution::Missing {
                path: path_to_string(path),
            },
            ErrorKind::PermissionDenied => ExistingPathResolution::PermissionDenied {
                path: path_to_string(path),
                message: error.to_string(),
            },
            _ => ExistingPathResolution::MetadataFailed {
                path: path_to_string(path),
                message: error.to_string(),
            },
        },
    }
}

pub(crate) fn normalize_path_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    normalized.push(component.as_os_str());
                }
            }
            Component::Normal(part) => normalized.push(part),
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(component.as_os_str()),
        }
    }

    normalized
}

fn canonicalize_or_normalize(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| normalize_path_lexically(path))
}

fn percent_decode_path(path: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(path.len());
    let path_bytes = path.as_bytes();
    let mut index = 0;

    while index < path_bytes.len() {
        if path_bytes[index] == b'%' {
            if let (Some(first), Some(second)) =
                (path_bytes.get(index + 1), path_bytes.get(index + 2))
            {
                if let (Some(high), Some(low)) = (hex_digit(*first), hex_digit(*second)) {
                    bytes.push((high << 4) | low);
                    index += 3;
                    continue;
                }
            }
        }

        bytes.push(path_bytes[index]);
        index += 1;
    }

    String::from_utf8(bytes).ok()
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{
        canonicalize_or_original, has_uri_scheme, normalize_path_lexically, parse_file_url_path,
        resolve_markdown_reference_path, resolves_outside_folder, MarkdownReferencePathResolution,
    };
    use crate::test_utils::TestDirectory;

    #[test]
    fn parses_file_url_paths_and_decodes_percent_escapes() {
        let path = parse_file_url_path("file:///tmp/a%20b.md").expect("file URL should parse");

        assert!(path.to_string_lossy().contains("a b.md"));
    }

    #[cfg(windows)]
    #[test]
    fn parses_windows_file_url_paths() {
        let path = parse_file_url_path("file:///C:/Notes/readme.md")
            .expect("Windows file URL should parse");

        assert_eq!(path, PathBuf::from("C:/Notes/readme.md"));
    }

    #[test]
    fn rejects_file_urls_without_absolute_paths() {
        assert!(parse_file_url_path("file://relative/readme.md").is_none());
    }

    #[test]
    fn rejects_file_urls_with_invalid_utf8_percent_escapes() {
        assert!(parse_file_url_path("file:///tmp/%FF.md").is_none());
    }

    #[test]
    fn detects_uri_schemes_without_treating_plain_paths_as_uris() {
        assert!(has_uri_scheme("https://example.com"));
        assert!(has_uri_scheme("custom+scheme:value"));
        assert!(!has_uri_scheme("docs/readme.md"));
        assert!(!has_uri_scheme(":missing-scheme"));
    }

    #[test]
    fn normalizes_paths_lexically() {
        let normalized = normalize_path_lexically(Path::new("docs/./guides/../readme.md"));

        assert_eq!(normalized, PathBuf::from("docs").join("readme.md"));
    }

    #[test]
    fn detects_missing_targets_outside_folder_contexts() {
        let folder = TestDirectory::new("path-utils-folder");
        let outside = TestDirectory::new("path-utils-outside");

        assert!(!resolves_outside_folder(
            folder.path("docs/missing.md").as_path(),
            Some(folder.path.as_path()),
        ));
        assert!(resolves_outside_folder(
            outside.path("missing.md").as_path(),
            Some(folder.path.as_path()),
        ));
    }

    #[test]
    fn resolves_markdown_reference_paths_from_document_parent() {
        let folder = TestDirectory::new("markdown-reference");
        let document_path = folder.markdown_document_path();

        let resolution = resolve_markdown_reference_path(
            Some(document_path.as_path()),
            Some(folder.path.as_path()),
            Path::new("assets/icon.png"),
            false,
        );

        assert_eq!(
            resolution,
            MarkdownReferencePathResolution::Resolved(folder.path("docs/assets/icon.png")),
        );
    }

    #[test]
    fn keeps_relative_markdown_references_unresolved_without_document_paths() {
        let folder = TestDirectory::new("untitled-reference");

        let resolution = resolve_markdown_reference_path(
            None,
            Some(folder.path.as_path()),
            Path::new("assets/icon.png"),
            false,
        );

        assert_eq!(
            resolution,
            MarkdownReferencePathResolution::UntitledRelative,
        );
    }

    #[test]
    fn blocks_markdown_references_outside_folder_contexts_until_allowed() {
        let folder = TestDirectory::new("blocked-reference-folder");
        let outside = TestDirectory::new("blocked-reference-outside");
        let document_path = folder.markdown_document_path();
        let target_path = outside.write_file("outside.png");

        let blocked_resolution = resolve_markdown_reference_path(
            Some(document_path.as_path()),
            Some(folder.path.as_path()),
            target_path.as_path(),
            false,
        );
        let allowed_resolution = resolve_markdown_reference_path(
            Some(document_path.as_path()),
            Some(folder.path.as_path()),
            target_path.as_path(),
            true,
        );

        assert_eq!(
            blocked_resolution,
            MarkdownReferencePathResolution::OutsideFolder(target_path.clone()),
        );
        assert_eq!(
            allowed_resolution,
            MarkdownReferencePathResolution::Resolved(target_path),
        );
    }

    #[test]
    fn blocks_absolute_markdown_references_without_folder_contexts_until_allowed() {
        let folder = TestDirectory::new("absolute-reference");
        let target_path = folder.write_file("outside.png");

        let blocked_resolution =
            resolve_markdown_reference_path(None, None, target_path.as_path(), false);
        let allowed_resolution =
            resolve_markdown_reference_path(None, None, target_path.as_path(), true);

        assert_eq!(
            blocked_resolution,
            MarkdownReferencePathResolution::OutsideFolder(target_path.clone()),
        );
        assert_eq!(
            allowed_resolution,
            MarkdownReferencePathResolution::Resolved(target_path),
        );
    }

    #[test]
    fn canonicalizes_existing_paths() {
        let folder = TestDirectory::new("path-utils-canonical");
        let path = folder.write_file("docs/readme.md");

        assert_eq!(
            canonicalize_or_original(path.as_path()),
            path.canonicalize().unwrap().to_string_lossy(),
        );
    }
}
