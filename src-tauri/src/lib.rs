use tauri::{Emitter, WindowEvent};
use tauri_plugin_frame::FramePluginBuilder;
use tauri_plugin_window_state::StateFlags;

#[cfg(test)]
mod command_contract_tests;
mod debug;
mod diagnostics;
mod document;
mod file_utils;
mod folder;
mod image;
mod link;
mod path_utils;
#[cfg(test)]
mod test_utils;

const WINDOW_CLOSE_REQUESTED_EVENT: &str = "leafdown://window-close-requested";
const TITLEBAR_HEIGHT: u32 = 32;
const TITLEBAR_BUTTON_WIDTH: u32 = 52;
const TITLEBAR_BUTTON_HOVER_BACKGROUND: &str = "color-mix(in srgb, currentColor 12%, transparent)";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
// Public because src/main.rs is a separate binary crate that enters through the library crate.
pub fn run() {
    let diagnostics_runtime = diagnostics::DiagnosticsRuntime::new();
    let diagnostics_run_id = diagnostics_runtime.run_id().to_owned();

    tauri::Builder::default()
        .plugin(diagnostics::build_log_plugin(diagnostics_run_id))
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
                .titlebar_height(TITLEBAR_HEIGHT)
                .button_width(TITLEBAR_BUTTON_WIDTH)
                .auto_titlebar(true)
                .button_hover_bg(TITLEBAR_BUTTON_HOVER_BACKGROUND)
                .build(),
        )
        .plugin(tauri_plugin_zustand::init())
        .manage(diagnostics_runtime)
        .manage(folder::FolderWatcherState::default())
        .setup(|app| {
            let package_info = app.package_info();
            let app_version = package_info.version.to_string();

            log::info!(
                "{}",
                diagnostics::format_app_started_diagnostic(
                    package_info.name.as_str(),
                    app_version.as_str(),
                    app.config().identifier.as_str(),
                )
            );

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();

                if let Err(error) = window.emit(WINDOW_CLOSE_REQUESTED_EVENT, ()) {
                    log::error!("failed to emit close-requested event: {error}");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            document::open_markdown_file,
            document::save_markdown_file,
            debug::open_webview_devtools,
            diagnostics::get_diagnostics_summary,
            diagnostics::get_diagnostics_runtime,
            image::resolve_markdown_image_target,
            link::resolve_markdown_link_target,
            folder::scan_markdown_folder,
            folder::open_markdown_folder,
            folder::watch_markdown_folder,
            folder::unwatch_markdown_folder
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            log::error!("error while running tauri application: {error}");
            panic!("error while running tauri application: {error}");
        });
}
