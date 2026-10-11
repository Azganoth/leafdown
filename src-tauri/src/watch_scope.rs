use std::{
    collections::{HashMap, hash_map::Entry},
    sync::Mutex,
};

use notify::RecommendedWatcher;

/// Native watchers grouped by the window that started them, so one window's watches never stop or
/// replace another's. Each window numbers its own scopes.
pub(crate) struct WindowWatchers<S> {
    windows: Mutex<HashMap<String, S>>,
}

/// Holds at most one native watcher for a window. The frontend numbers its scopes, so a start or
/// stop that arrives after a newer scope began is ignored rather than replacing it.
#[derive(Default)]
pub(crate) struct WatcherScopeManager {
    active_watcher: Option<ScopedWatcher>,
    scope_tracker: WatcherScopeTracker,
}

/// Holds any number of native watchers for a window, each started and stopped on its own. A stop
/// can arrive before its start, so each scope is kept until both have arrived; the frontend
/// therefore stops only the scopes it asked to start.
#[derive(Default)]
pub(crate) struct WatcherScopeSet {
    scopes: HashMap<String, WatchScope>,
}

enum WatchScope {
    /// Holds no watcher while it is being created, or after creating it failed.
    Started(Option<RecommendedWatcher>),
    StoppedBeforeStart,
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

impl<S> Default for WindowWatchers<S> {
    fn default() -> Self {
        Self {
            windows: Mutex::default(),
        }
    }
}

impl<S: Default> WindowWatchers<S> {
    pub(crate) fn with_window<T>(
        &self,
        window_label: &str,
        operation: impl FnOnce(&mut S) -> T,
    ) -> Result<T, String> {
        let mut windows = self.windows.lock().map_err(|error| error.to_string())?;

        Ok(operation(
            windows.entry(window_label.to_owned()).or_default(),
        ))
    }

    pub(crate) fn stop_window(&self, window_label: &str) -> Result<(), String> {
        let stopped_window = self
            .windows
            .lock()
            .map_err(|error| error.to_string())?
            .remove(window_label);

        drop(stopped_window);

        Ok(())
    }
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

impl WatcherScopeSet {
    pub(crate) fn begin_start(&mut self, scope_id: &str) -> bool {
        match self.scopes.entry(scope_id.to_owned()) {
            Entry::Vacant(entry) => {
                entry.insert(WatchScope::Started(None));
                true
            }
            Entry::Occupied(entry) => {
                if matches!(entry.get(), WatchScope::StoppedBeforeStart) {
                    entry.remove();
                }

                false
            }
        }
    }

    pub(crate) fn finish_start(&mut self, scope_id: &str, watcher: RecommendedWatcher) {
        if let Some(WatchScope::Started(slot @ None)) = self.scopes.get_mut(scope_id) {
            *slot = Some(watcher);
        }
    }

    pub(crate) fn stop_scope(&mut self, scope_id: &str) {
        match self.scopes.entry(scope_id.to_owned()) {
            Entry::Vacant(entry) => {
                entry.insert(WatchScope::StoppedBeforeStart);
            }
            Entry::Occupied(entry) => {
                if matches!(entry.get(), WatchScope::Started(_)) {
                    entry.remove();
                }
            }
        }
    }

    #[cfg(test)]
    fn watching_scopes(&self) -> Vec<&str> {
        let mut scope_ids: Vec<&str> = self
            .scopes
            .iter()
            .filter(|(_, scope)| matches!(scope, WatchScope::Started(Some(_))))
            .map(|(scope_id, _)| scope_id.as_str())
            .collect();

        scope_ids.sort_unstable();
        scope_ids
    }

