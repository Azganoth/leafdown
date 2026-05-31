use std::{
    fs,
    io::ErrorKind,
    path::{Component, Path, PathBuf},
};

use serde::Serialize;

const SUPPORTED_IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "svg", "webp"];

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum ResolveMarkdownImageTargetResult {
    Renderable { path: String },
    Missing { path: String },
    UntitledRelative,
    OutsideFolder,
    RemoteBlocked,
    UnsupportedFormat,
    UnsupportedTarget,
    InvalidPath,
    PermissionDenied { message: String },
    MetadataFailed { message: String },
}

enum ParsedImageTarget {
    Local(PathBuf),
    Remote,
    Unsupported,
}

#[tauri::command]
pub(crate) fn resolve_markdown_image_target(
    document_path: Option<String>,
    folder_context_path: Option<String>,
    target: String,
    explicit_load: Option<bool>,
) -> ResolveMarkdownImageTargetResult {
    resolve_image_target(
        document_path.as_deref().map(Path::new),
        folder_context_path.as_deref().map(Path::new),
        target.as_str(),
        explicit_load.unwrap_or(false),
    )
}

pub(crate) fn resolve_image_target(
    document_path: Option<&Path>,
    folder_context_path: Option<&Path>,
    target: &str,
    explicit_load: bool,
) -> ResolveMarkdownImageTargetResult {
    let parsed_target = parse_image_target(target);
    let target_path = match parsed_target {
        ParsedImageTarget::Local(path) => path,
        ParsedImageTarget::Remote => return ResolveMarkdownImageTargetResult::RemoteBlocked,
        ParsedImageTarget::Unsupported => {
            return ResolveMarkdownImageTargetResult::UnsupportedTarget;
        }
    };

    if !is_supported_image_path(target_path.as_path()) {
        return ResolveMarkdownImageTargetResult::UnsupportedFormat;
    }

    let resolved_path = if target_path.is_absolute() {
        normalize_path_lexically(target_path.as_path())
    } else {
        let Some(document_parent) = document_path.and_then(Path::parent) else {
            return ResolveMarkdownImageTargetResult::UntitledRelative;
        };

        normalize_path_lexically(document_parent.join(target_path).as_path())
    };

    let folder_context_path = folder_context_path.or_else(|| document_path.and_then(Path::parent));

    if !explicit_load && resolves_outside_folder(resolved_path.as_path(), folder_context_path) {
        return ResolveMarkdownImageTargetResult::OutsideFolder;
    }

    match fs::metadata(resolved_path.as_path()) {
        Ok(metadata) => {
            if !metadata.is_file() {
                return ResolveMarkdownImageTargetResult::Missing {
                    path: path_to_string(resolved_path.as_path()),
                };
            }

            ResolveMarkdownImageTargetResult::Renderable {
                path: canonicalize_or_original(resolved_path.as_path()),
            }
        }
        Err(error) => match error.kind() {
            ErrorKind::InvalidInput => ResolveMarkdownImageTargetResult::InvalidPath,
            ErrorKind::NotFound => ResolveMarkdownImageTargetResult::Missing {
                path: path_to_string(resolved_path.as_path()),
            },
            ErrorKind::PermissionDenied => ResolveMarkdownImageTargetResult::PermissionDenied {
                message: error.to_string(),
            },
            _ => ResolveMarkdownImageTargetResult::MetadataFailed {
                message: error.to_string(),
            },
        },
    }
}

