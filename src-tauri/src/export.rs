use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::ipc::Response;

use crate::{
    file_utils::{ReadFileError, read_file_with_size_limit, write_file_atomically},
    image::{ResolveMarkdownImageTargetResult, resolve_image_target},
    path_utils::{IoErrorClass, classify_io_error, normalize_path_lexically, path_to_string},
};

pub(crate) const MAX_EXPORT_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const HTML_FILE_EXTENSIONS: [&str; 2] = ["html", "htm"];
const UTF8_BOM: &[u8] = b"\xef\xbb\xbf";

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum ReadMarkdownImageError {
    /// The target does not resolve to a renderable local image under the editor's rules.
    Unresolved {
        resolution: ResolveMarkdownImageTargetResult,
    },
    TooLarge {
        path: String,
        size_bytes: u64,
        max_size_bytes: u64,
    },
    UnsupportedContent {
        path: String,
    },
    ReadFailed {
        path: String,
        message: String,
    },
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum WriteHtmlExportError {
    UnsupportedFileType {
        path: String,
    },
    SourceDocument {
        path: String,
    },
    InvalidPath {
        path: String,
    },
    MissingParentFolder {
        path: String,
        parent_folder_path: String,
    },
    PermissionDenied {
        path: String,
        message: String,
    },
    WriteFailed {
        path: String,
        message: String,
    },
}

/// Reads an image for embedding through the same resolution the editor renders with, so the
/// command never reads a file the editor would not show.
#[tauri::command]
pub(crate) async fn read_markdown_image(
    document_path: Option<String>,
    folder_context_path: Option<String>,
    target: String,
    allow_outside_folder: Option<bool>,
) -> Result<Response, ReadMarkdownImageError> {
    let error_path = target.clone();

    tauri::async_runtime::spawn_blocking(move || {
        read_image_for_export(
            document_path.as_deref().map(Path::new),
            folder_context_path.as_deref().map(Path::new),
            target.as_str(),
            allow_outside_folder.unwrap_or(false),
            MAX_EXPORT_IMAGE_BYTES,
        )
    })
    .await
    .unwrap_or_else(|error| {
        Err(ReadMarkdownImageError::ReadFailed {
            path: error_path,
            message: error.to_string(),
        })
    })
    .map(Response::new)
}

#[tauri::command]
pub(crate) async fn write_html_export(
    path: String,
    content: String,
    source_document_path: Option<String>,
) -> Result<(), WriteHtmlExportError> {
    let error_path = path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        write_html_file(
            Path::new(path.as_str()),
            content.as_bytes(),
            source_document_path.as_deref().map(Path::new),
        )
    })
    .await
    .unwrap_or_else(|error| {
        Err(WriteHtmlExportError::WriteFailed {
            path: error_path,
            message: error.to_string(),
        })
    })
}

pub(crate) fn read_image_for_export(
    document_path: Option<&Path>,
    folder_context_path: Option<&Path>,
    target: &str,
    allow_outside_folder: bool,
    max_size_bytes: u64,
) -> Result<Vec<u8>, ReadMarkdownImageError> {
    let path = match resolve_image_target(
        document_path,
        folder_context_path,
        target,
        allow_outside_folder,
    ) {
        ResolveMarkdownImageTargetResult::Renderable { path } => path,
        resolution => return Err(ReadMarkdownImageError::Unresolved { resolution }),
    };

    let read_failed = |message: String| ReadMarkdownImageError::ReadFailed {
        path: path.clone(),
        message,
    };
    let size_bytes = fs::metadata(path.as_str())
        .map_err(|error| read_failed(error.to_string()))?
        .len();

    if size_bytes > max_size_bytes {
        return Err(ReadMarkdownImageError::TooLarge {
            path,
            size_bytes,
            max_size_bytes,
        });
    }

    let bytes =
        read_file_with_size_limit(Path::new(path.as_str()), max_size_bytes).map_err(|error| {
            match error {
                ReadFileError::ReadFailed(error) => read_failed(error.to_string()),
                ReadFileError::Oversized {
                    size_bytes,
                    max_size_bytes,
                } => ReadMarkdownImageError::TooLarge {
                    path: path.clone(),
                    size_bytes,
                    max_size_bytes,
                },
            }
        })?;

    if !has_raster_image_signature(&bytes) && !is_svg_document(&bytes) {
        return Err(ReadMarkdownImageError::UnsupportedContent { path });
    }

    Ok(bytes)
}

