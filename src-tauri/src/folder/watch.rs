use std::{
    fs, io,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

use notify::{
    Event, EventKind, RecursiveMode, Watcher,
    event::{CreateKind, ModifyKind, RemoveKind},
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::{ScanDepth, defaults, scan};
use crate::{
    document::is_supported_markdown_path,
    file_utils::is_staging_path,
    path_utils::{IoErrorClass, classify_io_error, path_to_string},
    watch_scope::{ScopedWatcher, WatcherScopeManager, with_watcher_scope_manager},
};

pub(crate) const FOLDER_CHANGED_EVENT: &str = "leafdown://folder-changed";
pub(crate) const FOLDER_WATCH_ERROR_EVENT: &str = "leafdown://folder-watch-error";

#[derive(Default)]
pub(crate) struct FolderWatcherState {
    manager: Mutex<WatcherScopeManager>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderChangedEvent {
    pub(crate) folder_path: String,
    pub(crate) paths: Vec<String>,
    // Vanished paths whose event does not say file or directory and whose name is not Markdown.
    // Only the article navigator knows whether one was a directory it shows.
    pub(crate) possible_directory_paths: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
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
) -> Result<ScopedWatcher, WatchMarkdownFolderError> {
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
                let event_paths = relevant_event_paths(
                    &event,
                    folder_path_for_events.as_path(),
                    ignored_directories.as_slice(),
                );

                if event_paths.is_empty() {
                    return;
                }

                let payload = MarkdownFolderChangedEvent {
                    folder_path: folder_path_for_payload.clone(),
                    paths: event_paths.paths,
                    possible_directory_paths: event_paths.possible_directory_paths,
                };

                if let Err(error) = app.emit(FOLDER_CHANGED_EVENT, payload) {
                    log::error!("failed to emit folder-changed event: {error}");
                }
            }
            Err(error) => {
                let message = error.to_string();
                log::warn!(
                    "folder watcher error for {}: {}",
                    folder_path_for_payload,
                    message
                );

                let payload = MarkdownFolderWatchErrorEvent {
                    folder_path: folder_path_for_payload.clone(),
                    error: WatchMarkdownFolderError::WatchFailed {
                        path: folder_path_for_payload.clone(),
                        message,
                    },
                };

                if let Err(error) = app.emit(FOLDER_WATCH_ERROR_EVENT, payload) {
                    log::error!("failed to emit folder-watch-error event: {error}");
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

    Ok(ScopedWatcher::new(scope_id, scope_generation, watcher))
}

fn watch_folder_metadata_error(error: io::Error, path: &Path) -> WatchMarkdownFolderError {
    let path = path_to_string(path);

    match classify_io_error(error) {
        IoErrorClass::InvalidPath => WatchMarkdownFolderError::InvalidPath { path },
        IoErrorClass::Missing => WatchMarkdownFolderError::MissingFolder { path },
        IoErrorClass::PermissionDenied(message) => {
            WatchMarkdownFolderError::PermissionDenied { path, message }
        }
        IoErrorClass::Failed(message) => WatchMarkdownFolderError::MetadataFailed { path, message },
    }
}

fn with_watcher_manager<T>(
    state: &FolderWatcherState,
    operation: impl FnOnce(&mut WatcherScopeManager) -> T,
) -> Result<T, WatchMarkdownFolderError> {
    with_watcher_scope_manager(&state.manager, operation)
        .map_err(|message| WatchMarkdownFolderError::WatcherStateFailed { message })
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
) -> RelevantEventPaths {
    let mut event_paths = RelevantEventPaths::default();

    if matches!(event.kind, EventKind::Access(_)) {
        return event_paths;
    }

    for path in &event.paths {
        let paths = match event_path_relevance(path, folder_path, ignored_directories, &event.kind)
        {
            EventPathRelevance::Relevant => &mut event_paths.paths,
            EventPathRelevance::PossibleDirectory => &mut event_paths.possible_directory_paths,
            EventPathRelevance::Irrelevant => continue,
        };
        let serialized_path = path_to_string(path);

        if !paths.contains(&serialized_path) {
            paths.push(serialized_path);
        }
    }

    event_paths
}

fn event_path_relevance(
    path: &Path,
    folder_path: &Path,
    ignored_directories: &[String],
    event_kind: &EventKind,
) -> EventPathRelevance {
    if path_contains_ignored_directory(path, folder_path, ignored_directories) {
        return EventPathRelevance::Irrelevant;
    }

    if let Ok(metadata) = fs::metadata(path) {
        if metadata.is_dir() {
            return EventPathRelevance::relevant_if(!is_directory_metadata_change(event_kind));
        }

        return EventPathRelevance::relevant_if(
            metadata.is_file() && is_supported_markdown_path(path),
        );
    }

    match event_path_kind(event_kind) {
        EventPathKind::Directory => EventPathRelevance::Relevant,
        EventPathKind::File => EventPathRelevance::relevant_if(is_supported_markdown_path(path)),
        EventPathKind::Unknown
            if is_supported_markdown_path(path) || path.extension().is_none() =>
        {
            EventPathRelevance::Relevant
        }
        EventPathKind::Unknown if is_staging_path(path) => EventPathRelevance::Irrelevant,
        EventPathKind::Unknown => EventPathRelevance::PossibleDirectory,
    }
}

// Windows reports a directory as modified whenever a child is created, written, or deleted;
// the child's own event already carries any change the navigator shows.
fn is_directory_metadata_change(event_kind: &EventKind) -> bool {
    match event_kind {
        EventKind::Modify(ModifyKind::Name(_)) => false,
        EventKind::Modify(_) => true,
        EventKind::Any
        | EventKind::Access(_)
        | EventKind::Create(_)
        | EventKind::Remove(_)
        | EventKind::Other => false,
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EventPathRelevance {
    Relevant,
    PossibleDirectory,
    Irrelevant,
}

impl EventPathRelevance {
    fn relevant_if(is_relevant: bool) -> Self {
        if is_relevant {
            Self::Relevant
        } else {
            Self::Irrelevant
        }
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
struct RelevantEventPaths {
    paths: Vec<String>,
    possible_directory_paths: Vec<String>,
}

impl RelevantEventPaths {
    fn is_empty(&self) -> bool {
        self.paths.is_empty() && self.possible_directory_paths.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use std::assert_matches;
    use std::{
        io::{self, ErrorKind},
        path::Path,
    };

    use notify::{
        Event, EventKind, RecursiveMode,
        event::{
            AccessKind, CreateKind, DataChange, MetadataKind, ModifyKind, RemoveKind, RenameMode,
        },
    };

    use super::{
        RelevantEventPaths, WatchMarkdownFolderError, relevant_event_paths,
        watch_folder_metadata_error, watch_mode_for_depth,
    };
    use crate::{file_utils::staging_path, folder::ScanDepth, test_utils::TestDirectory};

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
    fn treats_markdown_file_creation_as_relevant() {
        let root = TestDirectory::new("watch-markdown-create");
        let path = root.write_file("notes.md");

        let paths = relevant_event_paths(
            &event(EventKind::Create(CreateKind::File), path.as_path()),
            root.path.as_path(),
            &[],
        );

        assert_eq!(paths, relevant(vec![path.to_string_lossy()]));
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
    fn ignores_save_staging_files_while_they_exist() {
        let root = TestDirectory::new("watch-staging-create");
        let document_path = root.write_file("notes.md");
        let path = root.write_file_with_content(
            staging_path(document_path.as_path())
                .file_name()
                .unwrap()
                .to_string_lossy()
                .as_ref(),
            "staged",
        );

        let paths = relevant_event_paths(
            &event(EventKind::Create(CreateKind::File), path.as_path()),
            root.path.as_path(),
            &[],
        );

        assert!(paths.is_empty());
    }

    #[test]
    fn ignores_save_staging_files_that_no_longer_exist() {
        let root = TestDirectory::new("watch-staging-renamed");
        let path = staging_path(root.path("notes.md").as_path());

        for kind in [
            EventKind::Modify(ModifyKind::Any),
            EventKind::Remove(RemoveKind::Any),
            EventKind::Create(CreateKind::Any),
        ] {
            let paths =
                relevant_event_paths(&event(kind, path.as_path()), root.path.as_path(), &[]);

            assert!(paths.is_empty(), "{kind:?} should not be relevant");
        }
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

        assert_eq!(paths, relevant(vec![path.to_string_lossy()]));
    }

    #[test]
    fn ignores_directory_metadata_changes() {
        let root = TestDirectory::new("watch-directory-modify");
        let path = root.create_directory("drafts");

        for kind in [
            EventKind::Modify(ModifyKind::Any),
            EventKind::Modify(ModifyKind::Data(DataChange::Any)),
            EventKind::Modify(ModifyKind::Metadata(MetadataKind::WriteTime)),
            EventKind::Modify(ModifyKind::Other),
        ] {
            let paths =
                relevant_event_paths(&event(kind, path.as_path()), root.path.as_path(), &[]);

            assert!(paths.is_empty(), "{kind:?} should not be relevant");
        }
    }

    #[test]
    fn treats_directory_renames_as_relevant() {
        let root = TestDirectory::new("watch-directory-rename");
        let from_path = root.path("drafts");
        let to_path = root.create_directory("archive");

        for (kind, path) in [
            (
                EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                &from_path,
            ),
            (
                EventKind::Modify(ModifyKind::Name(RenameMode::To)),
                &to_path,
            ),
        ] {
            let paths =
                relevant_event_paths(&event(kind, path.as_path()), root.path.as_path(), &[]);

            assert_eq!(paths, relevant(vec![path.to_string_lossy()]), "{kind:?}");
        }
    }

    #[test]
    fn treats_deleted_directories_as_relevant_without_metadata() {
        let root = TestDirectory::new("watch-directory-delete");
        let path = root.path("drafts");

        for kind in [
            EventKind::Remove(RemoveKind::Folder),
            EventKind::Remove(RemoveKind::Any),
        ] {
            let paths =
                relevant_event_paths(&event(kind, path.as_path()), root.path.as_path(), &[]);

            assert_eq!(paths, relevant(vec![path.to_string_lossy()]), "{kind:?}");
        }
    }

    // Windows reports a directory moved out of the watched folder only as `Remove(Any)`.
    #[test]
    fn reports_vanished_paths_of_unknown_kind_with_extensions_as_possible_directories() {
        let root = TestDirectory::new("watch-dotted-directory-move-out");
        let path = root.path("notes.d");

        for kind in [
            EventKind::Remove(RemoveKind::Any),
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
        ] {
            let paths =
                relevant_event_paths(&event(kind, path.as_path()), root.path.as_path(), &[]);

            assert_eq!(
                paths,
                RelevantEventPaths {
                    paths: Vec::new(),
                    possible_directory_paths: vec![path.to_string_lossy().into_owned()],
                },
                "{kind:?}"
            );
        }
    }

    #[test]
    fn ignores_deleted_non_markdown_files_without_metadata() {
        let root = TestDirectory::new("watch-non-markdown-delete");
        let path = root.path("notes.txt");

        let paths = relevant_event_paths(
            &event(EventKind::Remove(RemoveKind::File), path.as_path()),
            root.path.as_path(),
            &[],
        );

        assert!(paths.is_empty());
    }

    // Windows emits this only since notify 9.0.0-rc.5; before it, deleting the watched
    // folder produced no event at all.
    #[test]
    fn treats_the_watched_folder_being_removed_as_relevant() {
        let root = TestDirectory::new("watch-root-delete");
        let root_path = root.path.clone();

        let paths = relevant_event_paths(
            &event(EventKind::Remove(RemoveKind::Folder), root_path.as_path()),
            root_path.as_path(),
            &[],
        );

        assert_eq!(paths, relevant(vec![root_path.to_string_lossy()]));
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

        assert_eq!(paths, relevant(vec![path.to_string_lossy()]));
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
            relevant(vec![from_path.to_string_lossy(), to_path.to_string_lossy()])
        );
    }

    #[test]
    fn deduplicates_relevant_event_paths_in_event_order() {
        let root = TestDirectory::new("watch-duplicate-paths");
        let first_path = root.path("first.md");
        let second_path = root.path("second.md");

        let paths = relevant_event_paths(
            &Event::new(EventKind::Remove(RemoveKind::File))
                .add_path(first_path.clone())
                .add_path(first_path.clone())
                .add_path(second_path.clone()),
            root.path.as_path(),
            &[],
        );

        assert_eq!(
            paths,
            relevant(vec![
                first_path.to_string_lossy(),
                second_path.to_string_lossy()
            ])
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

        assert_matches!(
            watch_folder_metadata_error(io::Error::from(ErrorKind::InvalidInput), path),
            WatchMarkdownFolderError::InvalidPath { .. }
        );
        assert_matches!(
            watch_folder_metadata_error(io::Error::from(ErrorKind::NotFound), path),
            WatchMarkdownFolderError::MissingFolder { .. }
        );
        assert_matches!(
            watch_folder_metadata_error(io::Error::from(ErrorKind::PermissionDenied), path),
            WatchMarkdownFolderError::PermissionDenied { .. }
        );
        assert_matches!(
            watch_folder_metadata_error(io::Error::from(ErrorKind::Other), path),
            WatchMarkdownFolderError::MetadataFailed { .. }
        );
    }

    fn event(kind: EventKind, path: &Path) -> Event {
        Event::new(kind).add_path(path.to_path_buf())
    }

    fn relevant(paths: Vec<impl Into<String>>) -> RelevantEventPaths {
        RelevantEventPaths {
            paths: paths.into_iter().map(Into::into).collect(),
            possible_directory_paths: Vec::new(),
        }
    }
}
