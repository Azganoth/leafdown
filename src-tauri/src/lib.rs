use tauri::WindowEvent;
use tauri_plugin_frame::FramePluginBuilder;
use tauri_plugin_window_state::StateFlags;

#[cfg(test)]
mod command_contract_tests;
mod debug;
#[cfg(feature = "desktop-e2e")]
mod desktop_e2e;
mod diagnostics;
mod document;
mod drop;
mod export;
mod file_utils;
mod folder;
mod image;
#[cfg(test)]
mod installer_tests;
mod kept_session;
mod launch;
mod link;
mod navigation;
mod path_utils;
mod remote_image;
#[cfg(test)]
mod test_http_server;
#[cfg(test)]
mod test_utils;
mod text_encoding;
mod update_check;
mod watch_scope;
mod window;
mod window_documents;

const TITLEBAR_HEIGHT: u32 = 32;
const TITLEBAR_BUTTON_WIDTH: u32 = 52;
const TITLEBAR_BUTTON_HOVER_BACKGROUND: &str = "color-mix(in srgb, currentColor 12%, transparent)";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
// Public because src/main.rs is a separate binary crate that enters through the library crate.
pub fn run() {
    let diagnostics_runtime = diagnostics::DiagnosticsRuntime::new();
    let diagnostics_run_id = diagnostics_runtime.run_id().to_owned();

    let builder = tauri::Builder::default();

    // A second launch hands its arguments to the running process and exits during this plugin's
    // setup, before any later plugin starts. Development runs stay separate from an installed
    // Leafdown, which shares their identifier.
    let builder = if tauri::is_dev() {
        builder
    } else {
        builder.plugin(tauri_plugin_single_instance::init(launch::route_launch))
    };

    let builder = builder.plugin(diagnostics::build_log_plugin(diagnostics_run_id));

    #[cfg(not(feature = "desktop-e2e"))]
    let builder = builder.plugin(tauri_plugin_opener::init());

    #[cfg(feature = "desktop-e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init())
        .plugin(desktop_e2e::build_opener_plugin());

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
                .with_filter(|label| label == window::MAIN_WINDOW_LABEL)
                .build(),
        )
        .plugin(navigation::build_navigation_guard_plugin())
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
        .manage(document::DocumentWatcherState::default())
        .manage(folder::FolderWatcherState::default())
        .manage(kept_session::KeptSession::default())
        .manage(launch::LaunchDocuments::from_process())
        .manage(window::CloseRequestGuard::default())
        .manage(window::QuitSequence::default())
        .manage(window::WindowFocusOrder::default())
        .manage(window::WindowNumbering::default())
        .manage(window_documents::WindowDocuments::default())
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

            kept_session::load_kept_session(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => window::handle_close_requested(window, api),
            WindowEvent::Focused(true) => window::record_window_focus(window),
            WindowEvent::Destroyed => {
                // Decided before the quit moves on, while it still counts as under way.
                let keeps_session = kept_session::keeps_session(window);

                kept_session::forget_window_session(window, keeps_session);
                window::forget_close_request(window);
                window::forget_window_focus(window);
                launch::forget_window_launches(window);
                document::stop_window_document_watchers(window);
                folder::stop_window_folder_watcher(window);
                window_documents::forget_window_documents(window);
                window::continue_quit(window);
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            document::open_markdown_file,
            document::save_markdown_file,
            document::inspect_markdown_file,
            document::watch_markdown_document,
            document::unwatch_markdown_document,
            drop::inspect_dropped_path,
            export::read_markdown_image,
            export::write_html_export,
            debug::open_webview_devtools,
            diagnostics::get_diagnostics_summary,
            image::resolve_markdown_image_target,
            kept_session::clear_kept_session,
            kept_session::report_window_session,
            kept_session::restore_window_session,
            launch::take_launch_document_paths,
            remote_image::fetch_remote_image,
            update_check::check_for_updates,
            link::resolve_markdown_link_target,
            link::resolve_wiki_link_target,
            link::open_markdown_link_target,
            folder::scan_markdown_folder,
            folder::open_markdown_folder,
            folder::read_folder_search_files,
            folder::preflight_folder_replacement,
            folder::write_folder_replacement_files,
            folder::watch_markdown_folder,
            folder::unwatch_markdown_folder,
            folder::create_markdown_article,
            folder::create_article_directory,
            folder::rename_folder_entry,
            folder::trash_folder_entry,
            window::decline_window_close,
            window::open_new_window,
            window::quit_application,
            window_documents::set_window_documents,
            window_documents::claim_window_document,
            window_documents::notify_documents_moved,
            window_documents::notify_documents_removed
        ])
        .run(context)
        .unwrap_or_else(|error| {
            log::error!("error while running tauri application: {error}");
            panic!("error while running tauri application: {error}");
        });
}
