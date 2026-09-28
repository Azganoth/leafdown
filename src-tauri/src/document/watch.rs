use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    sync::Mutex,
};

use notify::{
    Event, EventKind, RecursiveMode, Watcher,
    event::{AccessKind, AccessMode},
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::is_supported_markdown_path;
use crate::{
    file_utils::resolve_symlinked_target,
    path_utils::path_to_string,
    watch_scope::{ScopedWatcher, WatcherScopeManager, with_watcher_scope_manager},
};

pub(crate) const DOCUMENT_CHANGED_EVENT: &str = "leafdown://document-changed";

#[derive(Default)]
pub(crate) struct DocumentWatcherState {
    manager: Mutex<WatcherScopeManager>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownDocumentChangedEvent {
    pub(crate) path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum WatchMarkdownDocumentError {
    UnsupportedFileType { path: String },
    InvalidPath { path: String },
    WatchFailed { path: String, message: String },
    WatcherStateFailed { message: String },
}

/// Directories are watched rather than the file, because another editor's save commonly replaces
/// the file, and a watch held on the replaced file would see nothing after it.
#[derive(Debug, PartialEq, Eq)]
struct DocumentWatchTargets {
    directories: Vec<PathBuf>,
    file_names: Vec<String>,
}

pub(super) fn watch_markdown_document(
    app: AppHandle,
    state: State<'_, DocumentWatcherState>,
    path: String,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownDocumentError> {
    let path = PathBuf::from(path);
    let serialized_path = path_to_string(path.as_path());

    if !is_supported_markdown_path(path.as_path()) {
        return Err(WatchMarkdownDocumentError::UnsupportedFileType {
            path: serialized_path,
        });
    }

    let targets = DocumentWatchTargets::for_document(path.as_path()).ok_or_else(|| {
        WatchMarkdownDocumentError::InvalidPath {
            path: serialized_path.clone(),
        }
    })?;

    if !with_watcher_manager(&state, |manager| {
        manager.begin_start(scope_id.as_str(), scope_generation)
    })? {
        return Ok(());
    }

    let watcher =
        create_document_watcher(&app, serialized_path, targets, scope_id, scope_generation)?;

    with_watcher_manager(&state, |manager| manager.finish_start(watcher))?;

    Ok(())
}

pub(super) fn unwatch_markdown_document(
    state: State<'_, DocumentWatcherState>,
    scope_id: String,
    scope_generation: u64,
) -> Result<(), WatchMarkdownDocumentError> {
    with_watcher_manager(&state, |manager| {
        manager.stop_scope(scope_id.as_str(), scope_generation);
    })?;

    Ok(())
}

fn create_document_watcher(
    app: &AppHandle,
    document_path: String,
    targets: DocumentWatchTargets,
    scope_id: String,
    scope_generation: u64,
) -> Result<ScopedWatcher, WatchMarkdownDocumentError> {
    let app = app.clone();
    let directories = targets.directories.clone();
    let payload_path = document_path.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        match result {
            Ok(event) if !targets.is_relevant(&event) => return,
            Ok(_) => {}
            // Events may have been dropped, so the frontend checks the file rather than
            // assuming nothing changed.
            Err(error) => log::warn!("document watcher error for {payload_path}: {error}"),
        }

        let payload = MarkdownDocumentChangedEvent {
            path: payload_path.clone(),
        };

        if let Err(error) = app.emit(DOCUMENT_CHANGED_EVENT, payload) {
            log::error!("failed to emit document-changed event: {error}");
        }
    })
    .map_err(|error| WatchMarkdownDocumentError::WatchFailed {
        path: document_path.clone(),
        message: error.to_string(),
    })?;

    for directory in &directories {
        watcher
            .watch(directory, RecursiveMode::NonRecursive)
            .map_err(|error| WatchMarkdownDocumentError::WatchFailed {
                path: document_path.clone(),
                message: error.to_string(),
            })?;
    }

    Ok(ScopedWatcher::new(scope_id, scope_generation, watcher))
}

fn with_watcher_manager<T>(
    state: &DocumentWatcherState,
    operation: impl FnOnce(&mut WatcherScopeManager) -> T,
) -> Result<T, WatchMarkdownDocumentError> {
    with_watcher_scope_manager(&state.manager, operation)
        .map_err(|message| WatchMarkdownDocumentError::WatcherStateFailed { message })
}

impl DocumentWatchTargets {
    /// A symlinked document is saved through to its target, so both names are watched.
    fn for_document(path: &Path) -> Option<Self> {
        let mut targets = Self {
            directories: Vec::new(),
            file_names: Vec::new(),
        };

        targets.add(path)?;

        let target_path = resolve_symlinked_target(path);

        if target_path != path {
            targets.add(target_path.as_path())?;
        }

        Some(targets)
    }

    fn add(&mut self, path: &Path) -> Option<()> {
        let directory = path
            .parent()
            .filter(|directory| !directory.as_os_str().is_empty())?;
        let file_name = comparable_file_name(path.file_name()?);

        if !self.directories.iter().any(|watched| watched == directory) {
            self.directories.push(directory.to_path_buf());
        }

        if !self.file_names.contains(&file_name) {
            self.file_names.push(file_name);
        }

        Some(())
    }

    /// A non-recursive watch reports only the directory's own entries, so a matching name is
    /// enough. The directory itself appears only when it goes away, taking the document with it.
    fn is_relevant(&self, event: &Event) -> bool {
        // Inspecting the file opens and reads it; only a close after writing can mean new content.
        if let EventKind::Access(kind) = event.kind
            && kind != AccessKind::Close(AccessMode::Write)
        {
            return false;
        }

        event.paths.iter().any(|path| {
            self.directories.iter().any(|directory| directory == path)
                || path
                    .file_name()
                    .is_some_and(|name| self.file_names.contains(&comparable_file_name(name)))
        })
    }
}

/// A false match only costs the frontend a metadata check, while a missed one would hide a change
/// on a case-insensitive filesystem.
fn comparable_file_name(name: &OsStr) -> String {
    name.to_string_lossy().to_lowercase()
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use notify::{
        Event, EventKind,
        event::{
            AccessKind, AccessMode, CreateKind, DataChange, ModifyKind, RemoveKind, RenameMode,
        },
    };

    use super::DocumentWatchTargets;
    use crate::{
        file_utils::staging_path,
        test_utils::{TestDirectory, canonical_path_string, create_file_symlink},
    };

    #[test]
    fn watches_the_document_directory_for_its_name() {
        let root = TestDirectory::new("document-watch-targets");
        let path = root.write_file("docs/notes.md");

        assert_eq!(
            DocumentWatchTargets::for_document(path.as_path()),
            Some(DocumentWatchTargets {
                directories: vec![root.path("docs")],
                file_names: vec!["notes.md".to_owned()],
            })
        );
    }

    #[test]
    fn watches_a_symlinked_document_and_its_target() {
        let root = TestDirectory::new("document-watch-symlink");
        let target_path = root.write_file("target/notes.md");
        let link_path = root.create_directory("links").join("link.md");

        if create_file_symlink(target_path.as_path(), link_path.as_path()).is_err() {
            return;
        }

        let targets = DocumentWatchTargets::for_document(link_path.as_path())
            .expect("a symlinked document should be watchable");

        assert_eq!(
            targets.directories,
            vec![
                root.path("links"),
                PathBuf::from(canonical_path_string(root.path("target").as_path())),
            ]
        );
        assert_eq!(targets.file_names, vec!["link.md", "notes.md"]);
    }

    #[test]
    fn refuses_a_document_path_without_a_directory() {
        assert_eq!(
            DocumentWatchTargets::for_document(Path::new("notes.md")),
            None
        );
    }

    #[test]
    fn reports_changes_to_the_document() {
        let root = TestDirectory::new("document-watch-relevant");
        let path = root.write_file("notes.md");
        let targets = DocumentWatchTargets::for_document(path.as_path()).unwrap();

        for kind in [
            EventKind::Create(CreateKind::File),
            EventKind::Modify(ModifyKind::Data(DataChange::Any)),
            EventKind::Modify(ModifyKind::Name(RenameMode::To)),
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            EventKind::Remove(RemoveKind::Any),
            EventKind::Access(AccessKind::Close(AccessMode::Write)),
        ] {
            assert!(
                targets.is_relevant(&event(kind, path.as_path())),
                "{kind:?} should be relevant"
            );
        }
    }

    #[test]
    fn reports_a_rename_that_names_the_document_on_either_side() {
        let root = TestDirectory::new("document-watch-rename-pair");
        let path = root.write_file("notes.md");
        let targets = DocumentWatchTargets::for_document(path.as_path()).unwrap();

        assert!(
            targets.is_relevant(
                &Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
                    .add_path(root.path("draft.md"))
                    .add_path(path.clone())
            )
        );
    }

    #[test]
    fn reports_the_document_name_in_another_case() {
        let root = TestDirectory::new("document-watch-case");
        let path = root.write_file("Notes.md");
        let targets = DocumentWatchTargets::for_document(path.as_path()).unwrap();

        assert!(targets.is_relevant(&event(
            EventKind::Modify(ModifyKind::Any),
            root.path("NOTES.md").as_path()
        )));
    }

    #[test]
    fn reports_removal_of_the_document_directory() {
        let root = TestDirectory::new("document-watch-directory");
        let path = root.write_file("docs/notes.md");
        let targets = DocumentWatchTargets::for_document(path.as_path()).unwrap();

        assert!(targets.is_relevant(&event(
            EventKind::Remove(RemoveKind::Folder),
            root.path("docs").as_path()
        )));
    }

    #[test]
    fn ignores_other_entries_in_the_document_directory() {
        let root = TestDirectory::new("document-watch-siblings");
        let path = root.write_file("notes.md");
        let targets = DocumentWatchTargets::for_document(path.as_path()).unwrap();

        for sibling_path in [
            root.path("other.md"),
            root.path("notes.md.bak"),
            staging_path(path.as_path()),
        ] {
            assert!(
                !targets.is_relevant(&event(
                    EventKind::Create(CreateKind::File),
                    sibling_path.as_path()
                )),
                "{} should not be relevant",
                sibling_path.display()
            );
        }
    }

    #[test]
    fn ignores_reads_of_the_document() {
        let root = TestDirectory::new("document-watch-access");
        let path = root.write_file("notes.md");
        let targets = DocumentWatchTargets::for_document(path.as_path()).unwrap();

        for kind in [
            AccessKind::Any,
            AccessKind::Read,
            AccessKind::Open(AccessMode::Any),
            AccessKind::Close(AccessMode::Read),
        ] {
            assert!(
                !targets.is_relevant(&event(EventKind::Access(kind), path.as_path())),
                "{kind:?} should not be relevant"
            );
        }
    }

    fn event(kind: EventKind, path: &Path) -> Event {
        Event::new(kind).add_path(path.to_path_buf())
    }
}
