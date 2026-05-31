use std::{
    fs,
    io::ErrorKind,
    path::{Component, Path, PathBuf},
};

use serde::Serialize;

use crate::document::is_supported_markdown_path;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum ResolveMarkdownLinkTargetResult {
    ExternalWeb { url: String },
    LocalMarkdown { path: String },
    LocalFile { path: String },
    Missing { path: String },
    UntitledRelative,
    OutsideFolder,
    UnsupportedTarget,
    InvalidPath,
    PermissionDenied { message: String },
    MetadataFailed { message: String },
}

enum ParsedLinkTarget {
    ExternalWeb(String),
    Local(PathBuf),
    Unsupported,
}

#[tauri::command]
pub(crate) fn resolve_markdown_link_target(
    document_path: Option<String>,
    folder_context_path: Option<String>,
    target: String,
    explicit_open: Option<bool>,
) -> ResolveMarkdownLinkTargetResult {
    resolve_link_target(
        document_path.as_deref().map(Path::new),
        folder_context_path.as_deref().map(Path::new),
        target.as_str(),
        explicit_open.unwrap_or(false),
    )
}

pub(crate) fn resolve_link_target(
    document_path: Option<&Path>,
    folder_context_path: Option<&Path>,
    target: &str,
    explicit_open: bool,
) -> ResolveMarkdownLinkTargetResult {
    let parsed_target = parse_link_target(target);
    let target_path = match parsed_target {
        ParsedLinkTarget::ExternalWeb(url) => {
            return ResolveMarkdownLinkTargetResult::ExternalWeb { url };
        }
        ParsedLinkTarget::Local(path) => path,
        ParsedLinkTarget::Unsupported => return ResolveMarkdownLinkTargetResult::UnsupportedTarget,
    };

    let target_is_absolute = target_path.is_absolute();
    let resolved_path = if target_is_absolute {
        normalize_path_lexically(target_path.as_path())
    } else {
        let Some(document_parent) = document_path.and_then(Path::parent) else {
            return ResolveMarkdownLinkTargetResult::UntitledRelative;
        };

        normalize_path_lexically(document_parent.join(&target_path).as_path())
    };

    let folder_context_path = folder_context_path.or_else(|| document_path.and_then(Path::parent));
    let is_absolute_target_without_context = target_is_absolute && folder_context_path.is_none();

    if !explicit_open
        && (is_absolute_target_without_context
            || resolves_outside_folder(resolved_path.as_path(), folder_context_path))
    {
        return ResolveMarkdownLinkTargetResult::OutsideFolder;
    }

    match fs::metadata(resolved_path.as_path()) {
        Ok(metadata) => {
            let path = canonicalize_or_original(resolved_path.as_path());

            if metadata.is_file() && is_supported_markdown_path(resolved_path.as_path()) {
                ResolveMarkdownLinkTargetResult::LocalMarkdown { path }
            } else {
                ResolveMarkdownLinkTargetResult::LocalFile { path }
            }
        }
        Err(error) => match error.kind() {
            ErrorKind::InvalidInput => ResolveMarkdownLinkTargetResult::InvalidPath,
            ErrorKind::NotFound => ResolveMarkdownLinkTargetResult::Missing {
                path: path_to_string(resolved_path.as_path()),
            },
            ErrorKind::PermissionDenied => ResolveMarkdownLinkTargetResult::PermissionDenied {
                message: error.to_string(),
            },
            _ => ResolveMarkdownLinkTargetResult::MetadataFailed {
                message: error.to_string(),
            },
        },
    }
}

