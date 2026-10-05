use std::{fs, path::Path};

use serde_json::Value;

use crate::{
    document, export, folder, image, link, remote_image,
    test_utils::{TestDirectory, canonical_path_string, pathdiff},
    text_encoding::{DocumentEncoding, TextEncoding},
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
        DocumentEncoding {
            name: TextEncoding::Utf16Le,
            bom: true,
        },
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
        Some(18),
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

    let open_result = tauri::async_runtime::block_on(document::open_markdown_file(
        document_path_string.clone(),
        None,
    ))
    .expect("command should open saved Markdown");
    let open_value = serialized(open_result);

    assert_eq!(json_string(&open_value, "path"), document_path_string);
    assert_eq!(json_string(&open_value, "content"), "# Saved\n");
    assert_eq!(json_string(&open_value, "lineEnding"), "lf");
    assert_eq!(
        open_value["encoding"],
        serde_json::json!({ "name": "UTF-16LE", "bom": true })
    );
    assert_eq!(
        open_value["metadata"]["sizeBytes"].as_u64(),
        Some(18),
        "metadata.sizeBytes should serialize as a number"
    );
    assert_eq!(
        json_string(&open_value, "fingerprint"),
        json_string(&save_value, "fingerprint"),
        "the fingerprint should serialize as a string naming the saved bytes"
    );
}

#[test]
fn inspects_a_saved_document_through_command_functions() {
    let root = TestDirectory::new("command-contract-inspect");
    let document_path = root.write_file_with_content("article.md", "# Saved\n");
    let document_path_string = path_string(document_path.as_path());
    let opened = document::read_markdown_file(document_path.as_path(), None)
        .expect("test Markdown file should open");
    let inspect = |metadata, fingerprint: &str| {
        serialized(
            tauri::async_runtime::block_on(document::inspect_markdown_file(
                document_path_string.clone(),
                metadata,
                fingerprint.to_owned(),
            ))
            .expect("command should inspect the document"),
        )
    };

    assert_eq!(
        inspect(opened.metadata, opened.fingerprint.as_str()),
        serde_json::json!({ "kind": "unchanged" })
    );

    let stale_metadata = document::FileMetadataSnapshot {
        modified_at_unix_ms: 0,
        ..opened.metadata
    };
    let touched = inspect(stale_metadata, opened.fingerprint.as_str());

    assert_eq!(json_string(&touched, "kind"), "metadataChanged");
    assert_eq!(
        touched["metadata"]["modifiedAtUnixMs"].as_u64(),
        Some(opened.metadata.modified_at_unix_ms)
    );

    let changed = inspect(stale_metadata, "another version");

    assert_eq!(json_string(&changed, "kind"), "contentChanged");
    assert_eq!(json_string(&changed, "fingerprint"), opened.fingerprint);
    assert!(changed["metadata"]["sizeBytes"].as_u64().is_some());

    fs::remove_file(document_path.as_path()).expect("test Markdown file should be removed");

    assert_eq!(
        inspect(opened.metadata, opened.fingerprint.as_str()),
        serde_json::json!({ "kind": "missing" })
    );

    let unsupported_error = tauri::async_runtime::block_on(document::inspect_markdown_file(
        path_string(root.path("notes.txt").as_path()),
        opened.metadata,
        opened.fingerprint.clone(),
    ))
    .expect_err("unsupported files should be rejected");

    assert_eq!(
        json_string(&serialized(unsupported_error), "kind"),
        "unsupportedFileType"
    );
}

