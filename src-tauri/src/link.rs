use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::{
    document::is_supported_markdown_path,
    path_utils::{
        has_uri_scheme, parse_file_url_path, resolve_existing_path,
        resolve_markdown_reference_path, ExistingPathResolution, MarkdownReferencePathResolution,
    },
};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum ResolveMarkdownLinkTargetResult {
    ExternalWeb { url: String },
    LocalMarkdown { path: String },
    LocalFile { path: String },
    Missing { path: String },
    UntitledRelative,
    OutsideFolder { path: String },
    UnsupportedTarget,
    InvalidPath { path: String },
    PermissionDenied { path: String, message: String },
    MetadataFailed { path: String, message: String },
}

enum ParsedLinkTarget {
    ExternalWeb(String),
    Local(PathBuf),
    Unsupported,
}

#[tauri::command]
pub(crate) async fn resolve_markdown_link_target(
    document_path: Option<String>,
    folder_context_path: Option<String>,
    target: String,
    allow_outside_folder: Option<bool>,
) -> ResolveMarkdownLinkTargetResult {
    let error_path = target.clone();

    tauri::async_runtime::spawn_blocking(move || {
        resolve_link_target(
            document_path.as_deref().map(Path::new),
            folder_context_path.as_deref().map(Path::new),
            target.as_str(),
            allow_outside_folder.unwrap_or(false),
        )
    })
    .await
    .unwrap_or_else(|error| ResolveMarkdownLinkTargetResult::MetadataFailed {
        path: error_path,
        message: error.to_string(),
    })
}

pub(crate) fn resolve_link_target(
    document_path: Option<&Path>,
    folder_context_path: Option<&Path>,
    target: &str,
    allow_outside_folder: bool,
) -> ResolveMarkdownLinkTargetResult {
    match parse_link_target(target) {
        ParsedLinkTarget::ExternalWeb(url) => ResolveMarkdownLinkTargetResult::ExternalWeb { url },
        ParsedLinkTarget::Local(target_path) => resolve_local_link_target(
            document_path,
            folder_context_path,
            target_path.as_path(),
            allow_outside_folder,
        ),
        ParsedLinkTarget::Unsupported => ResolveMarkdownLinkTargetResult::UnsupportedTarget,
    }
}

fn resolve_local_link_target(
    document_path: Option<&Path>,
    folder_context_path: Option<&Path>,
    target_path: &Path,
    allow_outside_folder: bool,
) -> ResolveMarkdownLinkTargetResult {
    let resolved_path = match resolve_markdown_reference_path(
        document_path,
        folder_context_path,
        target_path,
        allow_outside_folder,
    ) {
        MarkdownReferencePathResolution::Resolved(path) => path,
        MarkdownReferencePathResolution::UntitledRelative => {
            return ResolveMarkdownLinkTargetResult::UntitledRelative;
        }
        MarkdownReferencePathResolution::OutsideFolder(path) => {
            return ResolveMarkdownLinkTargetResult::OutsideFolder {
                path: path.to_string_lossy().into_owned(),
            };
        }
    };

    resolve_existing_link_target(resolved_path.as_path())
}

fn resolve_existing_link_target(resolved_path: &Path) -> ResolveMarkdownLinkTargetResult {
    match resolve_existing_path(resolved_path) {
        ExistingPathResolution::Found { is_file, path } => {
            if is_file && is_supported_markdown_path(resolved_path) {
                ResolveMarkdownLinkTargetResult::LocalMarkdown { path }
            } else {
                ResolveMarkdownLinkTargetResult::LocalFile { path }
            }
        }
        ExistingPathResolution::InvalidPath { path } => {
            ResolveMarkdownLinkTargetResult::InvalidPath { path }
        }
        ExistingPathResolution::Missing { path } => {
            ResolveMarkdownLinkTargetResult::Missing { path }
        }
        ExistingPathResolution::PermissionDenied { path, message } => {
            ResolveMarkdownLinkTargetResult::PermissionDenied { path, message }
        }
        ExistingPathResolution::MetadataFailed { path, message } => {
            ResolveMarkdownLinkTargetResult::MetadataFailed { path, message }
        }
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
        return parse_file_url_path(strip_file_url_reference_parts(trimmed_target))
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

fn strip_file_url_reference_parts(target: &str) -> &str {
    let fragment_index = target.find('#').unwrap_or(target.len());
    &target[..fragment_index]
}

#[cfg(test)]
mod tests {
    use super::{resolve_link_target, ResolveMarkdownLinkTargetResult};
    use crate::test_utils::{pathdiff, TestDirectory};

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
        let document_path = root.markdown_document_path();
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
        let document_path = root.markdown_document_path();
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
        let document_path = root.markdown_document_path();
        let pdf_path = root.write_file("docs/assets/manual.pdf");
        let directory_path = root.create_directory("docs/assets");

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
        let document_path = root.markdown_document_path();
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
    fn requires_outside_folder_permission_for_links_outside_the_folder_context() {
        let root = TestDirectory::new("outside-root");
        let outside = TestDirectory::new("outside-target");
        let document_path = root.markdown_document_path();
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
            ResolveMarkdownLinkTargetResult::OutsideFolder {
                path: target_path.to_string_lossy().into_owned()
            }
        );
        assert_eq!(
            local_markdown_path(allowed_result),
            target_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn requires_outside_folder_permission_for_absolute_links_without_a_folder_context() {
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
            ResolveMarkdownLinkTargetResult::OutsideFolder {
                path: target_path.to_string_lossy().into_owned()
            }
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
}
