use std::{collections::BTreeSet, fs};

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

#[test]
fn installers_register_the_bundled_document_icon_without_replacing_the_app_icon() {
    let config: serde_json::Value = serde_json::from_str(&read_manifest_file("tauri.conf.json"))
        .expect("the Tauri configuration should be valid JSON");
    let source = "icons/document.ico";

    assert_eq!(config["bundle"]["resources"][source], "document.ico");
    assert!(
        config["bundle"]["icon"]
            .as_array()
            .expect("application icons should be listed")
            .iter()
            .any(|icon| icon == "icons/icon.ico")
    );
    assert!(read_manifest_file("windows/installer-hooks.nsh").contains(
        "WriteRegStr SHCTX \"${LEAFDOWN_PROGID_KEY}\\DefaultIcon\" \"\" `\"$INSTDIR\\document.ico\",0`"
    ));
    assert!(read_manifest_file("windows/file-associations.wxs").contains(
        "<RegistryValue Key=\"DefaultIcon\" Type=\"string\" Value=\"&quot;[INSTALLDIR]document.ico&quot;,0\" />"
    ));

    let icon = fs::read(format!("{}/{source}", env!("CARGO_MANIFEST_DIR")))
        .expect("the bundled document icon should be readable");
    assert_eq!(&icon[..4], &[0, 0, 1, 0]);
    let frame_count = usize::from(u16::from_le_bytes([icon[4], icon[5]]));
    let mut sizes = BTreeSet::new();
    for index in 0..frame_count {
        let entry = &icon[6 + index * 16..6 + (index + 1) * 16];
        let width = if entry[0] == 0 {
            256
        } else {
            u32::from(entry[0])
        };
        let height = if entry[1] == 0 {
            256
        } else {
            u32::from(entry[1])
        };
        assert_eq!(width, height);
        assert!(sizes.insert(width), "icon frame sizes should not repeat");

        let length = u32::from_le_bytes(entry[8..12].try_into().unwrap()) as usize;
        let offset = u32::from_le_bytes(entry[12..16].try_into().unwrap()) as usize;
        let image = &icon[offset..offset + length];
        assert_eq!(&image[..8], b"\x89PNG\r\n\x1a\n");
        assert_eq!(u32::from_be_bytes(image[16..20].try_into().unwrap()), width);
        assert_eq!(
            u32::from_be_bytes(image[20..24].try_into().unwrap()),
            height
        );
    }
    assert_eq!(
        sizes,
        BTreeSet::from([16, 20, 24, 32, 40, 48, 64, 128, 256])
    );
}
