use std::{
    collections::HashMap,
    ffi::OsString,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard, PoisonError},
};

use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow, Window};

use crate::{
    path_utils::path_to_string,
    window::{self, MAIN_WINDOW_LABEL, WindowFocusOrder, WindowNumbering},
    window_documents::WindowDocuments,
};

const LAUNCH_DOCUMENTS_EVENT: &str = "leafdown://launch-documents";

/// The documents launches asked to open, waiting for each window's frontend to take them: the file
/// this process was launched with, and the files later launches routed into it. The frontend takes
/// its window's documents once, so a webview reload does not reopen them.
#[derive(Debug, Default)]
pub(crate) struct LaunchDocuments {
    windows: Mutex<HashMap<String, PendingLaunch>>,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct PendingLaunch {
    paths: Vec<PathBuf>,
    /// Set for a window that was still hidden when a routed launch reached it; it comes forward
    /// once its frontend has shown it and takes its documents.
    bring_forward: bool,
}

impl LaunchDocuments {
    pub(crate) fn from_process() -> Self {
        let documents = Self::default();
        let path = std::env::current_dir().ok().and_then(|working_directory| {
            launch_document_path(std::env::args_os(), working_directory.as_path())
        });

        documents.queue(MAIN_WINDOW_LABEL, path, false);

        documents
    }

    fn queue(&self, window_label: &str, path: Option<PathBuf>, bring_forward: bool) {
        let mut windows = self.windows();
        let launch = windows.entry(window_label.to_owned()).or_default();

        launch.paths.extend(path);
        launch.bring_forward |= bring_forward;
    }

    fn take(&self, window_label: &str) -> PendingLaunch {
        self.windows().remove(window_label).unwrap_or_default()
    }

    // Each update leaves whole values behind, so a poisoned lock still holds usable launches.
    fn windows(&self) -> MutexGuard<'_, HashMap<String, PendingLaunch>> {
        self.windows.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// The first argument after the program names the document; later arguments are ignored. A
/// relative path resolves against the working directory the launch started in.
fn launch_document_path(
    args: impl IntoIterator<Item = OsString>,
    working_directory: &Path,
) -> Option<PathBuf> {
    let argument = args.into_iter().nth(1)?;

    if argument.is_empty() {
        return None;
    }

    std::path::absolute(working_directory.join(argument)).ok()
}

/// Opens what a second launch asked for in this process, which the launch exits for. A document
/// goes to the window that holds it, or otherwise to the most recently focused window, which
/// comes forward; a launch without one opens a new window.
pub(crate) fn route_launch<R: Runtime>(
    app: &AppHandle<R>,
    args: Vec<String>,
    working_directory: String,
) {
    let path = launch_document_path(
        args.into_iter().map(OsString::from),
        Path::new(working_directory.as_str()),
    );
    let launches = app.state::<LaunchDocuments>();
    let target = path
        .as_deref()
        .and_then(|path| document_target_window(app, path));

    let Some(target) = target else {
        let reference = recent_windows(app).next();
        let label = app.state::<WindowNumbering>().next_label();

        launches.queue(label.as_str(), path, true);

        // Building a window on the thread that delivered the launch deadlocks on Windows.
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let reference = reference.map(|window| window.as_ref().window());

            if let Err(error) = window::create_window(&app, label.clone(), reference.as_ref()) {
                log::error!("failed to open a window for a launch: {error:?}");
                app.state::<LaunchDocuments>().take(label.as_str());
            }
        });

        return;
    };

    // A window still starting up shows itself when ready, so showing it here would show it early.
    let visible = target.is_visible().unwrap_or(false);

    launches.queue(target.label(), path, !visible);

    if visible {
        window::bring_forward(&target);
    }

    if let Err(error) = target.emit_to(target.label(), LAUNCH_DOCUMENTS_EVENT, ()) {
        log::error!(
            "failed to tell window {} about a launch: {error}",
            target.label()
        );
    }
}

fn document_target_window<R: Runtime>(app: &AppHandle<R>, path: &Path) -> Option<WebviewWindow<R>> {
    let holder = app
        .state::<WindowDocuments>()
        .window_holding(path_to_string(path).as_str())
        .and_then(|label| app.get_webview_window(label.as_str()));

    holder.or_else(|| recent_windows(app).next())
}

/// The open windows, most recently focused first, then the first window and the rest, which covers
/// windows not focused yet.
fn recent_windows<R: Runtime>(app: &AppHandle<R>) -> impl Iterator<Item = WebviewWindow<R>> {
    let focused = app.state::<WindowFocusOrder>().most_recent_first();
    let mut open: Vec<String> = app.webview_windows().into_keys().collect();

    open.sort_by_key(|label| (label != MAIN_WINDOW_LABEL, label.clone()));

    let app = app.clone();

    focused
        .into_iter()
        .chain(open)
        .filter_map(move |label| app.get_webview_window(label.as_str()))
}