#[test]
fn opens_and_saves_a_chosen_encoding_through_command_functions() {
    let root = TestDirectory::new("command-contract-encoding");
    let document_path = root.write_file_with_content("latin.md", b"# Caf\xe9\n");
    let irreversible_path = root.write_file_with_content("irreversible.md", b"\x87\x90\n");
    let document_path_string = path_string(document_path.as_path());
    let windows_1252: TextEncoding =
        serde_json::from_value(serde_json::json!("windows-1252")).unwrap();

    let invalid_error = tauri::async_runtime::block_on(document::open_markdown_file(
        document_path_string.clone(),
        None,
    ))
    .expect_err("Windows-1252 bytes should not open as UTF-8");

    assert_eq!(
        json_string(&serialized(invalid_error), "kind"),
        "invalidEncoding"
    );

    let open_value = serialized(
        tauri::async_runtime::block_on(document::open_markdown_file(
            document_path_string.clone(),
            Some(windows_1252),
        ))
        .expect("command should open the chosen encoding"),
    );

    assert_eq!(json_string(&open_value, "content"), "# Café\n");
    assert_eq!(
        open_value["encoding"],
        serde_json::json!({ "name": "windows-1252", "bom": false })
    );

    let encoding: DocumentEncoding = serde_json::from_value(open_value["encoding"].clone())
        .expect("encoding should deserialize as a save argument");
    let unrepresentable_error = tauri::async_runtime::block_on(document::save_markdown_file(
        document_path_string.clone(),
        "# Café ✓\n".to_owned(),
        encoding,
        None,
        None,
    ))
    .expect_err("unrepresentable characters should be rejected");
    let unrepresentable_error = serialized(unrepresentable_error);

    assert_eq!(
        json_string(&unrepresentable_error, "kind"),
        "unrepresentableCharacters"
    );
    assert_eq!(
        json_string(&unrepresentable_error, "encoding"),
        "windows-1252"
    );
    assert_eq!(
        unrepresentable_error["characters"],
        serde_json::json!(["✓"])
    );
    assert_eq!(fs::read(document_path.as_path()).unwrap(), b"# Caf\xe9\n");

    let shift_jis: TextEncoding = serde_json::from_value(serde_json::json!("Shift_JIS")).unwrap();
    let irreversible_error = tauri::async_runtime::block_on(document::open_markdown_file(
        path_string(irreversible_path.as_path()),
        Some(shift_jis),
    ))
    .expect_err("a choice that rewrites bytes should be rejected");
    let irreversible_error = serialized(irreversible_error);

    assert_eq!(
        json_string(&irreversible_error, "kind"),
        "irreversibleEncoding"
    );
    assert_eq!(json_string(&irreversible_error, "encoding"), "Shift_JIS");
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

    let open_error = tauri::async_runtime::block_on(document::open_markdown_file(
        path_string(unsupported_file.as_path()),
        None,
    ))
    .expect_err("unsupported files should be rejected");
    let open_error = serialized(open_error);

    assert_eq!(json_string(&open_error, "kind"), "unsupportedFileType");
    assert_eq!(
        json_string(&open_error, "path"),
        path_string(unsupported_file.as_path())
    );

    let oversized_error = tauri::async_runtime::block_on(document::open_markdown_file(
        path_string(oversized_file.as_path()),
        None,
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
        DocumentEncoding::UTF8,
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

    let opened_document = document::read_markdown_file(externally_modified_file.as_path(), None)
        .expect("test Markdown file should open");
    fs::write(externally_modified_file.as_path(), "# Changed externally\n")
        .expect("test Markdown file should change");
    let external_modification_error = tauri::async_runtime::block_on(document::save_markdown_file(
        path_string(externally_modified_file.as_path()),
        "# Saved\n".to_owned(),
        DocumentEncoding::UTF8,
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
fn html_export_commands_serialize_with_frontend_error_kinds() {
    let root = TestDirectory::new("command-contract-export");
    let document_path = root.markdown_document_path();
    let document_path_string = path_string(document_path.as_path());
    let folder_path_string = path_string(root.path.as_path());
    root.write_file_with_content("outside.png", b"\x89PNG\r\n\x1a\n");
    root.write_file_with_content("docs/fake.png", b"text");

    let read_error = |target: &str, folder: Option<String>| {
        serialized(
            tauri::async_runtime::block_on(export::read_markdown_image(
                Some(document_path_string.clone()),
                folder,
                target.to_owned(),
                None,
            ))
            .err()
            .expect("the image should not be read"),
        )
    };

    let outside_error = read_error(
        "../outside.png",
        Some(path_string(root.path("docs").as_path())),
    );
    assert_eq!(json_string(&outside_error, "kind"), "unresolved");
    assert_eq!(
        json_string(&outside_error["resolution"], "kind"),
        "outsideFolder"
    );

    let content_error = read_error("fake.png", Some(folder_path_string.clone()));
    assert_eq!(json_string(&content_error, "kind"), "unsupportedContent");

    let source_error = tauri::async_runtime::block_on(export::write_html_export(
        path_string(root.path("docs/readme.md").as_path()),
        String::new(),
        Some(document_path_string.clone()),
    ))
    .expect_err("a Markdown path should be refused");
    assert_eq!(
        json_string(&serialized(source_error), "kind"),
        "unsupportedFileType"
    );

    let missing_parent_error = serialized(
        tauri::async_runtime::block_on(export::write_html_export(
            path_string(root.path("missing/out.html").as_path()),
            String::new(),
            None,
        ))
        .expect_err("a missing parent folder should be reported"),
    );
    assert_eq!(
        json_string(&missing_parent_error, "kind"),
        "missingParentFolder"
    );
    assert_eq!(
        json_string(&missing_parent_error, "parentFolderPath"),
        path_string(root.path("missing").as_path())
    );

    tauri::async_runtime::block_on(export::write_html_export(
        path_string(root.path("docs/readme.html").as_path()),
        "<!doctype html>".to_owned(),
        Some(document_path_string),
    ))
    .expect("an HTML path beside the source should be written");
    assert_eq!(
        fs::read_to_string(root.path("docs/readme.html")).expect("export should exist"),
        "<!doctype html>"
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

    let blocked_image = image::resolve_image_target(
        Some(document_path.as_path()),
        Some(root.path.as_path()),
        relative_image_target.as_str(),
        false,
    );
    let blocked_image = serialized(blocked_image);
    assert_eq!(json_string(&blocked_image, "kind"), "outsideFolder");
    assert_eq!(
        json_string(&blocked_image, "path"),
        path_string(image_path.as_path())
    );

    let allowed_image = image::resolve_image_target(
        Some(document_path.as_path()),
        Some(root.path.as_path()),
        relative_image_target.as_str(),
        true,
    );
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

    let image_result = image::resolve_image_target(
        Some(document_path.as_path()),
        Some(root.path.as_path()),
        "assets/icon.png",
        false,
    );
    let image_result = serialized(image_result);

    assert_eq!(json_string(&image_result, "kind"), "renderable");
    assert_eq!(
        json_string(&image_result, "path"),
        canonical_path_string(image_path.as_path())
    );

    let loadable_remote = serialized(image::resolve_image_target(
        None,
        None,
        "https://images.example.com/icon.png",
        false,
    ));

    assert_eq!(json_string(&loadable_remote, "kind"), "remoteBlocked");
    assert_eq!(json_string(&loadable_remote, "host"), "images.example.com");

    let blocked_remote = serialized(image::resolve_image_target(
        None,
        None,
        "http://images.example.com/icon.png",
        false,
    ));

    assert_eq!(json_string(&blocked_remote, "kind"), "remoteBlocked");
    assert!(blocked_remote["host"].is_null());

    let Err(fetch_error) = tauri::async_runtime::block_on(remote_image::fetch_remote_image(
        "http://images.example.com/icon.png".to_owned(),
    )) else {
        panic!("an http target should not be fetched");
    };

    assert_eq!(
        serialized(fetch_error),
        serde_json::json!({ "kind": "insecureScheme" })
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
        canonical_path_string(link_path.as_path())
    );
}

#[test]
fn resolved_link_paths_match_folder_scan_paths() {
    let root = TestDirectory::new("command-contract-path-identity");
    let document_path = root.markdown_document_path();
    root.write_file("docs/linked.md");
    // The frontend supplies a folder path the OS picker produced, so start from the real path
    // rather than whatever form `TEMP` happens to carry on the host.
    let root_path_string = canonical_path_string(root.path.as_path());

    let scan_result = tauri::async_runtime::block_on(folder::scan_markdown_folder(
        root_path_string.clone(),
        Some(Vec::new()),
        None,
    ))
    .expect("command should scan the folder");
    let scan_value = serialized(scan_result);

    let link_result = tauri::async_runtime::block_on(link::resolve_markdown_link_target(
        Some(path_string(document_path.as_path())),
        Some(root_path_string),
        "linked.md".to_owned(),
        None,
    ));
    let link_value = serialized(link_result);

    assert_eq!(json_string(&link_value, "kind"), "localMarkdown");
    // The frontend matches a resolved link against the article navigator by path. Any form the
    // two commands disagree on reads as a document outside the folder context.
    assert_tree_contains_path(&scan_value["tree"], json_string(&link_value, "path"));
}

#[test]
fn folder_entry_commands_return_paths_the_folder_scan_reports() {
    let root = TestDirectory::new("command-contract-folder-entries");
    let root_path_string = canonical_path_string(root.path.as_path());

    let directory = serialized(
        tauri::async_runtime::block_on(folder::create_article_directory(
            root_path_string.clone(),
            root_path_string.clone(),
            "guides".to_owned(),
        ))
        .expect("command should create a directory"),
    );
    let directory_path = json_string(&directory, "path").to_owned();
    let article = serialized(
        tauri::async_runtime::block_on(folder::create_markdown_article(
            root_path_string.clone(),
            directory_path.clone(),
            "setup".to_owned(),
            ".md".to_owned(),
        ))
        .expect("command should create an article"),
    );
    let renamed = serialized(
        tauri::async_runtime::block_on(folder::rename_folder_entry(
            root_path_string.clone(),
            json_string(&article, "path").to_owned(),
            "install".to_owned(),
        ))
        .expect("command should rename the article"),
    );
    let scan_value = serialized(
        tauri::async_runtime::block_on(folder::scan_markdown_folder(
            root_path_string.clone(),
            Some(Vec::new()),
            None,
        ))
        .expect("command should scan the folder"),
    );

    assert_tree_contains_path(&scan_value["tree"], directory_path.as_str());
    assert_tree_contains_path(&scan_value["tree"], json_string(&renamed, "path"));
    assert!(json_string(&renamed, "path").ends_with("install.md"));
}

#[test]
fn folder_entry_errors_serialize_with_frontend_error_kinds() {
    let root = TestDirectory::new("command-contract-folder-entry-errors");
    let root_path_string = path_string(root.path.as_path());
    root.write_file("taken.md");

    let invalid_name = serialized(
        tauri::async_runtime::block_on(folder::create_article_directory(
            root_path_string.clone(),
            root_path_string.clone(),
            "a/b".to_owned(),
        ))
        .expect_err("invalid name should fail"),
    );
    let collision = serialized(
        tauri::async_runtime::block_on(folder::create_markdown_article(
            root_path_string.clone(),
            root_path_string.clone(),
            "taken".to_owned(),
            ".md".to_owned(),
        ))
        .expect_err("collision should fail"),
    );
    let unsupported = serialized(
        tauri::async_runtime::block_on(folder::create_markdown_article(
            root_path_string.clone(),
            root_path_string.clone(),
            "notes.txt".to_owned(),
            ".md".to_owned(),
        ))
        .expect_err("unsupported extension should fail"),
    );
    let root_entry = serialized(
        tauri::async_runtime::block_on(folder::trash_folder_entry(
            root_path_string.clone(),
            root_path_string.clone(),
        ))
        .expect_err("folder context root should be refused"),
    );
    let missing = serialized(
        tauri::async_runtime::block_on(folder::rename_folder_entry(
            root_path_string.clone(),
            path_string(root.path("missing.md").as_path()),
            "other".to_owned(),
        ))
        .expect_err("missing entry should fail"),
    );

    assert_eq!(json_string(&invalid_name, "kind"), "invalidName");
    assert_eq!(json_string(&invalid_name, "reason"), "invalidCharacter");
    assert_eq!(json_string(&collision, "kind"), "alreadyExists");
    assert_eq!(json_string(&unsupported, "kind"), "unsupportedExtension");
    assert_eq!(json_string(&unsupported, "name"), "notes.txt");
    assert_eq!(json_string(&root_entry, "kind"), "outsideFolder");
    assert_eq!(json_string(&missing, "kind"), "missingEntry");
}

#[test]
fn folder_search_reads_serialize_with_frontend_outcome_kinds() {
    let root = TestDirectory::new("command-contract-folder-search");
    let root_path_string = path_string(root.path.as_path());
    let note_path_string = path_string(root.write_file_with_content("note.md", "leaf\n").as_path());
    let invalid_path_string =
        path_string(root.write_file_with_content("invalid.md", [0xff]).as_path());
    let outside_path_string = path_string(root.path("../outside.md").as_path());
    let request = |known_metadata: Value| {
        serde_json::from_value::<Vec<folder::FolderSearchFileRequest>>(serde_json::json!([
            { "path": note_path_string, "knownMetadata": known_metadata },
            { "path": invalid_path_string },
            { "path": outside_path_string, "knownMetadata": null },
        ]))
        .expect("frontend request should deserialize")
    };

    let read = serialized(
        tauri::async_runtime::block_on(folder::read_folder_search_files(
            root_path_string.clone(),
            request(Value::Null),
        ))
        .expect("command should read the folder's files"),
    );

    assert_eq!(json_string(&read[0], "kind"), "read");
    assert_eq!(json_string(&read[0], "path"), note_path_string);
    assert_eq!(json_string(&read[0], "content"), "leaf\n");
    assert_eq!(read[0]["metadata"]["sizeBytes"].as_u64(), Some(5));
    assert!(read[0]["metadata"]["modifiedAtUnixMs"].is_u64());
    assert!(read[0]["fingerprint"].is_string());
    assert_eq!(json_string(&read[1], "kind"), "skipped");
    assert_eq!(json_string(&read[1]["error"], "kind"), "invalidEncoding");
    assert_eq!(json_string(&read[1]["error"], "path"), invalid_path_string);
    assert_eq!(json_string(&read[2], "kind"), "notArticle");

    let unchanged = serialized(
        tauri::async_runtime::block_on(folder::read_folder_search_files(
            root_path_string,
            request(read[0]["metadata"].clone()),
        ))
        .expect("command should check the folder's files"),
    );

    assert_eq!(json_string(&unchanged[0], "kind"), "unchanged");
    assert_eq!(json_string(&unchanged[0], "path"), note_path_string);
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
