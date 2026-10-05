use std::{env, fs, path::PathBuf};

const MARKDOWN_FILE_EXTENSIONS_PATH: &str = "markdown-file-extensions.json";
const NSIS_MARKDOWN_FILE_EXTENSIONS_PATH: &str = "gen/windows/markdown-file-extensions.nsh";
const WIX_MARKDOWN_FILE_EXTENSIONS_PATH: &str = "gen/windows/markdown-file-extensions.wxi";

fn main() {
    let extensions = read_markdown_file_extensions();

    generate_markdown_file_extensions(&extensions);
    generate_installer_markdown_file_extensions(&extensions);
    tauri_build::build()
}

fn read_markdown_file_extensions() -> Vec<String> {
    println!("cargo:rerun-if-changed={MARKDOWN_FILE_EXTENSIONS_PATH}");

    let source = fs::read_to_string(MARKDOWN_FILE_EXTENSIONS_PATH)
        .expect("the Markdown file extension registry should be readable");
    let extensions: Vec<String> = serde_json::from_str(source.as_str())
        .expect("the Markdown file extension registry should be a JSON array of strings");

    assert!(
        !extensions.is_empty(),
        "the Markdown file extension registry should not be empty"
    );
    for (index, extension) in extensions.iter().enumerate() {
        assert!(
            !extension.is_empty()
                && extension
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit()),
            "Markdown file extension {extension:?} should be lowercase ASCII without a leading dot"
        );
        assert!(
            !extensions[..index].contains(extension),
            "Markdown file extension {extension:?} should be listed once"
        );
    }

    extensions
}

fn generate_markdown_file_extensions(extensions: &[String]) {
    let output_path = PathBuf::from(env::var("OUT_DIR").expect("Cargo should set OUT_DIR"))
        .join("markdown_file_extensions.rs");
    fs::write(
        output_path,
        format!(
            "pub(crate) const MARKDOWN_FILE_EXTENSIONS: [&str; {}] = {extensions:?};\n",
            extensions.len()
        ),
    )
    .expect("the generated Markdown file extension registry should be written");
}

/// The Windows installer hook and WiX fragment include these lists, so file associations come from
/// the same registry. The bundler reads them from fixed paths after Cargo builds the binary.
fn generate_installer_markdown_file_extensions(extensions: &[String]) {
    let nsis_registrations: String = extensions
        .iter()
        .map(|extension| format!("  !insertmacro ${{MACRO}} \"{extension}\"\n"))
        .collect();

    write_generated_file(
        NSIS_MARKDOWN_FILE_EXTENSIONS_PATH,
        format!(
            "!macro LEAFDOWN_FOR_EACH_MARKDOWN_FILE_EXTENSION MACRO\n{nsis_registrations}!macroend\n"
        ),
    );
    write_generated_file(
        WIX_MARKDOWN_FILE_EXTENSIONS_PATH,
        format!(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<Include>\n    <?define MarkdownFileExtensions = \"{}\" ?>\n</Include>\n",
            extensions.join(";")
        ),
    );
}

fn write_generated_file(path: &str, contents: String) {
    println!("cargo:rerun-if-changed={path}");

    if fs::read_to_string(path).is_ok_and(|existing| existing == contents) {
        return;
    }

    if let Some(parent) = PathBuf::from(path).parent() {
        fs::create_dir_all(parent).expect("the generated installer directory should be created");
    }
    fs::write(path, contents).expect("the generated installer extension list should be written");
}