pub(crate) fn forget_window_launches<R: Runtime>(window: &Window<R>) {
    let launch = window.state::<LaunchDocuments>().take(window.label());

    if !launch.paths.is_empty() {
        log::warn!(
            "window {} closed before opening {} launched document(s)",
            window.label(),
            launch.paths.len()
        );
    }
}

/// Hands the calling window the documents launches asked it to open, bringing it forward when a
/// routed launch reached it before it was shown.
#[tauri::command]
pub(crate) fn take_launch_document_paths(
    window: WebviewWindow,
    state: State<'_, LaunchDocuments>,
) -> Vec<String> {
    let launch = state.take(window.label());

    if launch.bring_forward {
        window::bring_forward(&window);
    }

    launch
        .paths
        .iter()
        .map(|path| path_to_string(path.as_path()))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{
        ffi::OsString,
        path::{Path, PathBuf},
    };

    use super::{LaunchDocuments, PendingLaunch, launch_document_path};

    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    fn working_directory() -> PathBuf {
        std::env::current_dir().expect("the test should have a working directory")
    }

    #[test]
    fn takes_the_first_argument_as_the_document_path() {
        let path = r"C:\Users\Ana Lúcia\Notas de reunião\日本語 notes.md";

        assert_eq!(
            launch_document_path(
                args(&["leafdown.exe", path, "ignored.md"]),
                &working_directory()
            ),
            Some(PathBuf::from(path))
        );
    }

    #[test]
    fn has_no_document_without_a_path_argument() {
        let working_directory = working_directory();

        assert_eq!(
            launch_document_path(args(&["leafdown.exe"]), &working_directory),
            None
        );
        assert_eq!(
            launch_document_path(args(&["leafdown.exe", ""]), &working_directory),
            None
        );
        assert_eq!(launch_document_path(Vec::new(), &working_directory), None);
    }

    #[test]
    fn resolves_a_relative_path_against_the_launch_working_directory() {
        let launch_directory = working_directory().join("Notas de reunião");

        assert_eq!(
            launch_document_path(
                args(&["leafdown.exe", "../Notas de reunião/./today.md"]),
                &launch_directory,
            ),
            Some(launch_directory.join("today.md"))
        );
        assert_ne!(
            launch_document_path(args(&["leafdown.exe", "today.md"]), &launch_directory),
            launch_document_path(args(&["leafdown.exe", "today.md"]), &working_directory()),
            "a forwarded path resolves against the launch's directory, not this process's"
        );
    }

    #[test]
    fn keeps_unsupported_and_missing_paths_for_the_open_workflow_to_report() {
        let path = r"C:\missing\notes.txt";

        assert_eq!(
            launch_document_path(args(&["leafdown.exe", path]), Path::new(r"D:\elsewhere")),
            Some(PathBuf::from(path))
        );
    }

    #[test]
    fn hands_each_window_its_documents_once() {
        let launches = LaunchDocuments::default();

        launches.queue("main", Some(PathBuf::from(r"C:\notes.md")), false);
        launches.queue("window-2", Some(PathBuf::from(r"C:\other.md")), true);

        assert_eq!(
            launches.take("main"),
            PendingLaunch {
                paths: vec![PathBuf::from(r"C:\notes.md")],
                bring_forward: false,
            }
        );
        assert_eq!(launches.take("main"), PendingLaunch::default());
        assert_eq!(
            launches.take("window-2").paths,
            [PathBuf::from(r"C:\other.md")]
        );
    }

    #[test]
    fn keeps_launches_that_reach_a_window_before_it_takes_them_in_order() {
        let launches = LaunchDocuments::default();

        launches.queue("main", None, false);
        launches.queue("main", Some(PathBuf::from(r"C:\first.md")), true);
        launches.queue("main", Some(PathBuf::from(r"C:\second.md")), false);

        assert_eq!(
            launches.take("main"),
            PendingLaunch {
                paths: vec![
                    PathBuf::from(r"C:\first.md"),
                    PathBuf::from(r"C:\second.md")
                ],
                bring_forward: true,
            }
        );
    }

    #[test]
    fn a_launch_without_a_document_still_brings_its_window_forward() {
        let launches = LaunchDocuments::default();

        launches.queue("window-2", None, true);

        assert_eq!(
            launches.take("window-2"),
            PendingLaunch {
                paths: Vec::new(),
                bring_forward: true,
            }
        );
    }
}
