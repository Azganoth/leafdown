#[tauri::command]
pub(crate) fn open_webview_devtools(webview_window: tauri::WebviewWindow) -> Result<(), String> {
    webview_window.open_devtools();
    Ok(())
}