    #[cfg(test)]
    fn is_empty(&self) -> bool {
        self.scopes.is_empty()
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
    use notify::RecommendedWatcher;

    use super::{
        ScopedWatcher, WatcherScopeManager, WatcherScopeSet, WatcherScopeTracker, WindowWatchers,
    };

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
        manager.finish_start(test_scoped_watcher("scope:1", 1));
        assert_eq!(manager.active_scope(), Some(("scope:1", 1)));

        assert!(manager.begin_start("scope:2", 2));

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn manager_rejects_stale_watchers_that_finish_late() {
        let mut manager = WatcherScopeManager::default();

        assert!(manager.begin_start("scope:1", 1));
        assert!(manager.begin_start("scope:2", 2));
        manager.finish_start(test_scoped_watcher("scope:1", 1));

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn manager_rejects_watchers_for_scopes_cancelled_before_install() {
        let mut manager = WatcherScopeManager::default();

        assert!(manager.begin_start("scope:1", 1));
        manager.stop_scope("scope:1", 1);
        manager.finish_start(test_scoped_watcher("scope:1", 1));

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn manager_stops_matching_active_watcher_on_cancel() {
        let mut manager = WatcherScopeManager::default();

        assert!(manager.begin_start("scope:1", 1));
        manager.finish_start(test_scoped_watcher("scope:1", 1));

        manager.stop_scope("scope:1", 1);

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn set_keeps_several_watches_and_stops_each_on_its_own() {
        let mut scopes = WatcherScopeSet::default();

        for scope_id in ["scope:1", "scope:2", "scope:3"] {
            assert!(scopes.begin_start(scope_id));
            scopes.finish_start(scope_id, test_watcher());
        }

        assert_eq!(
            scopes.watching_scopes(),
            vec!["scope:1", "scope:2", "scope:3"]
        );

        scopes.stop_scope("scope:2");

        assert_eq!(scopes.watching_scopes(), vec!["scope:1", "scope:3"]);
    }

    #[test]
    fn set_refuses_a_start_whose_stop_arrived_first() {
        let mut scopes = WatcherScopeSet::default();

        scopes.stop_scope("scope:1");

        assert!(!scopes.begin_start("scope:1"));
        assert!(scopes.is_empty());
    }

    #[test]
    fn set_drops_a_watcher_whose_scope_stopped_while_it_was_created() {
        let mut scopes = WatcherScopeSet::default();

        assert!(scopes.begin_start("scope:1"));
        scopes.stop_scope("scope:1");
        scopes.finish_start("scope:1", test_watcher());

        assert!(scopes.is_empty());
    }

    #[test]
    fn set_forgets_a_failed_start_once_its_stop_arrives() {
        let mut scopes = WatcherScopeSet::default();

        assert!(scopes.begin_start("scope:1"));
        scopes.stop_scope("scope:1");

        assert!(scopes.is_empty());
    }

    #[test]
    fn set_ignores_a_repeated_start_for_a_running_scope() {
        let mut scopes = WatcherScopeSet::default();

        assert!(scopes.begin_start("scope:1"));
        scopes.finish_start("scope:1", test_watcher());

        assert!(!scopes.begin_start("scope:1"));
        assert_eq!(scopes.watching_scopes(), vec!["scope:1"]);
    }

    #[test]
    fn windows_number_their_single_watch_scopes_independently() {
        let watchers = WindowWatchers::<WatcherScopeManager>::default();

        start_scoped(&watchers, "first", "scope:5", 5);
        start_scoped(&watchers, "second", "scope:1", 1);

        assert_eq!(
            active_scope(&watchers, "first"),
            Some(("scope:5".to_owned(), 5))
        );
        assert_eq!(
            active_scope(&watchers, "second"),
            Some(("scope:1".to_owned(), 1))
        );

        watchers
            .with_window("second", |manager| manager.stop_scope("scope:1", 1))
            .unwrap();

        assert_eq!(
            active_scope(&watchers, "first"),
            Some(("scope:5".to_owned(), 5))
        );
    }

    #[test]
    fn windows_keep_watches_with_the_same_scope_apart() {
        let watchers = WindowWatchers::<WatcherScopeSet>::default();

        for window_label in ["first", "second"] {
            watchers
                .with_window(window_label, |scopes| {
                    assert!(scopes.begin_start("scope:1"));
                    scopes.finish_start("scope:1", test_watcher());
                })
                .unwrap();
        }

        watchers
            .with_window("second", |scopes| scopes.stop_scope("scope:1"))
            .unwrap();

        assert_eq!(watching_scopes(&watchers, "first"), vec!["scope:1"]);
        assert!(watching_scopes(&watchers, "second").is_empty());
    }

    #[test]
    fn stopping_a_window_drops_only_its_watches() {
        let documents = WindowWatchers::<WatcherScopeSet>::default();
        let folders = WindowWatchers::<WatcherScopeManager>::default();

        for window_label in ["first", "second"] {
            documents
                .with_window(window_label, |scopes| {
                    for scope_id in ["scope:1", "scope:2"] {
                        assert!(scopes.begin_start(scope_id));
                        scopes.finish_start(scope_id, test_watcher());
                    }
                })
                .unwrap();
            start_scoped(&folders, window_label, "scope:1", 1);
        }

        documents.stop_window("first").unwrap();
        folders.stop_window("first").unwrap();

        assert!(watching_scopes(&documents, "first").is_empty());
        assert_eq!(active_scope(&folders, "first"), None);
        assert_eq!(
            watching_scopes(&documents, "second"),
            vec!["scope:1", "scope:2"]
        );
        assert_eq!(
            active_scope(&folders, "second"),
            Some(("scope:1".to_owned(), 1))
        );
    }

    fn start_scoped(
        watchers: &WindowWatchers<WatcherScopeManager>,
        window_label: &str,
        scope_id: &str,
        scope_generation: u64,
    ) {
        watchers
            .with_window(window_label, |manager| {
                assert!(manager.begin_start(scope_id, scope_generation));
                manager.finish_start(test_scoped_watcher(scope_id, scope_generation));
            })
            .unwrap();
    }

    fn active_scope(
        watchers: &WindowWatchers<WatcherScopeManager>,
        window_label: &str,
    ) -> Option<(String, u64)> {
        watchers
            .with_window(window_label, |manager| {
                manager
                    .active_scope()
                    .map(|(scope_id, scope_generation)| (scope_id.to_owned(), scope_generation))
            })
            .unwrap()
    }

    fn watching_scopes(
        watchers: &WindowWatchers<WatcherScopeSet>,
        window_label: &str,
    ) -> Vec<String> {
        watchers
            .with_window(window_label, |scopes| {
                scopes
                    .watching_scopes()
                    .into_iter()
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap()
    }

    fn test_scoped_watcher(scope_id: &str, scope_generation: u64) -> ScopedWatcher {
        ScopedWatcher::new(scope_id.to_owned(), scope_generation, test_watcher())
    }

    fn test_watcher() -> RecommendedWatcher {
        notify::recommended_watcher(|_| {}).unwrap()
    }
}
