use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, CloseRequestApi, Emitter, Listener, Manager, Runtime, Window};

const WINDOW_CLOSE_REQUESTED_EVENT: &str = "leafdown://window-close-requested";
const WINDOW_CLOSE_DECLINED_EVENT: &str = "leafdown://window-close-declined";

/// Leafdown runs a single window, so one guard tracks the only close conversation in flight.
#[derive(Debug, Default)]
pub(crate) struct CloseRequestGuard {
    pending: AtomicBool,
}

#[derive(Debug, PartialEq, Eq)]
enum CloseRequestDecision {
    /// Hand the request to the frontend and keep the window open until it answers.
    AskFrontend,
    /// The frontend left the previous request unanswered, so stop asking.
    Close,
}

impl CloseRequestGuard {
    fn register_request(&self) -> CloseRequestDecision {
        if self.pending.swap(true, Ordering::SeqCst) {
            CloseRequestDecision::Close
        } else {
            CloseRequestDecision::AskFrontend
        }
    }

    fn mark_declined(&self) {
        self.pending.store(false, Ordering::SeqCst);
    }
}

pub(crate) fn register_close_decline_listener<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();

    app.listen(WINDOW_CLOSE_DECLINED_EVENT, move |_event| {
        handle.state::<CloseRequestGuard>().mark_declined();
    });
}

pub(crate) fn handle_close_requested<R: Runtime>(window: &Window<R>, api: &CloseRequestApi) {
    if window.state::<CloseRequestGuard>().register_request() == CloseRequestDecision::Close {
        log::warn!("closing without frontend confirmation: a close request went unanswered");
        return;
    }

    api.prevent_close();

    // A failed emit leaves the request pending on purpose: the next one closes the window.
    if let Err(error) = window.emit(WINDOW_CLOSE_REQUESTED_EVENT, ()) {
        log::error!("failed to emit close-requested event: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::{CloseRequestDecision, CloseRequestGuard};

    #[test]
    fn asks_the_frontend_to_handle_a_close_request() {
        let guard = CloseRequestGuard::default();

        assert_eq!(guard.register_request(), CloseRequestDecision::AskFrontend);
    }

    #[test]
    fn closes_when_a_close_request_went_unanswered() {
        let guard = CloseRequestGuard::default();

        guard.register_request();

        assert_eq!(guard.register_request(), CloseRequestDecision::Close);
    }

    #[test]
    fn asks_the_frontend_again_after_a_declined_close_request() {
        let guard = CloseRequestGuard::default();

        for _ in 0..3 {
            assert_eq!(guard.register_request(), CloseRequestDecision::AskFrontend);
            guard.mark_declined();
        }
    }

    #[test]
    fn closes_when_a_request_after_a_declined_one_goes_unanswered() {
        let guard = CloseRequestGuard::default();

        guard.register_request();
        guard.mark_declined();
        guard.register_request();

        assert_eq!(guard.register_request(), CloseRequestDecision::Close);
    }
}
