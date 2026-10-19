use std::{
    path::Path,
    sync::{Mutex, MutexGuard, PoisonError},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, Window};

use crate::{kept_session::KeptSession, path_utils::path_identity_key, window};

const WINDOW_DOCUMENTS_CHANGED_EVENT: &str = "leafdown://window-documents-changed";
const ACTIVATE_DOCUMENT_EVENT: &str = "leafdown://activate-document";
const DOCUMENTS_MOVED_EVENT: &str = "leafdown://documents-moved";
const DOCUMENTS_REMOVED_EVENT: &str = "leafdown://documents-removed";

/// A saved document open in a window's tab.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowDocument {
    path: String,
    unsaved: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WindowDocumentsEntry {
    window_label: String,
    documents: Vec<WindowDocument>,
}

/// Every window's documents. The revision orders snapshots that reach a window out of order.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WindowDocumentsSnapshot {
    revision: u64,
    windows: Vec<WindowDocumentsEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentPathPayload {
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentsMovedPayload {
    from_path: String,
    to_path: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum ClaimWindowDocumentResult {
    Claimed,
    OpenElsewhere,
    OwnedByContext { context_id: String },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum WindowDocumentsError {
    InvalidPath { path: String },
}

/// Which saved document each window holds, so a file is open in at most one tab across windows.
/// Windows are kept in the order they were first seen, which is the order `Quit` asks them in.
#[derive(Debug, Default)]
pub(crate) struct WindowDocuments {
    state: Mutex<Registry>,
}

#[derive(Debug, Default)]
struct Registry {
    revision: u64,
    windows: Vec<WindowDocumentsEntry>,
}

#[derive(Debug, PartialEq, Eq)]
enum Claim {
    Claimed,
    HeldBy { window_label: String, path: String },
}

impl WindowDocuments {
    pub(crate) fn can_assign(&self, label: &str, paths: &[(String, bool)]) -> bool {
        let registry = self.registry();
        paths.iter().all(|(path, _)| {
            registry
                .holder(path)
                .is_none_or(|(holder, _)| holder == label)
        })
    }

    pub(crate) fn assign_context(&self, label: &str, paths: Vec<(String, bool)>) {
        self.set_documents(
            label,
            paths
                .into_iter()
                .map(|(path, unsaved)| WindowDocument { path, unsaved })
                .collect(),
        );
    }
    /// Replaces a window's documents, returning the snapshot to publish when they changed.
    fn set_documents(
        &self,
        window_label: &str,
        documents: Vec<WindowDocument>,
    ) -> Option<WindowDocumentsSnapshot> {
        let mut registry = self.registry();
        let entry = registry.entry(window_label);

        if entry.documents == documents {
            return None;
        }

        entry.documents = documents;

        Some(registry.publish())
    }

    /// Records a document for a window unless another window already holds it, checking and
    /// recording in one step so two windows cannot both open the same file.
    fn claim(&self, window_label: &str, path: &str) -> (Claim, Option<WindowDocumentsSnapshot>) {
        let mut registry = self.registry();

        if let Some((holder, document)) = registry.holder(path) {
            if holder != window_label {
                return (
                    Claim::HeldBy {
                        window_label: holder.to_owned(),
                        path: document.path.clone(),
                    },
                    None,
                );
            }

            return (Claim::Claimed, None);
        }

        registry.entry(window_label).documents.push(WindowDocument {
            path: path.to_owned(),
            unsaved: false,
        });

        (Claim::Claimed, Some(registry.publish()))
    }

    /// The window holding `path` under any spelling of it.
    pub(crate) fn window_holding(&self, path: &str) -> Option<String> {
        self.registry()
            .holder(path)
            .map(|(window_label, _)| window_label.to_owned())
    }

    fn forget_window(&self, window_label: &str) -> Option<WindowDocumentsSnapshot> {
        let mut registry = self.registry();
        let count = registry.windows.len();

        registry
            .windows
            .retain(|entry| entry.window_label != window_label);

        (registry.windows.len() != count).then(|| registry.publish())
    }

    /// The windows in the order they were first seen.
    pub(crate) fn window_labels(&self) -> Vec<String> {
        self.registry()
            .windows
            .iter()
            .map(|entry| entry.window_label.clone())
            .collect()
    }

    // The registry holds plain values that each update replaces whole, so a poisoned lock still
    // holds a usable registry.
    fn registry(&self) -> MutexGuard<'_, Registry> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Registry {
    fn holder(&self, path: &str) -> Option<(&str, &WindowDocument)> {
        let key = path_identity_key(path);

        self.windows.iter().find_map(|entry| {
            entry
                .documents
                .iter()
                .find(|document| path_identity_key(document.path.as_str()) == key)
                .map(|document| (entry.window_label.as_str(), document))
        })
    }

    fn entry(&mut self, window_label: &str) -> &mut WindowDocumentsEntry {
        let index = match self
            .windows
            .iter()
            .position(|entry| entry.window_label == window_label)
        {
            Some(index) => index,
            None => {
                self.windows.push(WindowDocumentsEntry {
                    window_label: window_label.to_owned(),
                    documents: Vec::new(),
                });
                self.windows.len() - 1
            }
        };

        &mut self.windows[index]
    }

    fn publish(&mut self) -> WindowDocumentsSnapshot {
        self.revision += 1;

        WindowDocumentsSnapshot {
            revision: self.revision,
            windows: self.windows.clone(),
        }
    }
}

fn validate_path(path: &str) -> Result<(), WindowDocumentsError> {
    if path.is_empty() || !Path::new(path).is_absolute() {
        return Err(WindowDocumentsError::InvalidPath {
            path: path.to_owned(),
        });
    }

    Ok(())
}

fn publish<R: Runtime>(app: &AppHandle<R>, snapshot: Option<WindowDocumentsSnapshot>) {
    if let Some(snapshot) = snapshot
        && let Err(error) = app.emit(WINDOW_DOCUMENTS_CHANGED_EVENT, snapshot)
    {
        log::error!("failed to publish the windows' documents: {error}");
    }
}

fn emit_to_other_windows<R: Runtime, S: Serialize + Clone>(
    app: &AppHandle<R>,
    sender_label: &str,
    event: &str,
    payload: S,
) {
    for label in app.webview_windows().into_keys() {
        if label != sender_label
            && let Err(error) = app.emit_to(label.as_str(), event, payload.clone())
        {
            log::error!("failed to emit {event} to window {label}: {error}");
        }
    }
}

#[tauri::command]
pub(crate) fn set_window_documents(
    app: AppHandle,
    window: Window,
    state: State<'_, WindowDocuments>,
    documents: Vec<WindowDocument>,
    context_id: Option<String>,
) -> Result<(), WindowDocumentsError> {
    for document in &documents {
        validate_path(document.path.as_str())?;
    }

    let snapshot = app
        .state::<KeptSession>()
        .with_current_context(window.label(), context_id.as_deref(), || {
            state.set_documents(window.label(), documents)
        })
        .flatten();
    publish(&app, snapshot);

    Ok(())
}

/// Claims a document for the calling window before it opens or saves to it. When another window
/// holds it, that window is asked to show it if `activate` is set, and the caller opens nothing.
#[tauri::command]
pub(crate) fn claim_window_document(
    app: AppHandle,
    window: Window,
    state: State<'_, WindowDocuments>,
    path: String,
    activate: bool,
) -> Result<ClaimWindowDocumentResult, WindowDocumentsError> {
    validate_path(path.as_str())?;

    let result = app
        .state::<KeptSession>()
        .with_document_owner(window.label(), &path, |owner| {
            owner.map_or_else(|| Ok(state.claim(window.label(), path.as_str())), Err)
        });
    let (claim, snapshot) = match result {
        Ok(result) => result,
        Err(context_id) => {
            return Ok(if activate {
                ClaimWindowDocumentResult::OwnedByContext { context_id }
            } else {
                ClaimWindowDocumentResult::OpenElsewhere
            });
        }
    };

    publish(&app, snapshot);

    match claim {
        Claim::Claimed => Ok(ClaimWindowDocumentResult::Claimed),
        Claim::HeldBy { window_label, path } => {
            if activate {
                if let Err(error) = app.emit_to(
                    window_label.as_str(),
                    ACTIVATE_DOCUMENT_EVENT,
                    DocumentPathPayload { path },
                ) {
                    log::error!("failed to ask window {window_label} to show a document: {error}");
                }

                if let Some(holder) = app.get_webview_window(window_label.as_str()) {
                    window::bring_forward(&holder);
                }
            }

            Ok(ClaimWindowDocumentResult::OpenElsewhere)
        }
    }
}

/// Tells the other windows that a rename moved `from_path`, so they move the tabs under it.
#[tauri::command]
pub(crate) fn notify_documents_moved(
    app: AppHandle,
    window: Window,
    from_path: String,
    to_path: String,
) -> Result<(), WindowDocumentsError> {
    validate_path(from_path.as_str())?;
    validate_path(to_path.as_str())?;

    emit_to_other_windows(
        &app,
        window.label(),
        DOCUMENTS_MOVED_EVENT,
        DocumentsMovedPayload { from_path, to_path },
    );

    Ok(())
}

/// Tells the other windows that `path` was deleted. A deleted folder's own directory watch reports
/// nothing about the documents inside it, so each window checks the documents under the path.
#[tauri::command]
pub(crate) fn notify_documents_removed(
    app: AppHandle,
    window: Window,
    path: String,
) -> Result<(), WindowDocumentsError> {
    validate_path(path.as_str())?;

    emit_to_other_windows(
        &app,
        window.label(),
        DOCUMENTS_REMOVED_EVENT,
        DocumentPathPayload { path },
    );

    Ok(())
}

pub(crate) fn forget_window_documents<R: Runtime>(window: &Window<R>) {
    let snapshot = window
        .state::<WindowDocuments>()
        .forget_window(window.label());

    publish(window.app_handle(), snapshot);
}

pub(crate) fn abandon_context<R: Runtime>(app: &AppHandle<R>, label: &str) {
    publish(app, app.state::<WindowDocuments>().forget_window(label));
}

#[cfg(test)]
mod tests {
    use super::{
        Claim, ClaimWindowDocumentResult, WindowDocument, WindowDocuments, WindowDocumentsError,
        validate_path,
    };

    fn document(path: &str, unsaved: bool) -> WindowDocument {
        WindowDocument {
            path: path.to_owned(),
            unsaved,
        }
    }

    #[test]
    fn claims_a_document_no_window_holds() {
        let registry = WindowDocuments::default();

        let (claim, snapshot) = registry.claim("main", r"C:\Notes\a.md");

        assert_eq!(claim, Claim::Claimed);
        let snapshot = snapshot.expect("a new claim should be published");
        assert_eq!(snapshot.windows.len(), 1);
        assert_eq!(snapshot.windows[0].window_label, "main");
        assert_eq!(
            snapshot.windows[0].documents,
            [document(r"C:\Notes\a.md", false)]
        );
    }

    #[test]
    fn refuses_a_document_another_window_holds_under_any_spelling() {
        let registry = WindowDocuments::default();

        registry.set_documents("main", vec![document(r"C:\Notes\A.md", true)]);

        assert_eq!(
            registry.claim("window-2", "c:/notes/a.md").0,
            Claim::HeldBy {
                window_label: "main".to_owned(),
                path: r"C:\Notes\A.md".to_owned(),
            }
        );
        assert_eq!(
            registry.claim("window-2", r"C:\Notes\b.md").0,
            Claim::Claimed
        );
    }

    #[test]
    fn lets_a_window_claim_a_document_it_already_holds() {
        let registry = WindowDocuments::default();

        registry.set_documents("main", vec![document(r"C:\Notes\a.md", false)]);

        let (claim, snapshot) = registry.claim("main", r"c:\notes\A.md");

        assert_eq!(claim, Claim::Claimed);
        assert!(
            snapshot.is_none(),
            "nothing changed, so nothing is published"
        );
    }

    #[test]
    fn a_claim_lasts_until_the_window_reports_its_documents() {
        let registry = WindowDocuments::default();

        registry.claim("main", r"C:\Notes\a.md");
        assert!(matches!(
            registry.claim("window-2", r"C:\Notes\a.md").0,
            Claim::HeldBy { .. }
        ));

        registry.set_documents("main", Vec::new());

        assert_eq!(
            registry.claim("window-2", r"C:\Notes\a.md").0,
            Claim::Claimed
        );
    }

    #[test]
    fn finds_the_window_holding_a_document_under_any_spelling() {
        let registry = WindowDocuments::default();

        registry.set_documents("main", vec![document(r"C:\Notes\a.md", false)]);
        registry.claim("window-2", r"C:\Notes\B.md");

        assert_eq!(
            registry.window_holding("c:/notes/A.md").as_deref(),
            Some("main")
        );
        assert_eq!(
            registry.window_holding(r"c:\notes\b.md").as_deref(),
            Some("window-2"),
            "a pending claim holds the document too"
        );
        assert_eq!(registry.window_holding(r"C:\Notes\c.md"), None);
    }

    #[test]
    fn publishes_only_changed_documents_with_increasing_revisions() {
        let registry = WindowDocuments::default();

        let first = registry
            .set_documents("main", vec![document("/notes/a.md", false)])
            .expect("new documents should be published");
        assert!(
            registry
                .set_documents("main", vec![document("/notes/a.md", false)])
                .is_none()
        );
        let second = registry
            .set_documents("main", vec![document("/notes/a.md", true)])
            .expect("a document gaining unsaved changes should be published");

        assert!(second.revision > first.revision);
        assert_eq!(second.windows[0].documents, [document("/notes/a.md", true)]);
    }

    #[test]
    fn forgets_a_destroyed_window_and_frees_its_documents() {
        let registry = WindowDocuments::default();

        registry.set_documents("main", vec![document("/notes/a.md", true)]);
        registry.set_documents("window-2", Vec::new());

        let snapshot = registry
            .forget_window("main")
            .expect("forgetting a window should be published");

        assert_eq!(snapshot.windows.len(), 1);
        assert_eq!(registry.claim("window-2", "/notes/a.md").0, Claim::Claimed);
        assert!(registry.forget_window("main").is_none());
    }

    #[test]
    fn lists_windows_in_the_order_they_were_first_seen() {
        let registry = WindowDocuments::default();

        registry.set_documents("main", Vec::new());
        registry.claim("window-3", "/notes/a.md");
        registry.set_documents("window-2", Vec::new());
        registry.set_documents("main", vec![document("/notes/b.md", false)]);

        assert_eq!(registry.window_labels(), ["main", "window-3", "window-2"]);
    }

    #[test]
    fn refuses_relative_and_empty_paths() {
        assert_eq!(
            validate_path("notes/a.md"),
            Err(WindowDocumentsError::InvalidPath {
                path: "notes/a.md".to_owned()
            })
        );
        assert!(validate_path("").is_err());
    }

    #[test]
    fn serializes_claims_and_snapshots_for_the_frontend() {
        let registry = WindowDocuments::default();
        let (_, snapshot) = registry.claim("main", "/notes/a.md");

        assert_eq!(
            serde_json::to_value(snapshot).expect("the snapshot should serialize"),
            serde_json::json!({
                "revision": 1,
                "windows": [{
                    "windowLabel": "main",
                    "documents": [{ "path": "/notes/a.md", "unsaved": false }],
                }],
            })
        );
        assert_eq!(
            serde_json::to_value(ClaimWindowDocumentResult::OpenElsewhere)
                .expect("the claim should serialize"),
            serde_json::json!({ "kind": "openElsewhere" })
        );
        assert_eq!(
            serde_json::to_value(WindowDocumentsError::InvalidPath {
                path: "a.md".to_owned()
            })
            .expect("the error should serialize"),
            serde_json::json!({ "kind": "invalidPath", "path": "a.md" })
        );
    }
}
