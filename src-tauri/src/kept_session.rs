use std::{
    collections::{HashMap, HashSet},
    fs, io,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard, PoisonError},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, Window};

use crate::{
    file_utils::write_file_atomically,
    window::{self, MAIN_WINDOW_LABEL, QuitSequence, WindowNumbering},
};

pub(crate) mod named_folders;

const SESSION_DIRECTORY: &str = "session";
const DEV_SESSION_DIRECTORY: &str = "session.dev";
const SESSION_RECORD_FILE: &str = "session.json";
const SNAPSHOTS_DIRECTORY: &str = "snapshots";
const SNAPSHOT_EXTENSION: &str = "md";
const SESSION_RECORD_VERSION: u32 = 2;
const MAX_SNAPSHOT_ID_LENGTH: usize = 64;

/// One window as the session keeps it. The frontend owns the shape of `state`; the backend only
/// needs to know which snapshots it refers to.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeptWindow {
    state: serde_json::Value,
    snapshot_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionRecord {
    version: u32,
    windows: Vec<KeptWindow>,
    #[serde(default)]
    named_folders: Vec<named_folders::StoredNamedFolder>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnapshotText {
    id: String,
    text: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RestoredWindow {
    state: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    context_id: Option<String>,
    /// The text of each snapshot that could be read, by id.
    snapshots: HashMap<String, String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum KeptSessionError {
    Unavailable,
    InvalidSnapshotId { id: String },
    WriteFailed { message: String },
    InvalidContext,
    ContextBusy,
    UnsavedDrafts,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Owner {
    /// Read from the previous run and not yet handed to a window.
    Loaded,
    Window(String),
    /// Its window closed in a way that keeps it for the next launch.
    Closed,
    Parked,
}

#[derive(Debug, Clone)]
struct Entry {
    owner: Owner,
    window: KeptWindow,
    named: Option<named_folders::NamedFolder>,
}

/// The windows, tabs, and unsaved text kept for the next launch, and the files in the application
/// data directory that hold them. Every change and the writes that follow it happen under one
/// lock, so the files always match the last change made.
#[derive(Debug, Default)]
pub(crate) struct KeptSession {
    inner: Mutex<Inner>,
}

#[derive(Debug, Default, Clone)]
struct Inner {
    directory: Option<PathBuf>,
    entries: Vec<Entry>,
    /// Windows already closed in this run. A report one sent before closing can arrive after it
    /// closed, and must not bring it back; labels are never reused within a run.
    closed_windows: HashSet<String>,
    revision: u64,
    restore_session: bool,
}

impl KeptSession {
    fn load(&self, directory: PathBuf) {
        let mut inner = self.inner();

        inner.entries = read_session_record(directory.as_path());
        inner.restore_session = true;
        inner.directory = Some(directory);
    }

    /// Records the window's current state after writing the snapshots it refers to that changed.
    #[cfg(test)]
    fn report(
        &self,
        window_label: &str,
        window: KeptWindow,
        snapshots: Vec<SnapshotText>,
    ) -> Result<(), KeptSessionError> {
        self.report_context(window_label, None, true, window, snapshots)
    }

    fn report_context(
        &self,
        window_label: &str,
        context_id: Option<&str>,
        restore_session: bool,
        window: KeptWindow,
        snapshots: Vec<SnapshotText>,
    ) -> Result<(), KeptSessionError> {
        if !window.state.is_object() {
            return Err(KeptSessionError::InvalidContext);
        }
        for id in window
            .snapshot_ids
            .iter()
            .chain(snapshots.iter().map(|snapshot| &snapshot.id))
        {
            validate_snapshot_id(id)?;
        }

        let mut inner = self.inner();

        if inner.closed_windows.contains(window_label) {
            return Ok(());
        }
        if inner.context_id(window_label) != context_id {
            return Err(KeptSessionError::InvalidContext);
        }
        if context_id.is_none() && !inner.restore_session && restore_session {
            return Ok(());
        }
        let previous = inner.clone();

        let snapshots_directory = inner.directory()?.join(SNAPSHOTS_DIRECTORY);

        fs::create_dir_all(snapshots_directory.as_path()).map_err(write_failed)?;

        for snapshot in &snapshots {
            write_file_atomically(
                snapshot_path(snapshots_directory.as_path(), snapshot.id.as_str()).as_path(),
                snapshot.text.as_bytes(),
            )
            .map_err(write_failed)?;
        }

        let owner = Owner::Window(window_label.to_owned());

        match inner.entries.iter_mut().find(|entry| entry.owner == owner) {
            Some(entry) => {
                entry.window = window;
                if let Some(named) = &entry.named {
                    entry.window.state["folderPath"] = named.path.clone().into();
                }
            }
            None => inner.entries.push(Entry {
                owner,
                window,
                named: None,
            }),
        }

        inner.commit(previous)
    }

    /// Hands the window its part of the kept session. The first window takes the first window kept
    /// from the previous run, and each of the others is given to a new window, whose labels are
    /// returned for the caller to open; each takes its own when it starts.
    #[cfg(test)]
    fn take(
        &self,
        window_label: &str,
        next_label: impl FnMut() -> String,
    ) -> (Option<RestoredWindow>, Vec<String>) {
        self.take_with_documents(window_label, next_label, None)
    }

    fn take_with_documents(
        &self,
        window_label: &str,
        mut next_label: impl FnMut() -> String,
        documents: Option<&crate::window_documents::WindowDocuments>,
    ) -> (Option<RestoredWindow>, Vec<String>) {
        let mut inner = self.inner();
        let mut new_window_labels = Vec::new();

        if window_label == MAIN_WINDOW_LABEL {
            let had_loaded = inner
                .entries
                .iter()
                .any(|entry| entry.owner == Owner::Loaded);
            let mut main_has_entry = inner.owns_entry(window_label);

            for entry in inner
                .entries
                .iter_mut()
                .filter(|entry| entry.owner == Owner::Loaded)
            {
                let label = if main_has_entry {
                    next_label()
                } else {
                    window_label.to_owned()
                };
                if let Some(documents) = documents {
                    let paths = named_folders::saved_paths(&entry.window);
                    if !documents.can_assign(&label, &paths) {
                        entry.owner = Owner::Parked;
                        continue;
                    }
                    documents.assign_context(&label, paths);
                }
                if main_has_entry {
                    new_window_labels.push(label.clone());
                }
                main_has_entry = true;
                entry.owner = Owner::Window(label);
            }
            if had_loaded {
                inner.revision += 1;
            }
        }

        let owner = Owner::Window(window_label.to_owned());
        let restored = inner.directory.as_deref().and_then(|directory| {
            inner
                .entries
                .iter()
                .find(|entry| entry.owner == owner)
                .map(|entry| RestoredWindow {
                    state: entry.window.state.clone(),
                    context_id: entry.named.as_ref().map(|named| named.id.clone()),
                    snapshots: read_snapshots(directory, entry.window.snapshot_ids.as_slice()),
                })
        });

        (restored, new_window_labels)
    }

    /// Keeps a closed window's part for the next launch, or lets it go with the snapshots only it
    /// referred to.
    fn window_closed(&self, window_label: &str, keep: bool) -> Result<(), KeptSessionError> {
        let mut inner = self.inner();
        let owner = Owner::Window(window_label.to_owned());

        inner.closed_windows.insert(window_label.to_owned());

        let restore_session = inner.restore_session;
        if let Some(entry) = inner
            .entries
            .iter_mut()
            .find(|entry| entry.owner == owner && entry.named.is_some())
        {
            entry.owner = if keep && restore_session {
                Owner::Closed
            } else {
                Owner::Parked
            };
            inner.revision += 1;
            return inner.persist();
        }

        if keep {
            for entry in inner
                .entries
                .iter_mut()
                .filter(|entry| entry.owner == owner)
            {
                entry.owner = Owner::Closed;
            }

            return Ok(());
        }

        let count = inner.entries.len();

        inner.entries.retain(|entry| entry.owner != owner);

        if inner.entries.len() == count {
            return Ok(());
        }

        inner.persist()
    }

    fn clear(&self) -> Result<(), KeptSessionError> {
        let mut inner = self.inner();
        let previous = inner.clone();

        inner.restore_session = false;
        inner.entries.retain(|entry| entry.named.is_some());
        for entry in &mut inner.entries {
            if matches!(entry.owner, Owner::Loaded | Owner::Closed) {
                entry.owner = Owner::Parked;
            }
        }
        if inner.entries.is_empty() {
            if let Err(error) = fs::remove_dir_all(inner.directory()?)
                && error.kind() != io::ErrorKind::NotFound
            {
                *inner = previous;
                return Err(write_failed(error));
            }
            return Ok(());
        }
        inner.commit(previous)
    }

    // Each change leaves whole entries behind, so a poisoned lock still holds a usable session.
    fn inner(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Inner {
    fn directory(&self) -> Result<PathBuf, KeptSessionError> {
        self.directory.clone().ok_or(KeptSessionError::Unavailable)
    }

    fn owns_entry(&self, window_label: &str) -> bool {
        self.entries
            .iter()
            .any(|entry| entry.owner == Owner::Window(window_label.to_owned()))
    }

    /// Writes the record, then removes every snapshot it no longer refers to.
    fn persist(&self) -> Result<(), KeptSessionError> {
        let directory = self.directory()?;
        let record = SessionRecord {
            version: SESSION_RECORD_VERSION,
            windows: self
                .entries
                .iter()
                .filter(|entry| entry.named.is_none() && self.restore_session)
                .map(|entry| entry.window.clone())
                .collect(),
            named_folders: self
                .entries
                .iter()
                .filter_map(|entry| {
                    entry
                        .named
                        .as_ref()
                        .map(|named| named_folders::StoredNamedFolder {
                            folder: named.clone(),
                            session: entry.window.clone(),
                            reopen: self.restore_session && entry.owner != Owner::Parked,
                        })
                })
                .collect(),
        };
        let bytes = serde_json::to_vec(&record).map_err(|error| KeptSessionError::WriteFailed {
            message: error.to_string(),
        })?;

        fs::create_dir_all(directory.as_path()).map_err(write_failed)?;
        write_file_atomically(directory.join(SESSION_RECORD_FILE).as_path(), &bytes)
            .map_err(write_failed)?;

        let referenced = self
            .entries
            .iter()
            .flat_map(|entry| entry.window.snapshot_ids.iter().map(String::as_str))
            .collect::<HashSet<_>>();

        remove_unreferenced_snapshots(directory.join(SNAPSHOTS_DIRECTORY).as_path(), &referenced);

        Ok(())
    }
}

fn read_session_record(directory: &Path) -> Vec<Entry> {
    let bytes = match fs::read(directory.join(SESSION_RECORD_FILE)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Vec::new(),
        Err(error) => {
            log::warn!("failed to read the kept session: {error}");
            return Vec::new();
        }
    };

    match serde_json::from_slice::<SessionRecord>(&bytes) {
        Ok(record) if record.version == 1 || record.version == SESSION_RECORD_VERSION => {
            let mut entries: Vec<Entry> = record
                .windows
                .into_iter()
                .map(|window| Entry {
                    owner: Owner::Loaded,
                    window,
                    named: None,
                })
                .collect();
            entries.extend(record.named_folders.into_iter().map(|stored| Entry {
                owner: if stored.reopen {
                    Owner::Loaded
                } else {
                    Owner::Parked
                },
                window: stored.session,
                named: Some(stored.folder),
            }));
            entries
        }
        Ok(record) => {
            log::warn!(
                "ignored a kept session of unknown version {}",
                record.version
            );
            Vec::new()
        }
        Err(error) => {
            log::warn!("ignored an unreadable kept session: {error}");
            Vec::new()
        }
    }
}

fn read_snapshots(directory: &Path, ids: &[String]) -> HashMap<String, String> {
    let snapshots_directory = directory.join(SNAPSHOTS_DIRECTORY);

    ids.iter()
        .filter(|id| validate_snapshot_id(id).is_ok())
        .filter_map(|id| {
            match fs::read_to_string(snapshot_path(snapshots_directory.as_path(), id)) {
                Ok(text) => Some((id.clone(), text)),
                Err(error) => {
                    log::warn!("failed to read kept snapshot {id}: {error}");
                    None
                }
            }
        })
        .collect()
}

/// Staging files left by an interrupted write are removed with the rest, since every write happens
/// under the session's lock and none can still be in progress.
fn remove_unreferenced_snapshots(snapshots_directory: &Path, referenced: &HashSet<&str>) {
    let Ok(entries) = fs::read_dir(snapshots_directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let is_referenced = path
            .extension()
            .is_some_and(|extension| extension == SNAPSHOT_EXTENSION)
            && path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .is_some_and(|stem| referenced.contains(stem));

        if !is_referenced && let Err(error) = fs::remove_file(path.as_path()) {
            log::warn!("failed to remove kept snapshot {}: {error}", path.display());
        }
    }
}

fn snapshot_path(snapshots_directory: &Path, id: &str) -> PathBuf {
    snapshots_directory.join(format!("{id}.{SNAPSHOT_EXTENSION}"))
}

/// Ids name files, so only characters that cannot reach outside the snapshots directory pass.
fn validate_snapshot_id(id: &str) -> Result<(), KeptSessionError> {
    let valid = !id.is_empty()
        && id.len() <= MAX_SNAPSHOT_ID_LENGTH
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');

    if valid {
        Ok(())
    } else {
        Err(KeptSessionError::InvalidSnapshotId { id: id.to_owned() })
    }
}

fn write_failed(error: io::Error) -> KeptSessionError {
    KeptSessionError::WriteFailed {
        message: error.to_string(),
    }
}

fn join_failed(error: impl ToString) -> KeptSessionError {
    KeptSessionError::WriteFailed {
        message: error.to_string(),
    }
}

/// Reads the session kept by the previous run. Without an application data directory, nothing is
/// kept and the commands report it unavailable.
pub(crate) fn load_kept_session<R: Runtime>(app: &AppHandle<R>) {
    match app.path().app_data_dir() {
        Ok(directory) => app
            .state::<KeptSession>()
            .load(session_directory(directory.as_path(), tauri::is_dev())),
        Err(error) => log::error!("cannot keep the session: {error}"),
    }
}

/// Development runs share an installed Leafdown's identifier and can run beside it, so they keep
/// their own session.
fn session_directory(app_data_directory: &Path, is_dev: bool) -> PathBuf {
    app_data_directory.join(if is_dev {
        DEV_SESSION_DIRECTORY
    } else {
        SESSION_DIRECTORY
    })
}

/// A window closing while the application quits, or as the last window, keeps its part of the
/// session; any other leaves the session.
pub(crate) fn keeps_session<R: Runtime>(window: &Window<R>) -> bool {
    window.state::<QuitSequence>().is_active()
        || window
            .app_handle()
            .webview_windows()
            .keys()
            .all(|label| label == window.label())
}

pub(crate) fn forget_window_session<R: Runtime>(window: &Window<R>, keep: bool) {
    let app = window.app_handle().clone();
    let label = window.label().to_owned();

    let named = KeptSession::inner(&app.state::<KeptSession>())
        .context_id(&label)
        .is_some();
    if keep || named {
        if let Err(error) = app
            .state::<KeptSession>()
            .window_closed(label.as_str(), keep)
        {
            log::error!("failed to keep closed window {label}: {error:?}");
        }
        named_folders::publish(&app);
        return;
    }

    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = app
            .state::<KeptSession>()
            .window_closed(label.as_str(), false)
        {
            log::error!("failed to drop window {label} from the kept session: {error:?}");
        }
        named_folders::publish(&app);
    });
}

#[tauri::command]
pub(crate) async fn report_window_session(
    app: AppHandle,
    window: Window,
    session: KeptWindow,
    snapshots: Vec<SnapshotText>,
    context_id: Option<String>,
    restore_session: bool,
) -> Result<(), KeptSessionError> {
    let label = window.label().to_owned();

    tauri::async_runtime::spawn_blocking(move || {
        app.state::<KeptSession>().report_context(
            label.as_str(),
            context_id.as_deref(),
            restore_session,
            session,
            snapshots,
        )
    })
    .await
    .unwrap_or_else(|error| Err(join_failed(error)))
}

/// Returns the window's part of the kept session, if it has one. The first window to ask also opens
/// a window for each other window kept from the previous run.
#[tauri::command]
pub(crate) async fn restore_window_session(
    app: AppHandle,
    window: Window,
) -> Result<Option<RestoredWindow>, KeptSessionError> {
    let label = window.label().to_owned();
    let blocking_app = app.clone();
    let (restored, new_window_labels) = tauri::async_runtime::spawn_blocking(move || {
        let numbering = blocking_app.state::<WindowNumbering>();

        blocking_app.state::<KeptSession>().take_with_documents(
            label.as_str(),
            || numbering.next_label(),
            Some(&blocking_app.state::<crate::window_documents::WindowDocuments>()),
        )
    })
    .await
    .map_err(join_failed)?;

    open_restored_windows(&app, &window, new_window_labels);
    named_folders::publish(&app);

    Ok(restored)
}

#[tauri::command]
pub(crate) async fn clear_kept_session(app: AppHandle) -> Result<(), KeptSessionError> {
    tauri::async_runtime::spawn_blocking(move || app.state::<KeptSession>().clear())
        .await
        .unwrap_or_else(|error| Err(join_failed(error)))
}

#[tauri::command]
pub(crate) async fn enable_kept_session(app: AppHandle) -> Result<(), KeptSessionError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<KeptSession>();
        let mut inner = KeptSession::inner(&state);
        let previous = inner.clone();
        inner.restore_session = true;
        inner.commit(previous)
    })
    .await
    .map_err(join_failed)?
}

/// Opens the restored windows one after another, each placed as `New window` would place it from
/// the window before. A window that fails to open keeps its part for the next launch.
fn open_restored_windows<R: Runtime>(app: &AppHandle<R>, first: &Window<R>, labels: Vec<String>) {
    if labels.is_empty() {
        return;
    }

    let app = app.clone();
    let first_label = first.label().to_owned();

    // Building a window from the main thread deadlocks on Windows.
    tauri::async_runtime::spawn(async move {
        let mut reference = app
            .get_webview_window(first_label.as_str())
            .map(|window| window.as_ref().window());

        for label in labels {
            match window::create_window(&app, label.clone(), reference.as_ref()) {
                Ok(created) => reference = Some(created.as_ref().window()),
                Err(error) => {
                    log::error!("failed to open restored window {label}: {error:?}");
                    let _ = app
                        .state::<KeptSession>()
                        .window_closed(label.as_str(), true);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, fs, path::Path};

    use serde_json::json;

    use super::{
        KeptSession, KeptSessionError, KeptWindow, RestoredWindow, SESSION_RECORD_FILE,
        SNAPSHOTS_DIRECTORY, SnapshotText, session_directory,
    };
    use crate::test_utils::TestDirectory;

    fn kept_window(name: &str, snapshot_ids: &[&str]) -> KeptWindow {
        KeptWindow {
            state: json!({ "name": name }),
            snapshot_ids: snapshot_ids.iter().map(|id| (*id).to_owned()).collect(),
        }
    }

    fn snapshot(id: &str, text: &str) -> SnapshotText {
        SnapshotText {
            id: id.to_owned(),
            text: text.to_owned(),
        }
    }

    fn snapshot_files(directory: &TestDirectory) -> Vec<String> {
        let mut names = fs::read_dir(directory.path(SNAPSHOTS_DIRECTORY))
            .map(|entries| {
                entries
                    .flatten()
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        names.sort();
        names
    }

    fn loaded(directory: &TestDirectory) -> KeptSession {
        let session = KeptSession::default();

        session.load(directory.path.clone());
        session
    }

    fn labels_from(start: u32) -> impl FnMut() -> String {
        let mut next = start;

        move || {
            let label = format!("window-{next}");
            next += 1;
            label
        }
    }

    #[test]
    fn restores_a_reported_window_and_its_snapshots_in_the_next_run() {
        let directory = TestDirectory::new("kept-session-restore");

        loaded(&directory)
            .report(
                "main",
                kept_window("main", &["a"]),
                vec![snapshot("a", "# Draft\n")],
            )
            .expect("window should be kept");

        let (restored, new_windows) = loaded(&directory).take("main", labels_from(2));

        assert_eq!(
            restored,
            Some(RestoredWindow {
                state: json!({ "name": "main" }),
                context_id: None,
                snapshots: HashMap::from([("a".to_owned(), "# Draft\n".to_owned())]),
            })
        );
        assert!(new_windows.is_empty());
    }

    #[test]
    fn gives_each_further_kept_window_to_a_new_window_in_order() {
        let directory = TestDirectory::new("kept-session-windows");
        let first_run = loaded(&directory);

        first_run
            .report("main", kept_window("first", &[]), Vec::new())
            .expect("first window should be kept");
        first_run
            .report("window-2", kept_window("second", &[]), Vec::new())
            .expect("second window should be kept");
        first_run
            .report("window-3", kept_window("third", &[]), Vec::new())
            .expect("third window should be kept");

        let next_run = loaded(&directory);
        let (restored, new_windows) = next_run.take("main", labels_from(4));

        assert_eq!(
            restored.map(|window| window.state),
            Some(json!({ "name": "first" }))
        );
        assert_eq!(new_windows, ["window-4", "window-5"]);
        assert_eq!(
            next_run
                .take("window-5", labels_from(9))
                .0
                .map(|window| window.state),
            Some(json!({ "name": "third" }))
        );
        assert_eq!(next_run.take("window-6", labels_from(9)).0, None);
    }

    #[test]
    fn hands_out_the_previous_run_only_to_the_first_window() {
        let directory = TestDirectory::new("kept-session-first-window");

        loaded(&directory)
            .report("main", kept_window("main", &[]), Vec::new())
            .expect("window should be kept");

        let next_run = loaded(&directory);

        assert_eq!(
            next_run.take("window-2", labels_from(3)),
            (None, Vec::new())
        );
        assert!(next_run.take("main", labels_from(3)).0.is_some());
    }

    #[test]
    fn removes_snapshots_no_window_refers_to_any_more() {
        let directory = TestDirectory::new("kept-session-unreferenced");
        let session = loaded(&directory);

        session
            .report(
                "main",
                kept_window("main", &["a", "b"]),
                vec![snapshot("a", "A"), snapshot("b", "B")],
            )
            .expect("window should be kept");
        session
            .report("main", kept_window("main", &["b"]), Vec::new())
            .expect("window should be kept");

        assert_eq!(snapshot_files(&directory), ["b.md"]);
    }

    #[test]
    fn a_window_closed_while_others_stay_leaves_the_session() {
        let directory = TestDirectory::new("kept-session-leave");
        let session = loaded(&directory);

        session
            .report(
                "main",
                kept_window("main", &["a"]),
                vec![snapshot("a", "A")],
            )
            .expect("first window should be kept");
        session
            .report(
                "window-2",
                kept_window("second", &["b"]),
                vec![snapshot("b", "B")],
            )
            .expect("second window should be kept");

        session
            .window_closed("window-2", false)
            .expect("window should leave the session");

        assert_eq!(snapshot_files(&directory), ["a.md"]);
        assert_eq!(
            loaded(&directory).take("main", labels_from(2)).1,
            Vec::<String>::new()
        );
    }

    #[test]
    fn a_window_closed_in_a_quit_is_kept_and_reports_no_longer_reach_it() {
        let directory = TestDirectory::new("kept-session-quit");
        let session = loaded(&directory);

        session
            .report(
                "main",
                kept_window("main", &["a"]),
                vec![snapshot("a", "A")],
            )
            .expect("window should be kept");
        session
            .window_closed("main", true)
            .expect("window should be kept");
        session
            .report("window-2", kept_window("second", &[]), Vec::new())
            .expect("second window should be kept");

        let (restored, new_windows) = loaded(&directory).take("main", labels_from(3));

        assert_eq!(
            restored.map(|window| window.state),
            Some(json!({ "name": "main" }))
        );
        assert_eq!(new_windows, ["window-3"]);
        assert_eq!(snapshot_files(&directory), ["a.md"]);
    }

    #[test]
    fn ignores_a_report_that_arrives_after_its_window_closed() {
        let directory = TestDirectory::new("kept-session-late-report");
        let session = loaded(&directory);

        session
            .report("main", kept_window("main", &[]), Vec::new())
            .expect("first window should be kept");
        session
            .report("window-2", kept_window("second", &[]), Vec::new())
            .expect("second window should be kept");
        session
            .window_closed("window-2", false)
            .expect("second window should leave the session");
        session
            .report(
                "window-2",
                kept_window("late", &["late"]),
                vec![snapshot("late", "Discarded")],
            )
            .expect("a late report should be ignored");
        session
            .window_closed("main", true)
            .expect("first window should be kept");
        session
            .report("main", kept_window("late main", &[]), Vec::new())
            .expect("a late report should be ignored");

        let (restored, new_windows) = loaded(&directory).take("main", labels_from(2));

        assert_eq!(
            restored.map(|window| window.state),
            Some(json!({ "name": "main" }))
        );
        assert!(new_windows.is_empty());
        assert!(snapshot_files(&directory).is_empty());
    }

    #[test]
    fn a_restored_window_keeps_its_snapshots_until_it_reports() {
        let directory = TestDirectory::new("kept-session-taken");

        loaded(&directory)
            .report(
                "main",
                kept_window("main", &["a"]),
                vec![snapshot("a", "A")],
            )
            .expect("window should be kept");

        let next_run = loaded(&directory);

        next_run.take("main", labels_from(2));
        next_run
            .report("window-2", kept_window("other", &[]), Vec::new())
            .expect("another window should be kept");

        assert_eq!(snapshot_files(&directory), ["a.md"]);
    }

    #[test]
    fn refuses_snapshot_ids_that_could_name_another_file() {
        let directory = TestDirectory::new("kept-session-ids");
        let session = loaded(&directory);

        for id in ["", "../escape", "a/b", "a.b", &"x".repeat(65)] {
            assert_eq!(
                session.report("main", kept_window("main", &[]), vec![snapshot(id, "text")]),
                Err(KeptSessionError::InvalidSnapshotId { id: id.to_owned() })
            );
        }

        assert!(!directory.path(SESSION_RECORD_FILE).exists());
    }

    #[test]
    fn ignores_an_unreadable_record() {
        let directory = TestDirectory::new("kept-session-unreadable");

        directory.write_file_with_content(SESSION_RECORD_FILE, "{ not json");

        assert_eq!(
            loaded(&directory).take("main", labels_from(2)),
            (None, Vec::new())
        );
    }

    #[test]
    fn development_runs_keep_their_session_apart_from_installed_runs() {
        let app_data = Path::new("app-data");

        assert_eq!(session_directory(app_data, false), app_data.join("session"));
        assert_eq!(
            session_directory(app_data, true),
            app_data.join("session.dev")
        );
    }

    #[test]
    fn clearing_removes_every_kept_window_and_snapshot() {
        let directory = TestDirectory::new("kept-session-clear");
        let session = loaded(&directory);

        session
            .report(
                "main",
                kept_window("main", &["a"]),
                vec![snapshot("a", "A")],
            )
            .expect("window should be kept");
        session.clear().expect("kept session should clear");

        assert!(!directory.path.exists());
        assert_eq!(
            loaded(&directory).take("main", labels_from(2)),
            (None, Vec::new())
        );
    }
}