fn parse_link_target(target: &str) -> ParsedLinkTarget {
    let trimmed_target = target.trim();

    if trimmed_target.is_empty() {
        return ParsedLinkTarget::Unsupported;
    }

    let lower_target = trimmed_target.to_ascii_lowercase();

    if lower_target.starts_with("http://") || lower_target.starts_with("https://") {
        return ParsedLinkTarget::ExternalWeb(trimmed_target.to_owned());
    }

    if lower_target.starts_with("file://") {
        return parse_file_url(trimmed_target)
            .map(ParsedLinkTarget::Local)
            .unwrap_or(ParsedLinkTarget::Unsupported);
    }

    let local_target = strip_local_reference_parts(trimmed_target);

    if local_target.is_empty() {
        return ParsedLinkTarget::Unsupported;
    }

    let local_path = PathBuf::from(local_target);

    if local_path.is_absolute() {
        return ParsedLinkTarget::Local(local_path);
    }

    if has_uri_scheme(trimmed_target) {
        return ParsedLinkTarget::Unsupported;
    }

    ParsedLinkTarget::Local(local_path)
}

fn strip_local_reference_parts(target: &str) -> &str {
    let fragment_index = target.find('#').unwrap_or(target.len());
    let query_index = target.find('?').unwrap_or(target.len());
    let end_index = fragment_index.min(query_index);

    target[..end_index].trim_end()
}

