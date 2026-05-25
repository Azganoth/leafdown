use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use notify::{
    event::{CreateKind, RemoveKind},
    Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::{defaults, scan, ScanDepth};
use crate::document::is_supported_markdown_path;

pub(crate) const FOLDER_CHANGED_EVENT: &str = "leafdown://folder-changed";

#[derive(Default)]
pub(crate) struct FolderWatcherState {
    registry: Mutex<FolderWatcherRegistry>,
}

#[derive(Default)]
struct FolderWatcherRegistry {
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
    cancelled_scope_ids: HashSet<String>,
    latest_generation: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderChangedEvent {
    pub folder_path: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum WatchMarkdownFolderError {
    MetadataFailed { path: String, message: String },
    NotDirectory { path: String },
    WatchFailed { path: String, message: String },
    WatcherStateFailed { message: String },
}

#[tauri::command]
pub(crate) fn watch_markdown_folder(
    app: AppHandle,
    state: State<'_, FolderWatcherState>,
    path: String,
    ignored_directories: Option<Vec<String>>,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownFolderError> {
    if !lock_registry(&state)?
        .scope_tracker
        .begin_scope(scope_id.as_str(), scope_generation)
    {
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

    lock_registry(&state)?.install_watcher(watcher);

    Ok(())
}

#[tauri::command]
pub(crate) fn unwatch_markdown_folder(
    state: State<'_, FolderWatcherState>,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownFolderError> {
    lock_registry(&state)?.cancel_scope(scope_id.as_str(), scope_generation);

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
    let metadata =
        fs::metadata(path).map_err(|error| WatchMarkdownFolderError::MetadataFailed {
            path: serialized_path.clone(),
            message: error.to_string(),
        })?;

    if !metadata.is_dir() {
        return Err(WatchMarkdownFolderError::NotDirectory {
            path: serialized_path,
        });
    }

    let folder_path = path.to_path_buf();
    let folder_path_for_events = folder_path.clone();
    let folder_path_for_payload = path_to_string(folder_path.as_path());
    let app = app.clone();
    let mut watcher = notify::recommended_watcher(move |result| match result {
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
            eprintln!("folder watcher failed: {error}");
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

fn lock_registry(
    state: &FolderWatcherState,
) -> Result<MutexGuard<'_, FolderWatcherRegistry>, WatchMarkdownFolderError> {
    state
        .registry
        .lock()
        .map_err(|error| WatchMarkdownFolderError::WatcherStateFailed {
            message: error.to_string(),
        })
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

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EventPathKind {
    Directory,
    File,
    Unknown,
}

impl FolderWatcherRegistry {
    fn install_watcher(&mut self, watcher: ActiveFolderWatcher) {
        if self
            .scope_tracker
            .can_install_scope(watcher.scope_id.as_str(), watcher.scope_generation)
        {
            self.active_watcher = Some(watcher);
        }
    }

    fn cancel_scope(&mut self, scope_id: &str, scope_generation: u64) {
        self.scope_tracker.cancel_scope(scope_id, scope_generation);

        if self.active_watcher.as_ref().is_some_and(|watcher| {
            watcher.scope_id == scope_id && watcher.scope_generation == scope_generation
        }) {
            self.active_watcher = None;
        }
    }
}

impl FolderWatcherScopeTracker {
    fn begin_scope(&mut self, _scope_id: &str, scope_generation: u64) -> bool {
        if scope_generation < self.latest_generation {
            return false;
        }

        self.latest_generation = scope_generation;

        true
    }

    fn cancel_scope(&mut self, scope_id: &str, scope_generation: u64) {
        self.latest_generation = self.latest_generation.max(scope_generation);
        self.cancelled_scope_ids.insert(scope_id.to_owned());
    }

    fn can_install_scope(&self, scope_id: &str, scope_generation: u64) -> bool {
        scope_generation == self.latest_generation && !self.cancelled_scope_ids.contains(scope_id)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs::{self, create_dir},
        path::{Path, PathBuf},
        sync::atomic::{AtomicUsize, Ordering},
    };

    use notify::{
        event::{AccessKind, CreateKind, ModifyKind, RemoveKind},
        Event, EventKind, RecursiveMode,
    };

    use super::{relevant_event_paths, watch_mode_for_depth, FolderWatcherScopeTracker};
    use crate::folder::ScanDepth;

    static NEXT_TEST_DIR_ID: AtomicUsize = AtomicUsize::new(0);

    struct TestDirectory {
        path: PathBuf,
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let id = NEXT_TEST_DIR_ID.fetch_add(1, Ordering::Relaxed);
            let path =
                std::env::temp_dir().join(format!("leafdown-{name}-{}-{id}", std::process::id()));

            create_dir(&path).expect("test directory should be created");

            Self { path }
        }

        fn create_directory(&self, relative_path: &str) -> PathBuf {
            let path = self.path.join(relative_path);
            fs::create_dir_all(&path).expect("test directory should be created");
            path
        }

        fn write_file(&self, relative_path: &str) -> PathBuf {
            let path = self.path.join(relative_path);

            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("test file parent should be created");
            }

            fs::write(&path, "# Test\n").expect("test file should be written");
            path
        }

        fn path(&self, relative_path: &str) -> PathBuf {
            self.path.join(relative_path)
        }
    }

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

    fn event(kind: EventKind, path: &Path) -> Event {
        Event::new(kind).add_path(path.to_path_buf())
    }
}
