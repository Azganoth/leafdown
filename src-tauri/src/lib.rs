use tauri_plugin_frame::FramePluginBuilder;
use tauri_plugin_window_state::StateFlags;

mod document;

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
        .invoke_handler(tauri::generate_handler![document::open_markdown_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