fn parse_file_url(target: &str) -> Option<PathBuf> {
    let target = strip_file_url_reference_parts(target);
    let path = target.strip_prefix("file://")?;

    if !path.starts_with('/') {
        return None;
    }

    let mut decoded_path = percent_decode_path(path);

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

fn strip_file_url_reference_parts(target: &str) -> &str {
    let fragment_index = target.find('#').unwrap_or(target.len());
    &target[..fragment_index]
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

fn resolves_outside_folder(path: &Path, folder_context_path: Option<&Path>) -> bool {
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

    use super::{resolve_link_target, ResolveMarkdownLinkTargetResult};

    static NEXT_TEST_DIR_ID: AtomicUsize = AtomicUsize::new(0);

    struct TestDirectory {
        path: PathBuf,
    }

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let id = NEXT_TEST_DIR_ID.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "leafdown-markdown-link-{name}-{}-{id}",
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

            fs::write(&path, "test").expect("test file should be written");

            path
        }

        fn write_directory(&self, relative_path: &str) -> PathBuf {
            let path = self.path.join(relative_path);
            create_dir_all(&path).expect("test directory should be created");
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

    fn local_markdown_path(result: ResolveMarkdownLinkTargetResult) -> String {
        match result {
            ResolveMarkdownLinkTargetResult::LocalMarkdown { path } => path,
            _ => panic!("expected local Markdown link result"),
        }
    }

    fn local_file_path(result: ResolveMarkdownLinkTargetResult) -> String {
        match result {
            ResolveMarkdownLinkTargetResult::LocalFile { path } => path,
            _ => panic!("expected local file link result"),
        }
    }

    fn missing_path(result: ResolveMarkdownLinkTargetResult) -> String {
        match result {
            ResolveMarkdownLinkTargetResult::Missing { path } => path,
            _ => panic!("expected missing link result"),
        }
    }

    #[test]
    fn resolves_external_web_links_without_filesystem_access() {
        assert_eq!(
            resolve_link_target(None, None, "https://example.com/docs?x=1#heading", false),
            ResolveMarkdownLinkTargetResult::ExternalWeb {
                url: "https://example.com/docs?x=1#heading".to_owned(),
            }
        );
        assert_eq!(
            resolve_link_target(None, None, "http://example.com", false),
            ResolveMarkdownLinkTargetResult::ExternalWeb {
                url: "http://example.com".to_owned(),
            }
        );
    }

    #[test]
    fn resolves_relative_markdown_links_from_the_document_path() {
        let root = TestDirectory::new("relative-markdown");
        let document_path = root.document_path();
        let target_path = root.write_file("docs/guides/start.md");

        let result = resolve_link_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            "guides/start.md",
            false,
        );

        assert_eq!(
            local_markdown_path(result),
            target_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn ignores_local_fragments_and_queries_when_resolving_files() {
        let root = TestDirectory::new("fragment");
        let document_path = root.document_path();
        let target_path = root.write_file("docs/guides/start.markdown");

        let result = resolve_link_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            "./guides/start.markdown?mode=edit#overview",
            false,
        );

        assert_eq!(
            local_markdown_path(result),
            target_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn resolves_local_non_markdown_files_and_directories() {
        let root = TestDirectory::new("non-markdown");
        let document_path = root.document_path();
        let pdf_path = root.write_file("docs/assets/manual.pdf");
        let directory_path = root.write_directory("docs/assets");

        let file_result = resolve_link_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            "assets/manual.pdf",
            false,
        );
        let directory_result = resolve_link_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            "assets",
            false,
        );

        assert_eq!(
            local_file_path(file_result),
            pdf_path.canonicalize().unwrap().to_string_lossy()
        );
        assert_eq!(
            local_file_path(directory_result),
            directory_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn keeps_relative_links_unresolved_for_untitled_documents() {
        let root = TestDirectory::new("untitled");

        let result = resolve_link_target(None, Some(root.path.as_path()), "docs/readme.md", false);

        assert_eq!(result, ResolveMarkdownLinkTargetResult::UntitledRelative);
    }

    #[test]
    fn reports_missing_local_links_without_rewriting_the_target() {
        let root = TestDirectory::new("missing");
        let document_path = root.document_path();
        let expected_path = root.path.join("docs").join("missing.md");

        let result = resolve_link_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            "missing.md",
            false,
        );

        assert_eq!(missing_path(result), expected_path.to_string_lossy());
    }

    #[test]
    fn requires_explicit_open_for_links_outside_the_folder_context() {
        let root = TestDirectory::new("outside-root");
        let outside = TestDirectory::new("outside-target");
        let document_path = root.document_path();
        let target_path = outside.write_file("outside.md");
        let relative_target = pathdiff(target_path.as_path(), document_path.parent().unwrap());

        let blocked_result = resolve_link_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            relative_target.as_str(),
            false,
        );
        let allowed_result = resolve_link_target(
            Some(document_path.as_path()),
            Some(root.path.as_path()),
            relative_target.as_str(),
            true,
        );

        assert_eq!(
            blocked_result,
            ResolveMarkdownLinkTargetResult::OutsideFolder
        );
        assert_eq!(
            local_markdown_path(allowed_result),
            target_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn requires_explicit_open_for_absolute_links_without_a_folder_context() {
        let root = TestDirectory::new("absolute-without-context");
        let target_path = root.write_file("notes.pdf");

        let blocked_result = resolve_link_target(
            None,
            None,
            target_path.as_path().to_string_lossy().as_ref(),
            false,
        );
        let allowed_result = resolve_link_target(
            None,
            None,
            target_path.as_path().to_string_lossy().as_ref(),
            true,
        );

        assert_eq!(
            blocked_result,
            ResolveMarkdownLinkTargetResult::OutsideFolder
        );
        assert_eq!(
            local_file_path(allowed_result),
            target_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn rejects_unsupported_or_unsafe_targets() {
        assert_eq!(
            resolve_link_target(None, None, "javascript:alert(1)", false),
            ResolveMarkdownLinkTargetResult::UnsupportedTarget
        );
        assert_eq!(
            resolve_link_target(None, None, "mailto:test@example.com", false),
            ResolveMarkdownLinkTargetResult::UnsupportedTarget
        );
        assert_eq!(
            resolve_link_target(None, None, "#same-document", false),
            ResolveMarkdownLinkTargetResult::UnsupportedTarget
        );
    }

    #[cfg(windows)]
    #[test]
    fn resolves_file_urls_to_local_paths() {
        let root = TestDirectory::new("file-url");
        let target_path = root.write_file("notes with spaces.md");
        let target = format!(
            "file:///{}#heading",
            target_path
                .to_string_lossy()
                .replace('\\', "/")
                .replace(' ', "%20")
        );

        let result = resolve_link_target(None, Some(root.path.as_path()), target.as_str(), false);

        assert_eq!(
            local_markdown_path(result),
            target_path.canonicalize().unwrap().to_string_lossy()
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
