use std::{
    collections::HashSet,
    sync::{Mutex, MutexGuard, PoisonError},
};

use tauri::{CloseRequestApi, Emitter, Manager, Runtime, State, Window};

const WINDOW_CLOSE_REQUESTED_EVENT: &str = "leafdown://window-close-requested";

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

    // A set of labels cannot be left half-updated, so a poisoned lock still holds a usable set.
    fn pending_windows(&self) -> MutexGuard<'_, HashSet<String>> {
        self.pending_windows
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }
}

#[tauri::command]
pub(crate) fn decline_window_close(window: Window, guard: State<'_, CloseRequestGuard>) {
    guard.mark_answered(window.label());
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

#[cfg(test)]
mod tests {
    use super::{CloseRequestDecision, CloseRequestGuard};

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
    }
}
