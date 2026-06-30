use std::{
    collections::HashSet,
    fs,
    io::{self, ErrorKind},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

use notify::{
    event::{CreateKind, RemoveKind},
    Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::{defaults, scan, ScanDepth};
use crate::{document::is_supported_markdown_path, path_utils::path_to_string};

pub(crate) const FOLDER_CHANGED_EVENT: &str = "leafdown://folder-changed";
pub(crate) const FOLDER_WATCH_ERROR_EVENT: &str = "leafdown://folder-watch-error";

#[derive(Default)]
pub(crate) struct FolderWatcherState {
    manager: Mutex<FolderWatcherManager>,
}

#[derive(Default)]
struct FolderWatcherManager {
    active_watcher: Option<ActiveFolderWatcher>,
    scope_tracker: FolderWatcherScopeTracker,
}

struct ActiveFolderWatcher {
    scope_generation: u64,
    scope_id: String,
    _watcher: RecommendedWatcher,
}

#[derive(Default)]
struct FolderWatcherScopeTracker {
    cancelled_scope: Option<CancelledFolderWatcherScope>,
    latest_generation: u64,
}

struct CancelledFolderWatcherScope {
    scope_generation: u64,
    scope_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderChangedEvent {
    pub(crate) folder_path: String,
    pub(crate) paths: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum WatchMarkdownFolderError {
    InvalidPath { path: String },
    MissingFolder { path: String },
    PermissionDenied { path: String, message: String },
    MetadataFailed { path: String, message: String },
    NotDirectory { path: String },
    WatchFailed { path: String, message: String },
    WatcherStateFailed { message: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderWatchErrorEvent {
    pub(crate) folder_path: String,
    pub(crate) error: WatchMarkdownFolderError,
}

pub(super) fn watch_markdown_folder(
    app: AppHandle,
    state: State<'_, FolderWatcherState>,
    path: String,
    ignored_directories: Option<Vec<String>>,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownFolderError> {
    if !with_watcher_manager(&state, |manager| {
        manager.begin_start(scope_id.as_str(), scope_generation)
    })? {
        return Ok(());
    }

    let path = PathBuf::from(path);
    let watcher = create_folder_watcher(
        &app,
        path.as_path(),
        ignored_directories.unwrap_or_else(defaults::ignored_directories),
        scope_id,
        scope_generation,
    )?;

    with_watcher_manager(&state, |manager| manager.finish_start(watcher))?;

    Ok(())
}

pub(super) fn unwatch_markdown_folder(
    state: State<'_, FolderWatcherState>,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownFolderError> {
    with_watcher_manager(&state, |manager| {
        manager.stop_scope(scope_id.as_str(), scope_generation);
    })?;

    Ok(())
}

fn create_folder_watcher(
    app: &AppHandle,
    path: &Path,
    ignored_directories: Vec<String>,
    scope_id: String,
    scope_generation: u64,
) -> Result<ActiveFolderWatcher, WatchMarkdownFolderError> {
    let serialized_path = path_to_string(path);
    let metadata = fs::metadata(path).map_err(|error| watch_folder_metadata_error(error, path))?;

    if !metadata.is_dir() {
        return Err(WatchMarkdownFolderError::NotDirectory {
            path: serialized_path,
        });
    }

    let folder_path = path.to_path_buf();
    let folder_path_for_events = folder_path.clone();
    let folder_path_for_payload = path_to_string(folder_path.as_path());
    let app = app.clone();
    let mut watcher =
        notify::recommended_watcher(move |result: notify::Result<Event>| match result {
            Ok(event) => {
                let paths = relevant_event_paths(
                    &event,
                    folder_path_for_events.as_path(),
                    ignored_directories.as_slice(),
                );

                if paths.is_empty() {
                    return;
                }

                let payload = MarkdownFolderChangedEvent {
                    folder_path: folder_path_for_payload.clone(),
                    paths,
                };

                if let Err(error) = app.emit(FOLDER_CHANGED_EVENT, payload) {
                    eprintln!("failed to emit folder-changed event: {error}");
                }
            }
            Err(error) => {
                let payload = MarkdownFolderWatchErrorEvent {
                    folder_path: folder_path_for_payload.clone(),
                    error: WatchMarkdownFolderError::WatchFailed {
                        path: folder_path_for_payload.clone(),
                        message: error.to_string(),
                    },
                };

                if let Err(error) = app.emit(FOLDER_WATCH_ERROR_EVENT, payload) {
                    eprintln!("failed to emit folder-watch-error event: {error}");
                }
            }
        })
        .map_err(|error| WatchMarkdownFolderError::WatchFailed {
            path: serialized_path.clone(),
            message: error.to_string(),
        })?;

    watcher
        .watch(path, watch_mode_for_path(path))
        .map_err(|error| WatchMarkdownFolderError::WatchFailed {
            path: serialized_path,
            message: error.to_string(),
        })?;

    Ok(ActiveFolderWatcher {
        scope_generation,
        scope_id,
        _watcher: watcher,
    })
}

fn watch_folder_metadata_error(error: io::Error, path: &Path) -> WatchMarkdownFolderError {
    let path = path_to_string(path);

    match error.kind() {
        ErrorKind::InvalidInput => WatchMarkdownFolderError::InvalidPath { path },
        ErrorKind::NotFound => WatchMarkdownFolderError::MissingFolder { path },
        ErrorKind::PermissionDenied => WatchMarkdownFolderError::PermissionDenied {
            path,
            message: error.to_string(),
        },
        _ => WatchMarkdownFolderError::MetadataFailed {
            path,
            message: error.to_string(),
        },
    }
}

fn with_watcher_manager<T>(
    state: &FolderWatcherState,
    operation: impl FnOnce(&mut FolderWatcherManager) -> T,
) -> Result<T, WatchMarkdownFolderError> {
    let mut manager =
        state
            .manager
            .lock()
            .map_err(|error| WatchMarkdownFolderError::WatcherStateFailed {
                message: error.to_string(),
            })?;

    Ok(operation(&mut manager))
}

fn watch_mode_for_path(path: &Path) -> RecursiveMode {
    watch_mode_for_depth(scan::scan_depth_for_path(path))
}

fn watch_mode_for_depth(depth: ScanDepth) -> RecursiveMode {
    match depth {
        ScanDepth::Recursive => RecursiveMode::Recursive,
        ScanDepth::RootRestricted => RecursiveMode::NonRecursive,
    }
}

fn relevant_event_paths(
    event: &Event,
    folder_path: &Path,
    ignored_directories: &[String],
) -> Vec<String> {
    if matches!(event.kind, EventKind::Access(_)) {
        return Vec::new();
    }

    let mut paths = Vec::new();
    let mut seen_paths = HashSet::new();

    for path in &event.paths {
        if !event_path_is_relevant(path, folder_path, ignored_directories, &event.kind) {
            continue;
        }

        let serialized_path = path_to_string(path);

        if seen_paths.insert(serialized_path.clone()) {
            paths.push(serialized_path);
        }
    }

    paths
}

fn event_path_is_relevant(
    path: &Path,
    folder_path: &Path,
    ignored_directories: &[String],
    event_kind: &EventKind,
) -> bool {
    if path_contains_ignored_directory(path, folder_path, ignored_directories) {
        return false;
    }

    if let Ok(metadata) = fs::metadata(path) {
        if metadata.is_dir() {
            return true;
        }

        return metadata.is_file() && is_supported_markdown_path(path);
    }

    match event_path_kind(event_kind) {
        EventPathKind::Directory => true,
        EventPathKind::File => is_supported_markdown_path(path),
        EventPathKind::Unknown => is_supported_markdown_path(path) || path.extension().is_none(),
    }
}

fn event_path_kind(event_kind: &EventKind) -> EventPathKind {
    match event_kind {
        EventKind::Create(CreateKind::Folder) | EventKind::Remove(RemoveKind::Folder) => {
            EventPathKind::Directory
        }
        EventKind::Create(CreateKind::File) | EventKind::Remove(RemoveKind::File) => {
            EventPathKind::File
        }
        EventKind::Any
        | EventKind::Access(_)
        | EventKind::Create(_)
        | EventKind::Modify(_)
        | EventKind::Remove(_)
        | EventKind::Other => EventPathKind::Unknown,
    }
}

fn path_contains_ignored_directory(
    path: &Path,
    folder_path: &Path,
    ignored_directories: &[String],
) -> bool {
    let relative_path = path.strip_prefix(folder_path).unwrap_or(path);

    relative_path.components().any(|component| match component {
        Component::Normal(name) => {
            scan::is_ignored_directory(name.to_string_lossy().as_ref(), ignored_directories)
        }
        Component::CurDir | Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
            false
        }
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EventPathKind {
    Directory,
    File,
    Unknown,
}

impl FolderWatcherManager {
    fn begin_start(&mut self, scope_id: &str, scope_generation: u64) -> bool {
        if !self.scope_tracker.begin_scope(scope_id, scope_generation) {
            return false;
        }

        self.stop_active_watcher();

        true
    }

    fn finish_start(&mut self, watcher: ActiveFolderWatcher) {
        if self
            .scope_tracker
            .can_install_scope(watcher.scope_id.as_str(), watcher.scope_generation)
        {
            self.active_watcher = Some(watcher);
        }
    }

    fn stop_scope(&mut self, scope_id: &str, scope_generation: u64) {
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

impl Drop for FolderWatcherManager {
    fn drop(&mut self) {
        self.stop_active_watcher();
    }
}

impl FolderWatcherScopeTracker {
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
        self.cancelled_scope = Some(CancelledFolderWatcherScope {
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
    use std::{
        io::{self, ErrorKind},
        path::Path,
    };

    use notify::{
        event::{AccessKind, CreateKind, ModifyKind, RemoveKind},
        Event, EventKind, RecursiveMode,
    };

    use super::{
        relevant_event_paths, watch_folder_metadata_error, watch_mode_for_depth,
        ActiveFolderWatcher, FolderWatcherManager, FolderWatcherScopeTracker,
        WatchMarkdownFolderError,
    };
    use crate::{folder::ScanDepth, test_utils::TestDirectory};

    #[test]
    fn maps_scan_depth_to_matching_watch_mode() {
        assert_eq!(
            watch_mode_for_depth(ScanDepth::Recursive),
            RecursiveMode::Recursive
        );
        assert_eq!(
            watch_mode_for_depth(ScanDepth::RootRestricted),
            RecursiveMode::NonRecursive
        );
    }

    #[test]
    fn allows_current_watcher_scopes_to_install() {
        let mut tracker = FolderWatcherScopeTracker::default();

        assert!(tracker.begin_scope("scope:1", 1));

        assert!(tracker.can_install_scope("scope:1", 1));
    }

    #[test]
    fn rejects_stale_watcher_scopes_after_newer_scope_begins() {
        let mut tracker = FolderWatcherScopeTracker::default();

        assert!(tracker.begin_scope("scope:1", 1));
        assert!(tracker.begin_scope("scope:2", 2));

        assert!(!tracker.can_install_scope("scope:1", 1));
        assert!(!tracker.begin_scope("scope:1", 1));
        assert!(tracker.can_install_scope("scope:2", 2));
    }

    #[test]
    fn rejects_cancelled_watcher_scopes_even_when_watch_finishes_later() {
        let mut tracker = FolderWatcherScopeTracker::default();

        tracker.cancel_scope("scope:1", 1);

        assert!(tracker.begin_scope("scope:1", 1));
        assert!(!tracker.can_install_scope("scope:1", 1));
    }

    #[test]
    fn ignores_stale_cleanup_for_newer_watcher_scopes() {
        let mut tracker = FolderWatcherScopeTracker::default();

        assert!(tracker.begin_scope("scope:1", 1));
        assert!(tracker.begin_scope("scope:2", 2));
        tracker.cancel_scope("scope:1", 1);

        assert!(tracker.can_install_scope("scope:2", 2));
    }

    #[test]
    fn manager_stops_active_watcher_when_new_scope_begins() {
        let mut manager = FolderWatcherManager::default();

        assert!(manager.begin_start("scope:1", 1));
        manager.finish_start(test_watcher("scope:1", 1));
        assert_eq!(manager.active_scope(), Some(("scope:1", 1)));

        assert!(manager.begin_start("scope:2", 2));

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn manager_rejects_stale_watchers_that_finish_late() {
        let mut manager = FolderWatcherManager::default();

        assert!(manager.begin_start("scope:1", 1));
        assert!(manager.begin_start("scope:2", 2));
        manager.finish_start(test_watcher("scope:1", 1));

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn manager_rejects_watchers_for_scopes_cancelled_before_install() {
        let mut manager = FolderWatcherManager::default();

        assert!(manager.begin_start("scope:1", 1));
        manager.stop_scope("scope:1", 1);
        manager.finish_start(test_watcher("scope:1", 1));

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn manager_stops_matching_active_watcher_on_cancel() {
        let mut manager = FolderWatcherManager::default();

        assert!(manager.begin_start("scope:1", 1));
        manager.finish_start(test_watcher("scope:1", 1));

        manager.stop_scope("scope:1", 1);

        assert_eq!(manager.active_scope(), None);
    }

    #[test]
    fn treats_markdown_file_creation_as_relevant() {
        let root = TestDirectory::new("watch-markdown-create");
        let path = root.write_file("notes.md");

        let paths = relevant_event_paths(
            &event(EventKind::Create(CreateKind::File), path.as_path()),
            root.path.as_path(),
            &[],
        );

        assert_eq!(paths, vec![path.to_string_lossy()]);
    }

    #[test]
    fn ignores_non_markdown_file_creation() {
        let root = TestDirectory::new("watch-non-markdown-create");
        let path = root.write_file("notes.txt");

        let paths = relevant_event_paths(
            &event(EventKind::Create(CreateKind::File), path.as_path()),
            root.path.as_path(),
            &[],
        );

        assert!(paths.is_empty());
    }

    #[test]
    fn treats_directory_creation_as_relevant() {
        let root = TestDirectory::new("watch-directory-create");
        let path = root.create_directory("drafts");

        let paths = relevant_event_paths(
            &event(EventKind::Create(CreateKind::Folder), path.as_path()),
            root.path.as_path(),
            &[],
        );

        assert_eq!(paths, vec![path.to_string_lossy()]);
    }

    #[test]
    fn treats_deleted_markdown_paths_as_relevant_without_metadata() {
        let root = TestDirectory::new("watch-markdown-delete");
        let path = root.path("removed.markdown");

        let paths = relevant_event_paths(
            &event(EventKind::Remove(RemoveKind::File), path.as_path()),
            root.path.as_path(),
            &[],
        );

        assert_eq!(paths, vec![path.to_string_lossy()]);
    }

    #[test]
    fn treats_rename_events_with_markdown_paths_as_relevant() {
        let root = TestDirectory::new("watch-markdown-rename");
        let from_path = root.path("old.md");
        let to_path = root.path("new.md");

        let paths = relevant_event_paths(
            &Event::new(EventKind::Modify(ModifyKind::Any))
                .add_path(from_path.clone())
                .add_path(to_path.clone()),
            root.path.as_path(),
            &[],
        );

        assert_eq!(
            paths,
            vec![from_path.to_string_lossy(), to_path.to_string_lossy()]
        );
    }

    #[test]
    fn ignores_paths_inside_ignored_directories() {
        let root = TestDirectory::new("watch-ignored-directory");
        let path = root.write_file(".git/hidden.md");

        let paths = relevant_event_paths(
            &event(EventKind::Create(CreateKind::File), path.as_path()),
            root.path.as_path(),
            &[".git".to_owned()],
        );

        assert!(paths.is_empty());
    }

    #[test]
    fn ignores_access_events() {
        let root = TestDirectory::new("watch-access-event");
        let path = root.write_file("notes.md");

        let paths = relevant_event_paths(
            &event(EventKind::Access(AccessKind::Any), path.as_path()),
            root.path.as_path(),
            &[],
        );

        assert!(paths.is_empty());
    }

    #[test]
    fn classifies_watch_folder_metadata_errors() {
        let path = Path::new("bad:path");

        assert!(matches!(
            watch_folder_metadata_error(io::Error::from(ErrorKind::InvalidInput), path),
            WatchMarkdownFolderError::InvalidPath { .. }
        ));
        assert!(matches!(
            watch_folder_metadata_error(io::Error::from(ErrorKind::NotFound), path),
            WatchMarkdownFolderError::MissingFolder { .. }
        ));
        assert!(matches!(
            watch_folder_metadata_error(io::Error::from(ErrorKind::PermissionDenied), path),
            WatchMarkdownFolderError::PermissionDenied { .. }
        ));
        assert!(matches!(
            watch_folder_metadata_error(io::Error::from(ErrorKind::Other), path),
            WatchMarkdownFolderError::MetadataFailed { .. }
        ));
    }

    fn event(kind: EventKind, path: &Path) -> Event {
        Event::new(kind).add_path(path.to_path_buf())
    }

    fn test_watcher(scope_id: &str, scope_generation: u64) -> ActiveFolderWatcher {
        ActiveFolderWatcher {
            scope_generation,
            scope_id: scope_id.to_owned(),
            _watcher: notify::recommended_watcher(|_| {}).unwrap(),
        }
    }
}
