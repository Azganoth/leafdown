use std::sync::Mutex;

use notify::RecommendedWatcher;

/// Holds at most one native watcher for a frontend-owned scope. The frontend numbers its scopes,
/// so a start or stop that arrives after a newer scope began is ignored rather than replacing it.
#[derive(Default)]
pub(crate) struct WatcherScopeManager {
    active_watcher: Option<ScopedWatcher>,
    scope_tracker: WatcherScopeTracker,
}

pub(crate) struct ScopedWatcher {
    scope_generation: u64,
    scope_id: String,
    _watcher: RecommendedWatcher,
}

#[derive(Default)]
struct WatcherScopeTracker {
    cancelled_scope: Option<CancelledWatcherScope>,
    latest_generation: u64,
}

struct CancelledWatcherScope {
    scope_generation: u64,
    scope_id: String,
}

impl ScopedWatcher {
    pub(crate) fn new(
        scope_id: String,
        scope_generation: u64,
        watcher: RecommendedWatcher,
    ) -> Self {
        Self {
            scope_generation,
            scope_id,
            _watcher: watcher,
        }
    }
}

pub(crate) fn with_watcher_scope_manager<T>(
    manager: &Mutex<WatcherScopeManager>,
    operation: impl FnOnce(&mut WatcherScopeManager) -> T,
) -> Result<T, String> {
    let mut manager = manager.lock().map_err(|error| error.to_string())?;

    Ok(operation(&mut manager))
}

impl WatcherScopeManager {
    pub(crate) fn begin_start(&mut self, scope_id: &str, scope_generation: u64) -> bool {
        if !self.scope_tracker.begin_scope(scope_id, scope_generation) {
            return false;
        }

        self.stop_active_watcher();

        true
    }

    pub(crate) fn finish_start(&mut self, watcher: ScopedWatcher) {
        if self
            .scope_tracker
            .can_install_scope(watcher.scope_id.as_str(), watcher.scope_generation)
        {
            self.active_watcher = Some(watcher);
        }
    }

    pub(crate) fn stop_scope(&mut self, scope_id: &str, scope_generation: u64) {
        self.scope_tracker.cancel_scope(scope_id, scope_generation);

        if self.active_watcher.as_ref().is_some_and(|watcher| {
            watcher.scope_id == scope_id && watcher.scope_generation == scope_generation
        }) {
            self.stop_active_watcher();
        }
    }

    fn stop_active_watcher(&mut self) {
        self.active_watcher = None;
    }

    #[cfg(test)]
    fn active_scope(&self) -> Option<(&str, u64)> {
        self.active_watcher
            .as_ref()
            .map(|watcher| (watcher.scope_id.as_str(), watcher.scope_generation))
    }
}

impl Drop for WatcherScopeManager {
    fn drop(&mut self) {
        self.stop_active_watcher();
    }
}

impl WatcherScopeTracker {
    fn begin_scope(&mut self, _scope_id: &str, scope_generation: u64) -> bool {
        if scope_generation < self.latest_generation {
            return false;
        }

        if scope_generation > self.latest_generation {
            self.cancelled_scope = None;
        }

        self.latest_generation = scope_generation;

        true
    }

    fn cancel_scope(&mut self, scope_id: &str, scope_generation: u64) {
        if scope_generation < self.latest_generation {
            return;
        }

        self.latest_generation = scope_generation;
        self.cancelled_scope = Some(CancelledWatcherScope {
            scope_generation,
            scope_id: scope_id.to_owned(),
        });
    }

    fn can_install_scope(&self, scope_id: &str, scope_generation: u64) -> bool {
        scope_generation == self.latest_generation
            && !self.cancelled_scope.as_ref().is_some_and(|cancelled| {
                cancelled.scope_generation == scope_generation && cancelled.scope_id == scope_id
            })
    }
}

#[cfg(test)]
mod tests {
    use super::{ScopedWatcher, WatcherScopeManager, WatcherScopeTracker};

    #[test]
    fn allows_current_watcher_scopes_to_install() {
        let mut tracker = WatcherScopeTracker::default();

        assert!(tracker.begin_scope("scope:1", 1));

        assert!(tracker.can_install_scope("scope:1", 1));
    }

    #[test]
    fn rejects_stale_watcher_scopes_after_newer_scope_begins() {
        let mut tracker = WatcherScopeTracker::default();

        assert!(tracker.begin_scope("scope:1", 1));
        assert!(tracker.begin_scope("scope:2", 2));

        assert!(!tracker.can_install_scope("scope:1", 1));
        assert!(!tracker.begin_scope("scope:1", 1));
        assert!(tracker.can_install_scope("scope:2", 2));
    }

    #[test]
    fn rejects_cancelled_watcher_scopes_even_when_watch_finishes_later() {
        let mut tracker = WatcherScopeTracker::default();

        tracker.cancel_scope("scope:1", 1);

        assert!(tracker.begin_scope("scope:1", 1));
        assert!(!tracker.can_install_scope("scope:1", 1));
    }

    #[test]
    fn ignores_stale_cleanup_for_newer_watcher_scopes() {
        let mut tracker = WatcherScopeTracker::default();

        assert!(tracker.begin_scope("scope:1", 1));
        assert!(tracker.begin_scope("scope:2", 2));
        tracker.cancel_scope("scope:1", 1);

        assert!(tracker.can_install_scope("scope:2", 2));
    }

    #[test]
    fn manager_stops_active_watcher_when_new_scope_begins() {
        let mut manager = WatcherScopeManager::default();

        assert!(manager.begin_start("scope:1", 1));
        manager.finish_start(test_watcher("scope:1", 1));
        assert_eq!(manager.active_scope(), Some(("scope:1", 1)));

        assert!(manager.begin_start("scope:2", 2));

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn manager_rejects_stale_watchers_that_finish_late() {
        let mut manager = WatcherScopeManager::default();

        assert!(manager.begin_start("scope:1", 1));
        assert!(manager.begin_start("scope:2", 2));
        manager.finish_start(test_watcher("scope:1", 1));

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn manager_rejects_watchers_for_scopes_cancelled_before_install() {
        let mut manager = WatcherScopeManager::default();

        assert!(manager.begin_start("scope:1", 1));
        manager.stop_scope("scope:1", 1);
        manager.finish_start(test_watcher("scope:1", 1));

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn manager_stops_matching_active_watcher_on_cancel() {
        let mut manager = WatcherScopeManager::default();

        assert!(manager.begin_start("scope:1", 1));
        manager.finish_start(test_watcher("scope:1", 1));

        manager.stop_scope("scope:1", 1);

        assert_eq!(manager.active_scope(), None);
    }

    fn test_watcher(scope_id: &str, scope_generation: u64) -> ScopedWatcher {
        ScopedWatcher::new(
            scope_id.to_owned(),
            scope_generation,
            notify::recommended_watcher(|_| {}).unwrap(),
        )
    }
}