pub(crate) fn write_html_file(
    path: &Path,
    content: &[u8],
    source_document_path: Option<&Path>,
) -> Result<(), WriteHtmlExportError> {
    let serialized_path = path_to_string(path);

    if !is_html_path(path) {
        return Err(WriteHtmlExportError::UnsupportedFileType {
            path: serialized_path,
        });
    }

    if source_document_path.is_some_and(|source| is_same_file_path(path, source)) {
        return Err(WriteHtmlExportError::SourceDocument {
            path: serialized_path,
        });
    }

    let parent_folder_path = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| WriteHtmlExportError::InvalidPath {
            path: serialized_path.clone(),
        })?;

    write_file_atomically(path, content).map_err(|error| match classify_io_error(error) {
        IoErrorClass::InvalidPath => WriteHtmlExportError::InvalidPath {
            path: serialized_path.clone(),
        },
        IoErrorClass::Missing => WriteHtmlExportError::MissingParentFolder {
            path: serialized_path.clone(),
            parent_folder_path: path_to_string(parent_folder_path),
        },
        IoErrorClass::PermissionDenied(message) => WriteHtmlExportError::PermissionDenied {
            path: serialized_path.clone(),
            message,
        },
        IoErrorClass::Failed(message) => WriteHtmlExportError::WriteFailed {
            path: serialized_path.clone(),
            message,
        },
    })
}

fn is_html_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            HTML_FILE_EXTENSIONS
                .iter()
                .any(|supported| supported.eq_ignore_ascii_case(extension))
        })
}

// A path that does not exist yet cannot name the source, and one that does is compared after the
// filesystem resolves it, so a symlink or a different spelling of the source is still caught.
fn is_same_file_path(left: &Path, right: &Path) -> bool {
    let left = canonical_or_lexical(left);
    let right = canonical_or_lexical(right);

    if cfg!(windows) {
        path_to_string(left.as_path()).to_lowercase()
            == path_to_string(right.as_path()).to_lowercase()
    } else {
        left == right
    }
}

fn canonical_or_lexical(path: &Path) -> PathBuf {
    let canonical = |path: &Path| {
        fs::canonicalize(path)
            .ok()
            .map(|canonical| dunce::simplified(canonical.as_path()).to_path_buf())
    };

    canonical(path)
        .or_else(|| Some(canonical(path.parent()?)?.join(path.file_name()?)))
        .unwrap_or_else(|| normalize_path_lexically(path))
}

fn has_raster_image_signature(bytes: &[u8]) -> bool {
    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";
    const JPEG: &[u8] = b"\xff\xd8\xff";

    bytes.starts_with(PNG)
        || bytes.starts_with(JPEG)
        || bytes.starts_with(b"GIF87a")
        || bytes.starts_with(b"GIF89a")
        || (bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP")
}

fn is_svg_document(bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes.strip_prefix(UTF8_BOM).unwrap_or(bytes)) else {
        return false;
    };

    text.trim_start().starts_with('<') && text.contains("<svg")
}

#[cfg(test)]
mod tests {
    use std::{assert_matches, fs};

    use super::{
        ReadMarkdownImageError, WriteHtmlExportError, read_image_for_export, write_html_file,
    };
    use crate::{image::ResolveMarkdownImageTargetResult, test_utils::TestDirectory};

    const PNG_BYTES: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";
    const SVG_BYTES: &[u8] = b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>";

    #[test]
    fn reads_resolved_raster_and_svg_images() {
        let root = TestDirectory::new("export-read");
        let document_path = root.markdown_document_path();
        root.write_file_with_content("docs/a.png", PNG_BYTES);
        root.write_file_with_content("docs/b.svg", [b"\xef\xbb\xbf  ", SVG_BYTES].concat());

        let read = |target: &str| {
            read_image_for_export(
                Some(document_path.as_path()),
                Some(root.path.as_path()),
                target,
                false,
                1024,
            )
        };

        assert_eq!(read("a.png").expect("png should read"), PNG_BYTES);
        assert!(read("b.svg").is_ok());
    }

