use std::{
    collections::{HashSet, VecDeque},
    sync::{
        Mutex, MutexGuard, PoisonError,
        atomic::{AtomicU32, Ordering},
    },
};

use serde::Serialize;
use tauri::{
    AppHandle, CloseRequestApi, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, State,
    WebviewWindowBuilder, Window,
};

use crate::window_documents::WindowDocuments;

const WINDOW_CLOSE_REQUESTED_EVENT: &str = "leafdown://window-close-requested";

/// The window the application starts with, the only one whose size and position are kept.
pub(crate) const MAIN_WINDOW_LABEL: &str = "main";

/// How far a new window sits right of and below the window it was opened from, in logical pixels.
const NEW_WINDOW_OFFSET: f64 = 32.0;

/// Tracks, for each window, whether a close request is waiting for its frontend's answer.
#[derive(Debug, Default)]
pub(crate) struct CloseRequestGuard {
    pending_windows: Mutex<HashSet<String>>,
}

#[derive(Debug, PartialEq, Eq)]
enum CloseRequestDecision {
    AskFrontend,
    Close,
}

impl CloseRequestGuard {
    fn register_request(&self, window_label: &str) -> CloseRequestDecision {
        if self.pending_windows().insert(window_label.to_owned()) {
            CloseRequestDecision::AskFrontend
        } else {
            CloseRequestDecision::Close
        }
    }

    fn mark_answered(&self, window_label: &str) {
        self.pending_windows().remove(window_label);
    }

    fn is_pending(&self, window_label: &str) -> bool {
        self.pending_windows().contains(window_label)
    }

    // A set of labels cannot be left half-updated, so a poisoned lock still holds a usable set.
    fn pending_windows(&self) -> MutexGuard<'_, HashSet<String>> {
        self.pending_windows
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }
}

/// Closes the windows one at a time while quitting, each through its own close request, and stops
/// at the first window whose close is declined. Windows not yet reached stay open.
#[derive(Debug, Default)]
pub(crate) struct QuitSequence {
    progress: Mutex<Option<QuitProgress>>,
}

#[derive(Debug)]
struct QuitProgress {
    current: String,
    remaining: VecDeque<String>,
}

impl QuitSequence {
    /// Returns the first window to close, or nothing while an earlier quit is still under way.
    fn start(&self, window_labels: Vec<String>) -> Option<String> {
        let mut progress = self.progress();

        if progress.is_some() {
            return None;
        }

        let mut remaining = VecDeque::from(window_labels);
        let current = remaining.pop_front()?;

        *progress = Some(QuitProgress {
            current: current.clone(),
            remaining,
        });

        Some(current)
    }

    /// Returns the next window to close once the window being closed is gone. A window closed out
    /// of turn is only dropped from those still to come.
    fn window_closed(&self, window_label: &str) -> Option<String> {
        let mut progress = self.progress();
        let quit = progress.as_mut()?;

        if quit.current != window_label {
            quit.remaining.retain(|label| label != window_label);
            return None;
        }

        match quit.remaining.pop_front() {
            Some(next) => {
                quit.current = next.clone();
                Some(next)
            }
            None => {
                *progress = None;
                None
            }
        }
    }

    fn close_declined(&self, window_label: &str) {
        let mut progress = self.progress();

        if progress
            .as_ref()
            .is_some_and(|quit| quit.current == window_label)
        {
            *progress = None;
        }
    }

    fn stop(&self) {
        *self.progress() = None;
    }

