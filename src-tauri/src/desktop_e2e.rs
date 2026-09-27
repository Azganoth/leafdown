use serde_json::{Value, json};
use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};

// Stands in for the opener plugin under the same name, so the capability ACL still
// gates each command, but records the request instead of launching the system shell.
pub(crate) fn build_opener_plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("opener")
        .invoke_handler(tauri::generate_handler![
            open_url,
            open_path,
            reveal_item_in_dir
        ])
        .build()
}

fn record_suppressed_open(command: &str, request: Value) {
    log::info!(
        "{}",
        json!({ "event": "desktopE2eOpenerSuppressed", "command": command, "request": request })
    );
}

#[tauri::command]
fn open_url(url: String) {
    record_suppressed_open("openUrl", json!(url));
}

#[tauri::command]
fn open_path(path: String) {
    record_suppressed_open("openPath", json!(path));
}

#[tauri::command]
fn reveal_item_in_dir(paths: Vec<String>) {
    record_suppressed_open("revealItemInDir", json!(paths));
}
