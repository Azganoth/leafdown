use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, Window};

use super::{
    Inner, KeptSession, KeptSessionError, KeptWindow, Owner, RestoredWindow, read_snapshots,
    validate_snapshot_id,
};
use crate::{
    path_utils::path_identity_key,
    window::{self, WindowNumbering},
    window_documents::WindowDocuments,
};

const NAMED_FOLDERS_CHANGED_EVENT: &str = "leafdown://named-folders-changed";

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NamedFolder {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StoredNamedFolder {
    pub(super) folder: NamedFolder,
    pub(super) session: KeptWindow,
    pub(super) reopen: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NamedFolderEntry {
    #[serde(flatten)]
    folder: NamedFolder,
    window_label: Option<String>,
    has_unsaved_drafts: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NamedFoldersSnapshot {
    revision: u64,
    folders: Vec<NamedFolderEntry>,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum NamedFolderSelection {
    Selected { session: Option<RestoredWindow> },
    Focused,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NamedFolderChanges {
    name: Option<String>,
    path: Option<String>,
    #[serde(default)]
    remove: bool,
    #[serde(default)]
    discard_unsaved: bool,
    expected_revision: Option<u64>,
}

impl Inner {
    fn named_snapshot(&self) -> NamedFoldersSnapshot {
        NamedFoldersSnapshot {
            revision: self.revision,
            folders: self
                .entries
                .iter()
                .filter_map(|entry| {
                    entry.named.as_ref().map(|folder| NamedFolderEntry {
                        folder: folder.clone(),
                        window_label: match &entry.owner {
                            Owner::Window(label) => Some(label.clone()),
                            _ => None,
                        },
                        has_unsaved_drafts: entry.window.state["tabs"]
                            .as_array()
                            .is_some_and(|tabs| tabs.iter().any(|tab| tab["isDirty"] == true)),
                    })
                })
                .collect(),
        }
    }

    pub(super) fn context_id(&self, label: &str) -> Option<&str> {
        self.entries
            .iter()
            .find(|entry| entry.owner == Owner::Window(label.to_owned()))
            .and_then(|entry| entry.named.as_ref())
            .map(|named| named.id.as_str())
    }

    pub(super) fn commit(&mut self, previous: Self) -> Result<(), KeptSessionError> {
        self.revision += 1;
        if let Err(error) = self.persist() {
            *self = previous;
            return Err(error);
        }
        Ok(())
    }
}

impl KeptSession {
    pub(crate) fn with_current_context<T>(
        &self,
        label: &str,
        id: Option<&str>,
        operation: impl FnOnce() -> T,
    ) -> Option<T> {
        let inner = self.inner();
        (inner.context_id(label) == id && !inner.closed_windows.contains(label)).then(operation)
    }

    pub(crate) fn with_document_owner<T>(
        &self,
        _label: &str,
        path: &str,
        operation: impl FnOnce(Option<String>) -> T,
    ) -> T {
        let inner = self.inner();
        let key = path_identity_key(path);
        let owner = inner
            .entries
            .iter()
            .find(|entry| {
                entry.named.is_some()
                    && !matches!(entry.owner, Owner::Window(_))
                    && entry.window.state["tabs"].as_array().is_some_and(|tabs| {
                        tabs.iter().any(|tab| {
                            tab["kind"] == "saved"
                                && tab["path"]
                                    .as_str()
                                    .is_some_and(|path| path_identity_key(path) == key)
                        })
                    })
            })
            .and_then(|entry| entry.named.as_ref())
            .map(|named| named.id.clone());
        operation(owner)
    }

    fn create_named(
        &self,
        label: &str,
        id: String,
        name: String,
        path: String,
    ) -> Result<(), KeptSessionError> {
        validate_snapshot_id(&id)?;
        validate_name(&name)?;
        validate_root(&path)?;
        let mut inner = self.inner();
        if inner.context_id(label).is_some()
            || inner
                .entries
                .iter()
                .any(|entry| entry.named.as_ref().is_some_and(|folder| folder.id == id))
        {
            return Err(KeptSessionError::InvalidContext);
        }
        let previous = inner.clone();
        let entry = inner
            .entries
            .iter_mut()
            .find(|entry| entry.owner == Owner::Window(label.to_owned()))
            .ok_or(KeptSessionError::InvalidContext)?;
        if entry.window.state["folderPath"]
            .as_str()
            .is_none_or(|root| path_identity_key(root) != path_identity_key(&path))
        {
            return Err(KeptSessionError::InvalidContext);
        }
        entry.named = Some(NamedFolder {
            id,
            name: name.trim().to_owned(),
            path: path.clone(),
        });
        entry.window.state["folderPath"] = path.into();
        inner.commit(previous)
    }

    fn edit_named(
        &self,
        id: &str,
        changes: NamedFolderChanges,
        documents: &WindowDocuments,
    ) -> Result<(), KeptSessionError> {
        let NamedFolderChanges {
            name,
            path,
            remove,
            discard_unsaved,
            expected_revision,
        } = changes;
        if let Some(name) = &name {
            validate_name(name)?;
        }
        if let Some(path) = &path {
            validate_root(path)?;
        }
        let mut inner = self.inner();
        if remove && expected_revision.is_some_and(|revision| revision != inner.revision) {
            return Err(KeptSessionError::InvalidContext);
        }
        let previous = inner.clone();
        let index = inner
            .entries
            .iter()
            .position(|entry| entry.named.as_ref().is_some_and(|folder| folder.id == id))
            .ok_or(KeptSessionError::InvalidContext)?;
        if let Some(path) = &path {
            let entry = &inner.entries[index];
            let Some(folder) = &entry.named else {
                return Err(KeptSessionError::InvalidContext);
            };
            let relocated = relocate_window(&entry.window, &folder.path, path);
            let paths = saved_paths(&relocated);
            if !documents.can_assign("", &paths)
                || inner
                    .entries
                    .iter()
                    .enumerate()
                    .any(|(other_index, entry)| {
                        other_index != index
                            && saved_paths(&entry.window).iter().any(|(other_path, _)| {
                                paths.iter().any(|(path, _)| {
                                    path_identity_key(path) == path_identity_key(other_path)
                                })
                            })
                    })
            {
                return Err(KeptSessionError::ContextBusy);
            }
        }
        let entry = &mut inner.entries[index];
        if (remove || path.is_some()) && matches!(entry.owner, Owner::Window(_)) {
            return Err(KeptSessionError::ContextBusy);
        }
        if remove {
            if !discard_unsaved
                && entry.window.state["tabs"]
                    .as_array()
                    .is_some_and(|tabs| tabs.iter().any(|tab| tab["isDirty"] == true))
            {
                return Err(KeptSessionError::UnsavedDrafts);
            }
            inner.entries.remove(index);
        } else if let Some(folder) = &mut entry.named {
            if let Some(name) = name {
                folder.name = name.trim().to_owned();
            }
            if let Some(path) = path {
                entry.window = relocate_window(&entry.window, &folder.path, &path);
                folder.path.clone_from(&path);
                entry.window.state["folderPath"] = path.into();
            }
        }
        inner.commit(previous)
    }

    fn select_named(
        &self,
        label: &str,
        id: Option<&str>,
        documents: &WindowDocuments,
    ) -> Result<(Option<RestoredWindow>, Option<String>), KeptSessionError> {
        let mut inner = self.inner();
        let target = if let Some(id) = id {
            let index = inner
                .entries
                .iter()
                .position(|entry| entry.named.as_ref().is_some_and(|folder| folder.id == id))
                .ok_or(KeptSessionError::InvalidContext)?;
            if let Owner::Window(holder) = &inner.entries[index].owner {
                return Ok((None, Some(holder.clone())));
            }
            Some(index)
        } else {
            None
        };
        let paths = target
            .map(|index| saved_paths(&inner.entries[index].window))
            .unwrap_or_default();
        if !documents.can_assign(label, &paths) {
            return Err(KeptSessionError::ContextBusy);
        }
        let previous = inner.clone();
        for entry in &mut inner.entries {
            if entry.owner == Owner::Window(label.to_owned()) {
                entry.owner = Owner::Parked;
            }
        }
        if let Some(index) = target {
            inner.entries[index].owner = Owner::Window(label.to_owned());
        }
        inner
            .entries
            .retain(|entry| entry.owner != Owner::Parked || entry.named.is_some());
        inner.commit(previous)?;
        documents.assign_context(label, paths);
        let restored = inner
            .entries
            .iter()
            .find(|entry| entry.owner == Owner::Window(label.to_owned()))
            .map(|entry| RestoredWindow {
                state: entry.window.state.clone(),
                context_id: entry.named.as_ref().map(|folder| folder.id.clone()),
                snapshots: inner
                    .directory
                    .as_deref()
                    .map(|directory| read_snapshots(directory, &entry.window.snapshot_ids))
                    .unwrap_or_default(),
            });
        Ok((restored, None))
    }
}

fn relocate_window(window: &KeptWindow, old_root: &str, new_root: &str) -> KeptWindow {
    let mut relocated = window.clone();
    let root = old_root.replace('\\', "/");
    let root = root.trim_end_matches('/');
    let prefix = format!("{}/", path_identity_key(root));
    if let Some(tabs) = relocated.state["tabs"].as_array_mut() {
        for tab in tabs {
            if let Some(path) = tab["path"].as_str()
                && path_identity_key(path).starts_with(&prefix)
            {
                let normalized = path.replace('\\', "/");
                let suffix = normalized
                    .split('/')
                    .skip(root.split('/').count())
                    .collect::<Vec<_>>()
                    .join("/");
                tab["path"] =
                    format!("{}/{}", new_root.trim_end_matches(['/', '\\']), suffix).into();
            }
        }
    }
    relocated.state["folderPath"] = new_root.into();
    relocated
}

pub(super) fn saved_paths(window: &KeptWindow) -> Vec<(String, bool)> {
    window.state["tabs"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|tab| {
            (tab["kind"] == "saved")
                .then(|| {
                    tab["path"]
                        .as_str()
                        .map(|path| (path.to_owned(), tab["isDirty"] == true))
                })
                .flatten()
        })
        .collect()
}

fn validate_name(name: &str) -> Result<(), KeptSessionError> {
    if name.trim().is_empty() || name.chars().count() > 200 {
        Err(KeptSessionError::InvalidContext)
    } else {
        Ok(())
    }
}

fn validate_root(path: &str) -> Result<(), KeptSessionError> {
    if Path::new(path).is_absolute() {
        Ok(())
    } else {
        Err(KeptSessionError::InvalidContext)
    }
}

pub(super) fn publish<R: Runtime>(app: &AppHandle<R>) {
    let snapshot = KeptSession::inner(&app.state::<KeptSession>()).named_snapshot();
    if let Err(error) = app.emit(NAMED_FOLDERS_CHANGED_EVENT, snapshot) {
        log::error!("failed to publish named folders: {error}");
    }
}

#[tauri::command]
pub(crate) fn list_named_folders(state: tauri::State<'_, KeptSession>) -> NamedFoldersSnapshot {
    KeptSession::inner(&state).named_snapshot()
}

#[tauri::command]
pub(crate) async fn create_named_folder(
    app: AppHandle,
    window: Window,
    id: String,
    name: String,
    path: String,
) -> Result<(), KeptSessionError> {
    let blocking = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        blocking
            .state::<KeptSession>()
            .create_named(window.label(), id, name, path)
    })
    .await
    .map_err(super::join_failed)??;
    publish(&app);
    Ok(())
}

#[tauri::command]
pub(crate) async fn edit_named_folder(
    app: AppHandle,
    id: String,
    changes: NamedFolderChanges,
) -> Result<(), KeptSessionError> {
    let blocking = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        blocking.state::<KeptSession>().edit_named(
            &id,
            changes,
            &blocking.state::<WindowDocuments>(),
        )
    })
    .await
    .map_err(super::join_failed)??;
    publish(&app);
    Ok(())
}

#[tauri::command]
pub(crate) async fn select_named_folder(
    app: AppHandle,
    window: Window,
    id: Option<String>,
    new_window: bool,
    document_path: Option<String>,
) -> Result<NamedFolderSelection, KeptSessionError> {
    if new_window && id.is_none() {
        return Err(KeptSessionError::InvalidContext);
    }
    let label = if new_window {
        app.state::<WindowNumbering>().next_label()
    } else {
        window.label().to_owned()
    };
    let blocking = app.clone();
    let destination = label.clone();
    let (session, focus) = tauri::async_runtime::spawn_blocking(move || {
        blocking.state::<KeptSession>().select_named(
            &destination,
            id.as_deref(),
            &blocking.state::<WindowDocuments>(),
        )
    })
    .await
    .map_err(super::join_failed)??;
    if let Some(holder) = focus {
        if let Some(path) = document_path {
            let _ = app.emit_to(
                &holder,
                "leafdown://activate-document",
                serde_json::json!({ "path": path }),
            );
        }
        if let Some(window) = app.get_webview_window(&holder) {
            window::bring_forward(&window);
        }
        return Ok(NamedFolderSelection::Focused);
    }
    if new_window && let Err(error) = window::create_window(&app, label.clone(), Some(&window)) {
        let parked = app.state::<KeptSession>().window_closed(&label, false);
        crate::window_documents::abandon_context(&app, &label);
        publish(&app);
        parked?;
        return Err(KeptSessionError::WriteFailed {
            message: format!("{error:?}"),
        });
    }
    publish(&app);
    Ok(NamedFolderSelection::Selected { session })
}
