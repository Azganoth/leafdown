use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::path_utils::{
    ExistingPathResolution, MarkdownReferencePathResolution, has_uri_scheme,
    is_network_or_device_target, parse_file_url_path, resolve_existing_path,
    resolve_markdown_reference_path,
};

const SUPPORTED_IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "svg", "webp"];

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum ResolveMarkdownImageTargetResult {
    Renderable { path: String },
    Missing { path: String },
    UntitledRelative,
    OutsideFolder { path: String },
    RemoteBlocked,
    UnsupportedFormat,
    UnsupportedTarget,
    InvalidPath { path: String },
    PermissionDenied { path: String, message: String },
    MetadataFailed { path: String, message: String },
}

enum ParsedImageTarget {
    Local(PathBuf),
    Remote,
    Unsupported,
}

#[tauri::command]
pub(crate) async fn resolve_markdown_image_target(
    app: AppHandle,
    document_path: Option<String>,
    folder_context_path: Option<String>,
    target: String,
    allow_outside_folder: Option<bool>,
) -> ResolveMarkdownImageTargetResult {
    let error_path = target.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        resolve_image_target(
            document_path.as_deref().map(Path::new),
            folder_context_path.as_deref().map(Path::new),
            target.as_str(),
            allow_outside_folder.unwrap_or(false),
        )
    })
    .await
    .unwrap_or_else(|error| ResolveMarkdownImageTargetResult::MetadataFailed {
        path: error_path,
        message: error.to_string(),
    });

    grant_asset_access(&app, result)
}

// The asset protocol ships with an empty scope, so nothing is readable until a
// resolution grants it. Routing the grant through `Renderable` alone keeps the
// protocol limited to what the format, folder-context, and confirmation rules
// have already approved.
fn grant_asset_access(
    app: &AppHandle,
    result: ResolveMarkdownImageTargetResult,
) -> ResolveMarkdownImageTargetResult {
    let Some(path) = renderable_asset_path(&result).map(str::to_owned) else {
        return result;
    };

    match app.asset_protocol_scope().allow_file(path.as_str()) {
        Ok(()) => result,
        Err(error) => ResolveMarkdownImageTargetResult::MetadataFailed {
            path,
            message: error.to_string(),
        },
    }
}

fn renderable_asset_path(result: &ResolveMarkdownImageTargetResult) -> Option<&str> {
    match result {
        ResolveMarkdownImageTargetResult::Renderable { path } => Some(path.as_str()),
        _ => None,
    }
}

pub(crate) fn resolve_image_target(
    document_path: Option<&Path>,
    folder_context_path: Option<&Path>,
    target: &str,
    allow_outside_folder: bool,
) -> ResolveMarkdownImageTargetResult {
    match parse_image_target(target) {
        ParsedImageTarget::Local(target_path) => resolve_local_image_target(
            document_path,
            folder_context_path,
            target_path.as_path(),
            allow_outside_folder,
        ),
        ParsedImageTarget::Remote => ResolveMarkdownImageTargetResult::RemoteBlocked,
        ParsedImageTarget::Unsupported => ResolveMarkdownImageTargetResult::UnsupportedTarget,
    }
}

fn resolve_local_image_target(
    document_path: Option<&Path>,
    folder_context_path: Option<&Path>,
    target_path: &Path,
    allow_outside_folder: bool,
) -> ResolveMarkdownImageTargetResult {
    if is_network_or_device_target(target_path) {
        return ResolveMarkdownImageTargetResult::RemoteBlocked;
    }

    if !is_supported_image_path(target_path) {
        return ResolveMarkdownImageTargetResult::UnsupportedFormat;
    }

    let resolved_path = match resolve_markdown_reference_path(
        document_path,
        folder_context_path,
        target_path,
        allow_outside_folder,
    ) {
        MarkdownReferencePathResolution::Resolved(path) => path,
        MarkdownReferencePathResolution::UntitledRelative => {
            return ResolveMarkdownImageTargetResult::UntitledRelative;
        }
        MarkdownReferencePathResolution::OutsideFolder(path) => {
            return ResolveMarkdownImageTargetResult::OutsideFolder {
                path: path.to_string_lossy().into_owned(),
            };
        }
    };

    resolve_existing_image_target(resolved_path.as_path())
}