    #[test]
    fn refuses_images_the_editor_would_not_render() {
        let root = TestDirectory::new("export-read-refused");
        let document_path = root.markdown_document_path();
        root.write_file_with_content("outside.png", PNG_BYTES);
        root.write_file_with_content("docs/fake.png", b"not an image");
        root.write_file_with_content("docs/big.png", [PNG_BYTES, &[0; 64]].concat());
        let folder = root.create_directory("docs");

        let read = |target: &str, allow_outside_folder: bool| {
            read_image_for_export(
                Some(document_path.as_path()),
                Some(folder.as_path()),
                target,
                allow_outside_folder,
                32,
            )
        };

        assert_matches!(
            read("../outside.png", false),
            Err(ReadMarkdownImageError::Unresolved {
                resolution: ResolveMarkdownImageTargetResult::OutsideFolder { .. }
            })
        );
        assert!(read("../outside.png", true).is_ok());
        assert_matches!(
            read("missing.png", false),
            Err(ReadMarkdownImageError::Unresolved {
                resolution: ResolveMarkdownImageTargetResult::Missing { .. }
            })
        );
        assert_matches!(
            read("https://example.com/a.png", false),
            Err(ReadMarkdownImageError::Unresolved {
                resolution: ResolveMarkdownImageTargetResult::RemoteBlocked { .. }
            })
        );
        assert_matches!(
            read("fake.png", false),
            Err(ReadMarkdownImageError::UnsupportedContent { .. })
        );
        assert_matches!(
            read("big.png", false),
            Err(ReadMarkdownImageError::TooLarge {
                size_bytes: 80,
                max_size_bytes: 32,
                ..
            })
        );
        assert_matches!(
            read_image_for_export(None, None, "a.png", false, 32),
            Err(ReadMarkdownImageError::Unresolved {
                resolution: ResolveMarkdownImageTargetResult::UntitledRelative
            })
        );
    }

    #[test]
    fn writes_and_replaces_html_files() {
        let root = TestDirectory::new("export-write");
        let path = root.path("out.html");

        write_html_file(path.as_path(), b"first", None).expect("export should write");
        write_html_file(path.as_path(), b"second", None).expect("export should replace");

        assert_eq!(fs::read(path).expect("export should exist"), b"second");
    }

    #[test]
    fn refuses_non_html_paths_and_the_source_document() {
        let root = TestDirectory::new("export-write-refused");
        let source = root.write_file_with_content("doc.md", "# Source\n");
        let html_source = root.write_file_with_content("page.html", "kept");

        assert_matches!(
            write_html_file(source.as_path(), b"x", Some(source.as_path())),
            Err(WriteHtmlExportError::UnsupportedFileType { .. })
        );
        assert_matches!(
            write_html_file(
                root.path(".").join("page.html").as_path(),
                b"x",
                Some(html_source.as_path())
            ),
            Err(WriteHtmlExportError::SourceDocument { .. })
        );
        assert_eq!(
            fs::read(source).expect("source should remain"),
            b"# Source\n"
        );
        assert_eq!(fs::read(html_source).expect("page should remain"), b"kept");
    }

    #[cfg(windows)]
    #[test]
    fn treats_a_differently_cased_source_path_as_the_source() {
        let root = TestDirectory::new("export-write-case");
        let source = root.write_file_with_content("Page.html", "kept");
        let other_spelling = root.path("PAGE.HTML");

        assert_matches!(
            write_html_file(other_spelling.as_path(), b"x", Some(source.as_path())),
            Err(WriteHtmlExportError::SourceDocument { .. })
        );
    }

    #[test]
    fn refuses_a_symlink_to_the_source_document() {
        let root = TestDirectory::new("export-write-symlink");
        let source = root.write_file_with_content("page.html", "kept");
        let link = root.path("link.html");

        if crate::test_utils::create_file_symlink(source.as_path(), link.as_path()).is_err() {
            return;
        }

        assert_matches!(
            write_html_file(link.as_path(), b"x", Some(source.as_path())),
            Err(WriteHtmlExportError::SourceDocument { .. })
        );
        assert_eq!(fs::read(source).expect("source should remain"), b"kept");
    }

    #[test]
    fn reports_a_missing_parent_folder_without_writing() {
        let root = TestDirectory::new("export-write-missing-parent");
        let path = root.path("missing/out.html");

        assert_matches!(
            write_html_file(path.as_path(), b"x", None),
            Err(WriteHtmlExportError::MissingParentFolder { .. })
        );
        assert!(!root.path("missing").exists());
    }
}
