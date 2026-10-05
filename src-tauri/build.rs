use std::{env, fs, path::PathBuf};

const MARKDOWN_FILE_EXTENSIONS_PATH: &str = "markdown-file-extensions.json";

fn main() {
    generate_markdown_file_extensions();
    tauri_build::build()
}

fn generate_markdown_file_extensions() {
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