fn resolve_existing_image_target(resolved_path: &Path) -> ResolveMarkdownImageTargetResult {
    match resolve_existing_path(resolved_path) {
        ExistingPathResolution::Found { is_file: false, .. } => {
            ResolveMarkdownImageTargetResult::Missing {
                path: resolved_path.to_string_lossy().into_owned(),
            }
        }
        ExistingPathResolution::Found { path, .. } => {
            ResolveMarkdownImageTargetResult::Renderable { path }
        }
        ExistingPathResolution::InvalidPath { path } => {
            ResolveMarkdownImageTargetResult::InvalidPath { path }
        }
        ExistingPathResolution::Missing { path } => {
            ResolveMarkdownImageTargetResult::Missing { path }
        }
        ExistingPathResolution::PermissionDenied { path, message } => {
            ResolveMarkdownImageTargetResult::PermissionDenied { path, message }
        }
        ExistingPathResolution::MetadataFailed { path, message } => {
            ResolveMarkdownImageTargetResult::MetadataFailed { path, message }
        }
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
        return parse_file_url_path(trimmed_target)
            .map(ParsedImageTarget::Local)
            .unwrap_or(ParsedImageTarget::Unsupported);
    }

    if has_uri_scheme(trimmed_target) {
        return ParsedImageTarget::Unsupported;
    }

    ParsedImageTarget::Local(path_target.to_path_buf())
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

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{ResolveMarkdownImageTargetResult, renderable_asset_path, resolve_image_target};
    use crate::test_utils::{TestDirectory, pathdiff};

    #[cfg(windows)]
    const NETWORK_TARGETS: [&str; 5] = [
        r"\\host.example.com\share\icon.png",
        "//host.example.com/share/icon.png",
        "file:////host.example.com/share/icon.png",
        r"\\?\UNC\host.example.com\share\icon.png",
        r"\\.\pipe\icon.png",
    ];

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
        let document_path = root.markdown_document_path();
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
        let document_path = root.markdown_document_path();
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
        let document_path = root.markdown_document_path();
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
    fn requires_outside_folder_permission_for_images_outside_the_folder_context() {
        let root = TestDirectory::new("outside-root");
        let outside = TestDirectory::new("outside-target");
        let document_path = root.markdown_document_path();
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
            ResolveMarkdownImageTargetResult::OutsideFolder {
                path: image_path.to_string_lossy().into_owned()
            }
        );
        assert_eq!(
            renderable_path(allowed_result),
            image_path.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn requires_outside_folder_permission_for_absolute_images_without_a_folder_context() {
        let root = TestDirectory::new("absolute-without-context");
        let image_path = root.write_file("outside.png");

        let blocked_result = resolve_image_target(
            None,
            None,
            image_path.as_path().to_string_lossy().as_ref(),
            false,
        );
        let allowed_result = resolve_image_target(
            None,
            None,
            image_path.as_path().to_string_lossy().as_ref(),
            true,
        );

        assert_eq!(
            blocked_result,
            ResolveMarkdownImageTargetResult::OutsideFolder {
                path: image_path.to_string_lossy().into_owned()
            }
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
    fn grants_asset_access_only_for_renderable_results() {
        assert_eq!(
            renderable_asset_path(&ResolveMarkdownImageTargetResult::Renderable {
                path: "C:/Notes/icon.png".to_owned(),
            }),
            Some("C:/Notes/icon.png")
        );

        for result in [
            ResolveMarkdownImageTargetResult::Missing {
                path: "C:/Notes/missing.png".to_owned(),
            },
            ResolveMarkdownImageTargetResult::UntitledRelative,
            ResolveMarkdownImageTargetResult::OutsideFolder {
                path: "C:/Other/icon.png".to_owned(),
            },
            ResolveMarkdownImageTargetResult::RemoteBlocked,
            ResolveMarkdownImageTargetResult::UnsupportedFormat,
            ResolveMarkdownImageTargetResult::UnsupportedTarget,
            ResolveMarkdownImageTargetResult::InvalidPath {
                path: "bad:path".to_owned(),
            },
            ResolveMarkdownImageTargetResult::PermissionDenied {
                path: "C:/Notes/private.png".to_owned(),
                message: "denied".to_owned(),
            },
            ResolveMarkdownImageTargetResult::MetadataFailed {
                path: "C:/Notes/icon.png".to_owned(),
                message: "failed".to_owned(),
            },
        ] {
            assert_eq!(renderable_asset_path(&result), None, "{result:?}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn blocks_network_image_targets_however_they_are_spelled() {
        for target in NETWORK_TARGETS {
            for allow_outside_folder in [false, true] {
                assert_eq!(
                    resolve_image_target(
                        Some(Path::new(r"C:\notes\docs\readme.md")),
                        Some(Path::new(r"C:\notes")),
                        target,
                        allow_outside_folder,
                    ),
                    ResolveMarkdownImageTargetResult::RemoteBlocked,
                    "target {target} with allow_outside_folder={allow_outside_folder}"
                );
            }
        }
    }

    #[test]
    fn rejects_unsupported_or_unsafe_targets() {
        let root = TestDirectory::new("unsupported-target");
        let document_path = root.markdown_document_path();

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
}
