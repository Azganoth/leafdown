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

// Stands in for the dialog plugin under the same name, since a scenario cannot drive the native
// picker. A request takes the answer a scenario left in the response file, consuming it, and is
// cancelled when none is waiting.
pub(crate) fn build_dialog_plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("dialog")
        .invoke_handler(tauri::generate_handler![open, save])
        .build()
}

fn take_scripted_dialog_answer(command: &str, request: Value) -> Option<String> {
    let answer = std::env::var_os("LEAFDOWN_E2E_DIALOG_RESPONSE_PATH").and_then(|path| {
        let text = std::fs::read_to_string(&path).ok()?;
        let _ = std::fs::remove_file(&path);
        serde_json::from_str::<Option<String>>(&text).ok().flatten()
    });

    log::info!(
        "{}",
        json!({
            "event": "desktopE2eDialogAnswered",
            "command": command,
            "request": request,
            "answer": answer,
        })
    );

    answer
}

#[tauri::command]
fn open(options: Value) -> Option<String> {
    take_scripted_dialog_answer("open", options)
}

#[tauri::command]
fn save(options: Value) -> Option<String> {
    take_scripted_dialog_answer("save", options)
}
