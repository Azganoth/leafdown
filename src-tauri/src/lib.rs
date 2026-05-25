use tauri::{Emitter, WindowEvent};
use tauri_plugin_frame::FramePluginBuilder;
use tauri_plugin_window_state::StateFlags;

mod document;
mod folder;

const WINDOW_CLOSE_REQUESTED_EVENT: &str = "leafdown://window-close-requested";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::new()
                // Prevent auto showing the window
                .with_state_flags(StateFlags::all() ^ StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            FramePluginBuilder::new()
                .titlebar_height(32)
                .button_width(52)
                .auto_titlebar(true)
                .button_hover_bg("color-mix(in srgb, currentColor 12%, transparent)")
                .build(),
        )
        .plugin(tauri_plugin_zustand::init())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();

                if let Err(error) = window.emit(WINDOW_CLOSE_REQUESTED_EVENT, ()) {
                    eprintln!("failed to emit close-requested event: {error}");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            document::open_markdown_file,
            document::save_markdown_file,
            folder::scan_markdown_folder,
            folder::open_markdown_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
