use std::fs;

use crate::document::MARKDOWN_FILE_EXTENSIONS;

fn read_manifest_file(relative_path: &str) -> String {
    fs::read_to_string(format!("{}/{relative_path}", env!("CARGO_MANIFEST_DIR")))
        .unwrap_or_else(|error| panic!("{relative_path} should be readable: {error}"))
}

#[test]
fn installer_extension_lists_match_the_registry() {
    let nsis = read_manifest_file("gen/windows/markdown-file-extensions.nsh");
    let nsis_extensions: Vec<&str> = nsis
        .lines()
        .filter_map(|line| {
            line.trim()
                .strip_prefix("!insertmacro ${MACRO} \"")?
                .strip_suffix('"')
        })
        .collect();

    let wix = read_manifest_file("gen/windows/markdown-file-extensions.wxi");
    let wix_extensions: Vec<&str> = wix
        .split_once("MarkdownFileExtensions = \"")
        .and_then(|(_, rest)| rest.split_once('"'))
        .map(|(list, _)| list.split(';').collect())
        .expect("the WiX include should define MarkdownFileExtensions");

    assert_eq!(nsis_extensions, MARKDOWN_FILE_EXTENSIONS);
    assert_eq!(wix_extensions, MARKDOWN_FILE_EXTENSIONS);
}

#[test]
fn installers_register_every_listed_extension_without_claiming_its_default() {
    let nsis = read_manifest_file("windows/installer-hooks.nsh");
    let wix = read_manifest_file("windows/file-associations.wxs");
    let config = read_manifest_file("tauri.conf.json");

    assert!(nsis.contains(
        "!insertmacro LEAFDOWN_FOR_EACH_MARKDOWN_FILE_EXTENSION LEAFDOWN_REGISTER_EXTENSION"
    ));
    assert!(nsis.contains(
        "!insertmacro LEAFDOWN_FOR_EACH_MARKDOWN_FILE_EXTENSION LEAFDOWN_UNREGISTER_EXTENSION"
    ));
    assert!(wix.contains("<?foreach Extension in $(var.MarkdownFileExtensions) ?>"));
    assert!(
        !config.contains("fileAssociations"),
        "Tauri's association metadata writes each extension's default value"
    );

    for line in nsis.lines().chain(wix.lines()) {
        if let Some((_, key)) = line.split_once(r"Software\Classes\.") {
            assert!(
                key.contains(r"\OpenWithProgids"),
                "an installer writes an extension key outside OpenWithProgids: {}",
                line.trim()
            );
        }
    }
}