fn parse_image_target(target: &str) -> ParsedImageTarget {
    let trimmed_target = target.trim();

    if trimmed_target.is_empty() {
        return ParsedImageTarget::Unsupported;
    }

    if trimmed_target.starts_with("//") || trimmed_target.starts_with("\\\\") {
        return ParsedImageTarget::Remote;
    }

    let path_target = Path::new(trimmed_target);

    if path_target.is_absolute() {
        return ParsedImageTarget::Local(path_target.to_path_buf());
    }

    let lower_target = trimmed_target.to_ascii_lowercase();

    if lower_target.starts_with("http://")
        || lower_target.starts_with("https://")
        || lower_target.starts_with("ftp://")
    {
        return ParsedImageTarget::Remote;
    }

    if lower_target.starts_with("file://") {
        return parse_file_url(trimmed_target)
            .map(ParsedImageTarget::Local)
            .unwrap_or(ParsedImageTarget::Unsupported);
    }

    if has_uri_scheme(trimmed_target) {
        return ParsedImageTarget::Unsupported;
    }

    ParsedImageTarget::Local(path_target.to_path_buf())
}

fn parse_file_url(target: &str) -> Option<PathBuf> {
    let path = target.strip_prefix("file://")?;

    if !path.starts_with('/') {
        return None;
    }

    let mut decoded_path = percent_decode_path(path);

    if cfg!(windows)
        && decoded_path.len() >= 4
        && decoded_path.as_bytes().get(0) == Some(&b'/')
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

fn percent_decode_path(path: &str) -> String {
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

    String::from_utf8_lossy(bytes.as_slice()).into_owned()
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn has_uri_scheme(target: &str) -> bool {
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

fn is_supported_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(is_supported_image_extension)
}

fn is_supported_image_extension(extension: &str) -> bool {
    SUPPORTED_IMAGE_EXTENSIONS
        .iter()
        .any(|supported_extension| supported_extension.eq_ignore_ascii_case(extension))
}

fn resolves_outside_folder(path: &Path, folder_context_path: Option<&Path>) -> bool {
    let Some(folder_context_path) = folder_context_path else {
        return false;
    };
    let image_exists = path.exists();
    let folder_path = if image_exists {
        canonicalize_or_normalize(folder_context_path)
    } else {
        normalize_path_lexically(folder_context_path)
    };
    let image_path = if image_exists {
        canonicalize_or_normalize(path)
    } else {
        normalize_path_lexically(path)
    };

    !image_path.starts_with(folder_path)
}

fn canonicalize_or_normalize(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| normalize_path_lexically(path))
}

fn canonicalize_or_original(path: &Path) -> String {
    fs::canonicalize(path)
        .map(|path| path_to_string(path.as_path()))
        .unwrap_or_else(|_| path_to_string(path))
}

fn normalize_path_lexically(path: &Path) -> PathBuf {
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

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, create_dir_all},
        path::{Path, PathBuf},
        sync::atomic::{AtomicUsize, Ordering},
    };

    use super::{resolve_image_target, ResolveMarkdownImageTargetResult};

    static NEXT_TEST_DIR_ID: AtomicUsize = AtomicUsize::new(0);

    struct TestDirectory {
        path: PathBuf,
    }

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let id = NEXT_TEST_DIR_ID.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "leafdown-markdown-image-{name}-{}-{id}",
                std::process::id()
            ));

            create_dir_all(&path).expect("test directory should be created");

            Self { path }
        }

        fn write_file(&self, relative_path: &str) -> PathBuf {
            let path = self.path.join(relative_path);

            if let Some(parent) = path.parent() {
                create_dir_all(parent).expect("test file parent should be created");
            }

            fs::write(&path, [0_u8]).expect("test file should be written");

            path
        }

        fn document_path(&self) -> PathBuf {
            self.write_file("docs/readme.md")
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn renderable_path(result: ResolveMarkdownImageTargetResult) -> String {
        match result {
            ResolveMarkdownImageTargetResult::Renderable { path } => path,
            _ => panic!("expected renderable image result"),
        }
    }

    fn missing_path(result: ResolveMarkdownImageTargetResult) -> String {
        match result {
            ResolveMarkdownImageTargetResult::Missing { path } => path,
            _ => panic!("expected missing image result"),
        }
    }

    #[test]
    fn resolves_supported_relative_images_from_the_document_path() {
        let root = TestDirectory::new("relative");
        let document_path = root.document_path();
        let image_path = root.write_file("docs/assets/icon.png");

        let result = resolve_image_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            "./assets/icon.png",
            false,
        );

        assert_eq!(
            renderable_path(result),
            image_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn treats_supported_image_extensions_case_insensitively() {
        let root = TestDirectory::new("extension-case");
        let document_path = root.document_path();
        let image_path = root.write_file("docs/assets/banner.WEBP");

        let result = resolve_image_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            "assets/banner.WEBP",
            false,
        );

        assert_eq!(
            renderable_path(result),
            image_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn reports_missing_local_images_without_rewriting_the_target() {
        let root = TestDirectory::new("missing");
        let document_path = root.document_path();
        let expected_path = root
            .path
            .join("docs")
            .join("assets")
            .join("missing image.png");

        let result = resolve_image_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            "assets/missing image.png",
            false,
        );

        assert_eq!(missing_path(result), expected_path.to_string_lossy());
    }

    #[test]
    fn keeps_relative_images_unresolved_for_untitled_documents() {
        let root = TestDirectory::new("untitled");

        let result =
            resolve_image_target(None, Some(root.path.as_path()), "assets/icon.png", false);

        assert_eq!(result, ResolveMarkdownImageTargetResult::UntitledRelative);
    }

    #[test]
    fn requires_explicit_load_for_images_outside_the_folder_context() {
        let root = TestDirectory::new("outside-root");
        let outside = TestDirectory::new("outside-target");
        let document_path = root.document_path();
        let image_path = outside.write_file("outside.png");
        let relative_target = pathdiff(image_path.as_path(), document_path.parent().unwrap());

        let blocked_result = resolve_image_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            relative_target.as_str(),
            false,
        );
        let allowed_result = resolve_image_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            relative_target.as_str(),
            true,
        );

        assert_eq!(
            blocked_result,
            ResolveMarkdownImageTargetResult::OutsideFolder
        );
        assert_eq!(
            renderable_path(allowed_result),
            image_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn blocks_remote_and_network_image_targets() {
        assert_eq!(
            resolve_image_target(None, None, "https://example.com/image.png", false),
            ResolveMarkdownImageTargetResult::RemoteBlocked
        );
        assert_eq!(
            resolve_image_target(None, None, "//example.com/image.png", false),
            ResolveMarkdownImageTargetResult::RemoteBlocked
        );
        assert_eq!(
            resolve_image_target(None, None, "\\\\server\\share\\image.png", false),
            ResolveMarkdownImageTargetResult::RemoteBlocked
        );
    }

    #[test]
    fn rejects_unsupported_or_unsafe_targets() {
        let root = TestDirectory::new("unsupported-target");
        let document_path = root.document_path();

        assert_eq!(
            resolve_image_target(
                Some(document_path.as_path()),
                Some(root.path.as_path()),
                "javascript:alert(1)",
                false,
            ),
            ResolveMarkdownImageTargetResult::UnsupportedTarget
        );
        assert_eq!(
            resolve_image_target(
                Some(document_path.as_path()),
                Some(root.path.as_path()),
                "assets/readme.txt",
                false,
            ),
            ResolveMarkdownImageTargetResult::UnsupportedFormat
        );
    }

    fn pathdiff(path: &Path, base: &Path) -> String {
        let path_components = path.components().collect::<Vec<_>>();
        let base_components = base.components().collect::<Vec<_>>();
        let common_count = path_components
            .iter()
            .zip(base_components.iter())
            .take_while(|(path_component, base_component)| path_component == base_component)
            .count();
        let mut diff = PathBuf::new();

        for _ in common_count..base_components.len() {
            diff.push("..");
        }

        for component in &path_components[common_count..] {
            diff.push(component.as_os_str());
        }

        diff.to_string_lossy().into_owned()
    }
}
