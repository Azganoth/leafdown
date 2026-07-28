use std::{fs, path::Path};

use serde_json::Value;

use crate::{
    document, folder, image, link,
    test_utils::{TestDirectory, pathdiff},
};

#[test]
fn saves_scans_and_opens_markdown_documents_through_command_functions() {
    let root = TestDirectory::new("command-contract-flow");
    root.create_directory("docs");
    let document_path = root.path("docs/article.md");
    let document_path_string = path_string(document_path.as_path());
    let document_parent_path_string = path_string(root.path("docs").as_path());
    let root_path_string = path_string(root.path.as_path());

    let save_result = tauri::async_runtime::block_on(document::save_markdown_file(
        document_path_string.clone(),
        "# Saved\n".to_owned(),
        None,
        None,
    ))
    .expect("command should save Markdown");
    let save_value = serialized(save_result);

    assert_eq!(json_string(&save_value, "path"), document_path_string);
    assert_eq!(
        json_string(&save_value, "parentFolderPath"),
        document_parent_path_string
    );
    assert_eq!(
        save_value["metadata"]["sizeBytes"].as_u64(),
        Some(8),
        "metadata.sizeBytes should serialize as a number"
    );

    let scan_result = tauri::async_runtime::block_on(folder::scan_markdown_folder(
        root_path_string.clone(),
        Some(Vec::new()),
        None,
    ))
    .expect("command should scan the folder");
    let scan_value = serialized(scan_result);

    assert_eq!(json_string(&scan_value, "path"), root_path_string);
    assert_eq!(scan_value["isEmpty"].as_bool(), Some(false));
    assert_eq!(
        scan_value["warnings"].as_array().map(Vec::len),
        Some(0),
        "warnings should serialize as an array"
    );
    assert_tree_contains_path(&scan_value["tree"], document_path_string.as_str());

    let open_result =
        tauri::async_runtime::block_on(document::open_markdown_file(document_path_string.clone()))
            .expect("command should open saved Markdown");
    let open_value = serialized(open_result);

    assert_eq!(json_string(&open_value, "path"), document_path_string);
    assert_eq!(json_string(&open_value, "content"), "# Saved\n");
    assert_eq!(json_string(&open_value, "lineEnding"), "lf");
    assert_eq!(
        open_value["metadata"]["sizeBytes"].as_u64(),
        Some(8),
        "metadata.sizeBytes should serialize as a number"
    );
}

#[test]
fn command_errors_serialize_with_frontend_error_kinds() {
    let root = TestDirectory::new("command-contract-errors");
    let unsupported_file = root.write_file("notes.txt");
    let externally_modified_file = root.write_file("modified.md");
    let missing_parent_file = root.path("missing/readme.md");
    let oversized_file = root.write_file_with_content(
        "large.md",
        vec![b'A'; (document::MAX_MARKDOWN_FILE_SIZE_BYTES + 1) as usize],
    );
    let missing_folder = root.path("missing");

    let open_error = tauri::async_runtime::block_on(document::open_markdown_file(path_string(
        unsupported_file.as_path(),
    )))
    .expect_err("unsupported files should be rejected");
    let open_error = serialized(open_error);

    assert_eq!(json_string(&open_error, "kind"), "unsupportedFileType");
    assert_eq!(
        json_string(&open_error, "path"),
        path_string(unsupported_file.as_path())
    );

    let oversized_error = tauri::async_runtime::block_on(document::open_markdown_file(
        path_string(oversized_file.as_path()),
    ))
    .expect_err("oversized files should be rejected");
    let oversized_error = serialized(oversized_error);

    assert_eq!(json_string(&oversized_error, "kind"), "oversizedFile");
    assert_eq!(
        json_string(&oversized_error, "path"),
        path_string(oversized_file.as_path())
    );
    assert_eq!(
        oversized_error["sizeBytes"].as_u64(),
        Some(document::MAX_MARKDOWN_FILE_SIZE_BYTES + 1)
    );
    assert_eq!(
        oversized_error["maxSizeBytes"].as_u64(),
        Some(document::MAX_MARKDOWN_FILE_SIZE_BYTES)
    );

    let missing_parent_error = tauri::async_runtime::block_on(document::save_markdown_file(
        path_string(missing_parent_file.as_path()),
        "# Saved\n".to_owned(),
        None,
        None,
    ))
    .expect_err("missing parent folders should be rejected");
    let missing_parent_error = serialized(missing_parent_error);

    assert_eq!(
        json_string(&missing_parent_error, "kind"),
        "missingParentFolder"
    );
    assert_eq!(
        json_string(&missing_parent_error, "parentFolderPath"),
        path_string(root.path("missing").as_path())
    );

    let opened_document = document::read_markdown_file(externally_modified_file.as_path())
        .expect("test Markdown file should open");
    fs::write(externally_modified_file.as_path(), "# Changed externally\n")
        .expect("test Markdown file should change");
    let external_modification_error = tauri::async_runtime::block_on(document::save_markdown_file(
        path_string(externally_modified_file.as_path()),
        "# Saved\n".to_owned(),
        Some(opened_document.metadata),
        None,
    ))
    .expect_err("externally modified files should be rejected");
    let external_modification_error = serialized(external_modification_error);

    assert_eq!(
        json_string(&external_modification_error, "kind"),
        "externalModification"
    );
    assert!(
        external_modification_error["currentMetadata"]["sizeBytes"]
            .as_u64()
            .is_some(),
        "currentMetadata.sizeBytes should serialize as a number"
    );
    assert!(
        external_modification_error["currentMetadata"]["modifiedAtUnixMs"]
            .as_u64()
            .is_some(),
        "currentMetadata.modifiedAtUnixMs should serialize as a number"
    );

    let scan_error = tauri::async_runtime::block_on(folder::scan_markdown_folder(
        path_string(missing_folder.as_path()),
        None,
        None,
    ))
    .expect_err("missing folders should be rejected");
    let scan_error = serialized(scan_error);

    assert_eq!(json_string(&scan_error, "kind"), "missingFolder");
    assert_eq!(
        json_string(&scan_error, "path"),
        path_string(missing_folder.as_path())
    );
}

