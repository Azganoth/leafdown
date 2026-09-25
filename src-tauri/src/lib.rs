use tauri::WindowEvent;
use tauri_plugin_frame::FramePluginBuilder;
use tauri_plugin_window_state::StateFlags;

#[cfg(test)]
mod command_contract_tests;
mod debug;
mod diagnostics;
mod document;
mod drop;
mod file_utils;
mod folder;
mod image;
mod link;
mod navigation;
mod path_utils;
mod remote_image;
#[cfg(test)]
mod test_utils;
mod window;

const TITLEBAR_HEIGHT: u32 = 32;
const TITLEBAR_BUTTON_WIDTH: u32 = 52;
const TITLEBAR_BUTTON_HOVER_BACKGROUND: &str = "color-mix(in srgb, currentColor 12%, transparent)";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
// Public because src/main.rs is a separate binary crate that enters through the library crate.
pub fn run() {
    let diagnostics_runtime = diagnostics::DiagnosticsRuntime::new();
    let diagnostics_run_id = diagnostics_runtime.run_id().to_owned();

    let builder =
        tauri::Builder::default().plugin(diagnostics::build_log_plugin(diagnostics_run_id));

    #[cfg(feature = "desktop-e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    let context = tauri::generate_context!();

    #[cfg(feature = "desktop-e2e")]
    let context = {
        let mut context = context;

        if let Ok(identifier) = std::env::var("LEAFDOWN_E2E_APP_IDENTIFIER") {
            context.config_mut().identifier = identifier;
        }

        context
    };

    builder
        .plugin(
            tauri_plugin_window_state::Builder::new()
                // Startup shows the window after frontend initialization, including failure.
                .with_state_flags(StateFlags::all() ^ StateFlags::VISIBLE)
                .build(),
        )
        .plugin(navigation::build_navigation_guard_plugin())
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
        .manage(window::CloseRequestGuard::default())
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

            window::register_close_decline_listener(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                window::handle_close_requested(window, api);
            }
        })
        .invoke_handler(tauri::generate_handler![
            document::open_markdown_file,
            document::save_markdown_file,
            drop::inspect_dropped_path,
            debug::open_webview_devtools,
            diagnostics::get_diagnostics_summary,
            image::resolve_markdown_image_target,
            remote_image::fetch_remote_image,
            link::resolve_markdown_link_target,
            link::open_markdown_link_target,
            folder::scan_markdown_folder,
            folder::open_markdown_folder,
            folder::watch_markdown_folder,
            folder::unwatch_markdown_folder,
            folder::create_markdown_article,
            folder::create_article_directory,
            folder::rename_folder_entry,
            folder::trash_folder_entry
        ])
        .run(context)
        .unwrap_or_else(|error| {
            log::error!("error while running tauri application: {error}");
            panic!("error while running tauri application: {error}");
        });
}