    // Each update leaves whole values behind, so a poisoned lock still holds a usable sequence.
    fn progress(&self) -> MutexGuard<'_, Option<QuitProgress>> {
        self.progress.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Numbers the windows opened after the first, so each has its own label.
#[derive(Debug)]
pub(crate) struct WindowNumbering {
    next: AtomicU32,
}

impl Default for WindowNumbering {
    fn default() -> Self {
        Self {
            next: AtomicU32::new(2),
        }
    }
}

impl WindowNumbering {
    fn next_label(&self) -> String {
        format!("window-{}", self.next.fetch_add(1, Ordering::Relaxed))
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum OpenWindowError {
    OpenFailed { message: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Bounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl Bounds {
    fn right(self) -> i64 {
        i64::from(self.x) + i64::from(self.width)
    }

    fn bottom(self) -> i64 {
        i64::from(self.y) + i64::from(self.height)
    }
}

/// Places a new window down and to the right of the window it was opened from, or at the top left
/// of that window's work area when the offset window would not fit there.
fn cascade_position(reference: Bounds, offset: i32, work_area: Option<Bounds>) -> (i32, i32) {
    let placed = Bounds {
        x: reference.x.saturating_add(offset),
        y: reference.y.saturating_add(offset),
        ..reference
    };

    match work_area {
        Some(area) if placed.right() > area.right() || placed.bottom() > area.bottom() => {
            (area.x, area.y)
        }
        _ => (placed.x, placed.y),
    }
}

#[tauri::command]
pub(crate) fn decline_window_close(
    window: Window,
    guard: State<'_, CloseRequestGuard>,
    quit: State<'_, QuitSequence>,
) {
    guard.mark_answered(window.label());
    quit.close_declined(window.label());
}

pub(crate) fn handle_close_requested<R: Runtime>(window: &Window<R>, api: &CloseRequestApi) {
    if window
        .state::<CloseRequestGuard>()
        .register_request(window.label())
        == CloseRequestDecision::Close
    {
        log::warn!("closing without frontend confirmation: a close request went unanswered");
        return;
    }

    api.prevent_close();

    // A failed emit leaves the request pending on purpose: the next one closes the window.
    if let Err(error) = window.emit_to(window.label(), WINDOW_CLOSE_REQUESTED_EVENT, ()) {
        log::error!("failed to emit close-requested event: {error}");
    }
}

pub(crate) fn forget_close_request<R: Runtime>(window: &Window<R>) {
    window
        .state::<CloseRequestGuard>()
        .mark_answered(window.label());
}

/// Quits by closing every window in turn, starting with the one that asked, as `Close window` would
/// close each. Closing the last window ends the application.
#[tauri::command]
pub(crate) fn quit_application(
    app: AppHandle,
    window: Window,
    documents: State<'_, WindowDocuments>,
    quit: State<'_, QuitSequence>,
) {
    let mut labels = vec![window.label().to_owned()];

    for label in documents
        .window_labels()
        .into_iter()
        .chain(app.webview_windows().into_keys())
    {
        if !labels.contains(&label) {
            labels.push(label);
        }
    }

    close_next_window(&app, quit.start(labels));
}

pub(crate) fn continue_quit<R: Runtime>(window: &Window<R>) {
    let next = window.state::<QuitSequence>().window_closed(window.label());

    close_next_window(window.app_handle(), next);
}

fn close_next_window<R: Runtime>(app: &AppHandle<R>, mut next: Option<String>) {
    let quit = app.state::<QuitSequence>();

    while let Some(label) = next {
        let Some(window) = app.get_webview_window(label.as_str()) else {
            next = quit.window_closed(label.as_str());
            continue;
        };

        // Asking again would close a window whose frontend is still answering; its answer moves
        // the quit on instead.
        if app.state::<CloseRequestGuard>().is_pending(label.as_str()) {
            return;
        }

        if let Err(error) = window.close() {
            log::error!("stopped quitting: failed to close window {label}: {error}");
            quit.stop();
        }

        return;
    }
}

/// Opens another window on the welcome screen, offset from the window that asked for it. Only the
/// first window's size and position are kept between launches.
#[tauri::command]
pub(crate) async fn open_new_window(
    app: AppHandle,
    window: Window,
    numbering: State<'_, WindowNumbering>,
) -> Result<(), OpenWindowError> {
    let open_failed = |message: String| OpenWindowError::OpenFailed { message };
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == MAIN_WINDOW_LABEL)
        .cloned()
        .ok_or_else(|| open_failed("the main window has no configuration".to_owned()))?;

    config.label = numbering.next_label();

    let created = WebviewWindowBuilder::from_config(&app, &config)
        .and_then(|builder| builder.build())
        .map_err(|error| open_failed(error.to_string()))?;

    // The window stays hidden until its frontend shows it, so placing it after creation is unseen.
    let placed = match cascade_bounds(&window) {
        Some((size, position)) => created
            .set_size(size)
            .and_then(|()| created.set_position(position)),
        None => created.center(),
    };

    if let Err(error) = placed {
        log::warn!("failed to place window {}: {error}", created.label());
    }

    Ok(())
}

fn cascade_bounds<R: Runtime>(
    reference: &Window<R>,
) -> Option<(PhysicalSize<u32>, PhysicalPosition<i32>)> {
    if reference.is_maximized().ok()?
        || reference.is_fullscreen().ok()?
        || reference.is_minimized().ok()?
    {
        return None;
    }

    let position = reference.outer_position().ok()?;
    let size = reference.inner_size().ok()?;
    let scale_factor = reference.scale_factor().ok()?;
    let work_area = reference.current_monitor().ok().flatten().map(|monitor| {
        let area = monitor.work_area();

        Bounds {
            x: area.position.x,
            y: area.position.y,
            width: area.size.width,
            height: area.size.height,
        }
    });
    let offset = (NEW_WINDOW_OFFSET * scale_factor).round() as i32;
    let (x, y) = cascade_position(
        Bounds {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        },
        offset,
        work_area,
    );

    Some((size, PhysicalPosition::new(x, y)))
}

#[cfg(test)]
mod tests {
    use super::{
        Bounds, CloseRequestDecision, CloseRequestGuard, QuitSequence, WindowNumbering,
        cascade_position,
    };

    fn labels(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn asks_the_frontend_to_handle_a_close_request() {
        let guard = CloseRequestGuard::default();

        assert_eq!(
            guard.register_request("main"),
            CloseRequestDecision::AskFrontend
        );
    }

    #[test]
    fn closes_when_a_close_request_went_unanswered() {
        let guard = CloseRequestGuard::default();

        guard.register_request("main");

        assert_eq!(guard.register_request("main"), CloseRequestDecision::Close);
    }

    #[test]
    fn asks_the_frontend_again_after_a_declined_close_request() {
        let guard = CloseRequestGuard::default();

        for _ in 0..3 {
            assert_eq!(
                guard.register_request("main"),
                CloseRequestDecision::AskFrontend
            );
            guard.mark_answered("main");
        }
    }

    #[test]
    fn closes_when_a_request_after_a_declined_one_goes_unanswered() {
        let guard = CloseRequestGuard::default();

        guard.register_request("main");
        guard.mark_answered("main");
        guard.register_request("main");

        assert_eq!(guard.register_request("main"), CloseRequestDecision::Close);
    }

    #[test]
    fn closes_only_the_window_whose_request_went_unanswered() {
        let guard = CloseRequestGuard::default();

        guard.register_request("first");

        assert_eq!(
            guard.register_request("second"),
            CloseRequestDecision::AskFrontend
        );
        assert_eq!(guard.register_request("first"), CloseRequestDecision::Close);
        assert_eq!(
            guard.register_request("second"),
            CloseRequestDecision::Close
        );
    }

    #[test]
    fn a_declined_request_leaves_other_windows_pending() {
        let guard = CloseRequestGuard::default();

        guard.register_request("first");
        guard.register_request("second");
        guard.mark_answered("first");

        assert_eq!(
            guard.register_request("first"),
            CloseRequestDecision::AskFrontend
        );
        assert_eq!(
            guard.register_request("second"),
            CloseRequestDecision::Close
        );
        assert!(guard.is_pending("second"));
        assert!(!guard.is_pending("third"));
    }

    #[test]
    fn quits_by_closing_each_window_in_turn() {
        let quit = QuitSequence::default();

        assert_eq!(
            quit.start(labels(&["window-2", "main", "window-3"])),
            Some("window-2".to_owned())
        );
        assert_eq!(quit.window_closed("window-2"), Some("main".to_owned()));
        assert_eq!(quit.window_closed("main"), Some("window-3".to_owned()));
        assert_eq!(quit.window_closed("window-3"), None);
        assert_eq!(
            quit.start(labels(&["main"])),
            Some("main".to_owned()),
            "a finished quit leaves the next one free to start"
        );
    }

    #[test]
    fn a_quit_declined_in_its_second_window_leaves_that_window_and_the_rest_open() {
        let quit = QuitSequence::default();

        quit.start(labels(&["main", "window-2", "window-3"]));
        assert_eq!(quit.window_closed("main"), Some("window-2".to_owned()));

        quit.close_declined("window-2");

        assert_eq!(
            quit.window_closed("window-2"),
            None,
            "a declined quit closes nothing further"
        );
        assert_eq!(quit.window_closed("window-3"), None);
        assert_eq!(
            quit.start(labels(&["window-2", "window-3"])),
            Some("window-2".to_owned())
        );
    }

    #[test]
    fn a_decline_from_a_window_not_being_closed_leaves_the_quit_going() {
        let quit = QuitSequence::default();

        quit.start(labels(&["main", "window-2"]));
        quit.close_declined("window-2");

        assert_eq!(quit.window_closed("main"), Some("window-2".to_owned()));
    }

    #[test]
    fn a_window_closed_out_of_turn_is_not_asked_again() {
        let quit = QuitSequence::default();

        quit.start(labels(&["main", "window-2", "window-3"]));

        assert_eq!(quit.window_closed("window-2"), None);
        assert_eq!(quit.window_closed("main"), Some("window-3".to_owned()));
    }

    #[test]
    fn a_second_quit_while_one_is_under_way_changes_nothing() {
        let quit = QuitSequence::default();

        quit.start(labels(&["main", "window-2"]));

        assert_eq!(quit.start(labels(&["window-2", "main"])), None);
        assert_eq!(quit.window_closed("main"), Some("window-2".to_owned()));
    }

    #[test]
    fn a_stopped_quit_closes_nothing_further() {
        let quit = QuitSequence::default();

        quit.start(labels(&["main", "window-2"]));
        quit.stop();

        assert_eq!(quit.window_closed("main"), None);
    }

    #[test]
    fn labels_each_new_window_once() {
        let numbering = WindowNumbering::default();

        assert_eq!(numbering.next_label(), "window-2");
        assert_eq!(numbering.next_label(), "window-3");
    }

    #[test]
    fn cascades_a_new_window_from_the_window_it_was_opened_from() {
        let reference = Bounds {
            x: 100,
            y: 80,
            width: 800,
            height: 600,
        };
        let work_area = Bounds {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        };

        assert_eq!(cascade_position(reference, 48, Some(work_area)), (148, 128));
        assert_eq!(cascade_position(reference, 48, None), (148, 128));
    }

    #[test]
    fn starts_over_at_the_work_area_corner_when_the_offset_window_would_not_fit() {
        let work_area = Bounds {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1040,
        };
        let near_right = Bounds {
            x: -820,
            y: 100,
            width: 800,
            height: 600,
        };
        let near_bottom = Bounds {
            x: -1800,
            y: 420,
            width: 800,
            height: 600,
        };

        assert_eq!(
            cascade_position(near_right, 32, Some(work_area)),
            (-1920, 0)
        );
        assert_eq!(
            cascade_position(near_bottom, 32, Some(work_area)),
            (-1920, 0)
        );
    }
}