#[test]
fn image_and_link_commands_default_to_restricted_outside_folder_access() {
    let root = TestDirectory::new("command-contract-reference-root");
    let outside = TestDirectory::new("command-contract-reference-outside");
    let document_path = root.markdown_document_path();
    let image_path = outside.write_file("outside.png");
    let link_path = outside.write_file("outside.md");
    let relative_image_target = pathdiff(image_path.as_path(), document_path.parent().unwrap());
    let relative_link_target = pathdiff(link_path.as_path(), document_path.parent().unwrap());
    let document_path_string = path_string(document_path.as_path());
    let root_path_string = path_string(root.path.as_path());

    let blocked_image = tauri::async_runtime::block_on(image::resolve_markdown_image_target(
        Some(document_path_string.clone()),
        Some(root_path_string.clone()),
        relative_image_target.clone(),
        None,
    ));
    let blocked_image = serialized(blocked_image);
    assert_eq!(json_string(&blocked_image, "kind"), "outsideFolder");
    assert_eq!(
        json_string(&blocked_image, "path"),
        path_string(image_path.as_path())
    );

    let allowed_image = tauri::async_runtime::block_on(image::resolve_markdown_image_target(
        Some(document_path_string.clone()),
        Some(root_path_string.clone()),
        relative_image_target,
        Some(true),
    ));
    assert_eq!(
        json_string(&serialized(allowed_image), "kind"),
        "renderable"
    );

    let blocked_link = tauri::async_runtime::block_on(link::resolve_markdown_link_target(
        Some(document_path_string.clone()),
        Some(root_path_string.clone()),
        relative_link_target.clone(),
        None,
    ));
    let blocked_link = serialized(blocked_link);
    assert_eq!(json_string(&blocked_link, "kind"), "outsideFolder");
    assert_eq!(
        json_string(&blocked_link, "path"),
        path_string(link_path.as_path())
    );

    let allowed_link = tauri::async_runtime::block_on(link::resolve_markdown_link_target(
        Some(document_path_string),
        Some(root_path_string),
        relative_link_target,
        Some(true),
    ));
    assert_eq!(
        json_string(&serialized(allowed_link), "kind"),
        "localMarkdown"
    );
}

#[test]
fn image_and_link_command_results_keep_frontend_shape_contracts() {
    let root = TestDirectory::new("command-contract-result-shapes");
    let document_path = root.markdown_document_path();
    let image_path = root.write_file("docs/assets/icon.png");
    let link_path = root.write_file("docs/linked.md");
    let document_path_string = path_string(document_path.as_path());
    let root_path_string = path_string(root.path.as_path());

    let image_result = tauri::async_runtime::block_on(image::resolve_markdown_image_target(
        Some(document_path_string.clone()),
        Some(root_path_string.clone()),
        "assets/icon.png".to_owned(),
        None,
    ));
    let image_result = serialized(image_result);

    assert_eq!(json_string(&image_result, "kind"), "renderable");
    assert_eq!(
        json_string(&image_result, "path"),
        path_string(image_path.canonicalize().unwrap().as_path())
    );

    let link_result = tauri::async_runtime::block_on(link::resolve_markdown_link_target(
        Some(document_path_string),
        Some(root_path_string),
        "linked.md".to_owned(),
        None,
    ));
    let link_result = serialized(link_result);

    assert_eq!(json_string(&link_result, "kind"), "localMarkdown");
    assert_eq!(
        json_string(&link_result, "path"),
        path_string(link_path.canonicalize().unwrap().as_path())
    );
}

fn serialized(value: impl serde::Serialize) -> Value {
    serde_json::to_value(value).expect("command payload should serialize")
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn json_string<'a>(value: &'a Value, key: &str) -> &'a str {
    value
        .get(key)
        .and_then(Value::as_str)
        .expect("JSON field should be a string")
}

fn assert_tree_contains_path(tree: &Value, expected_path: &str) {
    assert!(
        tree_contains_path(tree, expected_path),
        "tree should contain path {expected_path}: {tree}"
    );
}

fn tree_contains_path(tree: &Value, expected_path: &str) -> bool {
    if tree
        .get("path")
        .and_then(Value::as_str)
        .is_some_and(|path| Path::new(path) == Path::new(expected_path))
    {
        return true;
    }

    let Some(children) = tree.get("children").and_then(Value::as_array) else {
        return false;
    };

    children
        .iter()
        .any(|child| tree_contains_path(child, expected_path))
}
