use std::{
    fs,
    sync::{Arc, Barrier},
    thread,
};

use serde_json::json;

use super::*;
use crate::test_utils::TestDirectory;

fn setup() -> (TestDirectory, KeptSession, WindowDocuments) {
    let directory = TestDirectory::new("named-folders");
    let session = KeptSession::default();
    session.load(directory.path.clone());
    (directory, session, WindowDocuments::default())
}

fn draft_window(root: &str) -> KeptWindow {
    KeptWindow {
        state: json!({ "version": 1, "folderPath": root, "activeTabIndex": 1, "tabs": [
            { "kind": "saved", "path": format!("{root}/note.md"), "isDirty": true, "snapshotId": "saved", "preview": false },
            { "kind": "untitled", "id": "untitled:1", "isDirty": true, "snapshotId": "draft" }
        ] }),
        snapshot_ids: vec!["saved".into(), "draft".into()],
    }
}

fn keep(session: &KeptSession, label: &str, id: &str, root: &str) {
    session
        .report(
            label,
            draft_window(root),
            vec![
                super::super::SnapshotText {
                    id: "saved".into(),
                    text: "Saved edits".into(),
                },
                super::super::SnapshotText {
                    id: "draft".into(),
                    text: "Untitled edits".into(),
                },
            ],
        )
        .unwrap();
    session
        .create_named(label, id.into(), id.into(), root.into())
        .unwrap();
}

#[test]
fn switching_and_restart_share_one_state_and_restore_tab_order_and_drafts() {
    let (directory, session, documents) = setup();
    keep(&session, "main", "personal", r"C:\Notes");
    let original = session.inner().entries[0].window.clone();
    session.select_named("main", None, &documents).unwrap();
    let restarted = KeptSession::default();
    restarted.load(directory.path.clone());
    assert!(restarted.take("main", || "unexpected".into()).0.is_none());
    let (restored, focused) = restarted
        .select_named("main", Some("personal"), &documents)
        .unwrap();
    let restored = restored.unwrap();
    assert!(focused.is_none());
    assert_eq!(restored.state, original.state);
    assert_eq!(restored.snapshots["draft"], "Untitled edits");
    assert_eq!(restored.snapshots["saved"], "Saved edits");
    let record: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.path("session.json")).unwrap()).unwrap();
    assert_eq!(record["windows"], json!([]));
    assert_eq!(record["namedFolders"].as_array().unwrap().len(), 1);
}

#[test]
fn failed_parking_retains_current_ownership_and_persisted_drafts() {
    let (directory, session, documents) = setup();
    keep(&session, "main", "personal", r"C:\Notes");
    let previous = fs::read(directory.path("session.json")).unwrap();
    fs::remove_file(directory.path("session.json")).unwrap();
    fs::create_dir(directory.path("session.json")).unwrap();
    assert!(session.select_named("main", None, &documents).is_err());
    assert_eq!(session.inner().context_id("main"), Some("personal"));
    assert_eq!(session.inner().entries[0].window.state["activeTabIndex"], 1);
    assert_eq!(
        fs::read_to_string(directory.path("snapshots/draft.md")).unwrap(),
        "Untitled edits"
    );
    fs::remove_dir(directory.path("session.json")).unwrap();
    fs::write(directory.path("session.json"), previous).unwrap();
}

#[test]
fn a_failed_snapshot_report_never_replaces_the_current_record() {
    let (directory, session, _) = setup();
    keep(&session, "main", "personal", r"C:\Notes");
    let before = session.inner().entries[0].window.clone();
    fs::remove_file(directory.path("session.json")).unwrap();
    fs::create_dir(directory.path("session.json")).unwrap();
    let mut after = before.clone();
    after.state["tabs"][0]["snapshotId"] = "new-saved".into();
    after.snapshot_ids[0] = "new-saved".into();
    assert!(
        session
            .report_context(
                "main",
                Some("personal"),
                true,
                after,
                vec![super::super::SnapshotText {
                    id: "new-saved".into(),
                    text: "Latest text".into()
                }]
            )
            .is_err()
    );
    assert_eq!(session.inner().entries[0].window, before);
    assert_eq!(
        fs::read_to_string(directory.path("snapshots/saved.md")).unwrap(),
        "Saved edits"
    );
}

#[test]
fn only_one_concurrent_selection_claims_a_parked_folder() {
    let (_directory, session, documents) = setup();
    keep(&session, "main", "personal", r"C:\Notes");
    session.select_named("main", None, &documents).unwrap();
    let session = Arc::new(session);
    let documents = Arc::new(documents);
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = ["window-2", "window-3"]
        .into_iter()
        .map(|label| {
            let session = session.clone();
            let documents = documents.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                session
                    .select_named(label, Some("personal"), &documents)
                    .unwrap()
                    .1
            })
        })
        .collect();
    let focused: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert_eq!(focused.iter().filter(|label| label.is_none()).count(), 1);
    assert_eq!(
        session
            .inner()
            .entries
            .iter()
            .filter(|entry| matches!(entry.owner, Owner::Window(_)))
            .count(),
        1
    );
}

#[test]
fn parked_and_active_files_route_to_their_context_under_platform_path_identity() {
    let (_directory, session, documents) = setup();
    keep(&session, "main", "personal", "C:/Notes");
    session.select_named("main", None, &documents).unwrap();
    assert_eq!(
        session.with_document_owner("main", r"c:\NOTES\NOTE.md", |owner| owner),
        Some("personal".into())
    );
    session
        .select_named("window-2", Some("personal"), &documents)
        .unwrap();
    assert_eq!(
        session.with_document_owner("main", "C:/Notes/note.md", |owner| owner),
        None
    );
    assert_eq!(
        documents.window_holding(r"c:\notes\NOTE.md").as_deref(),
        Some("window-2")
    );
    assert_eq!(
        session.with_document_owner("window-2", "C:/Notes/note.md", |owner| owner),
        None
    );
    assert!(
        session
            .with_current_context("window-2", None, || ())
            .is_none()
    );
}

#[test]
fn selection_respects_files_claimed_by_an_unnamed_window() {
    let (_directory, session, documents) = setup();
    keep(&session, "main", "personal", "C:/Notes");
    session.select_named("main", None, &documents).unwrap();
    documents.assign_context("other", vec![(r"c:\notes\NOTE.md".into(), true)]);
    assert!(matches!(
        session.select_named("main", Some("personal"), &documents),
        Err(KeptSessionError::ContextBusy)
    ));
    assert!(session.inner().context_id("main").is_none());
}

#[test]
fn disabling_restart_keeps_named_drafts_but_opens_no_context_next_launch() {
    let (directory, session, documents) = setup();
    keep(&session, "main", "personal", "C:/Notes");
    session.clear().unwrap();
    let restarted = KeptSession::default();
    restarted.load(directory.path.clone());
    assert!(restarted.take("main", || "extra".into()).0.is_none());
    assert_eq!(restarted.inner().named_snapshot().folders.len(), 1);
    let restored = restarted
        .select_named("main", Some("personal"), &documents)
        .unwrap()
        .0
        .unwrap();
    assert_eq!(restored.snapshots["draft"], "Untitled edits");
}

#[test]
fn closing_a_secondary_named_window_parks_it_while_quitting_reopens_it() {
    let (directory, session, documents) = setup();
    keep(&session, "window-2", "personal", "C:/Notes");
    session.window_closed("window-2", false).unwrap();
    let restarted = KeptSession::default();
    restarted.load(directory.path.clone());
    assert!(restarted.take("main", || "extra".into()).0.is_none());
    restarted
        .select_named("main", Some("personal"), &documents)
        .unwrap();
    restarted.window_closed("main", true).unwrap();
    let quit_restored = KeptSession::default();
    quit_restored.load(directory.path.clone());
    assert_eq!(
        quit_restored
            .take("main", || "extra".into())
            .0
            .unwrap()
            .context_id
            .as_deref(),
        Some("personal")
    );
}

#[test]
fn crash_reopens_active_contexts_and_leaves_parked_contexts_available() {
    let (directory, session, documents) = setup();
    keep(&session, "main", "personal", "C:/Notes");
    session.select_named("main", None, &documents).unwrap();
    keep(&session, "window-2", "studies", "C:/Studies");
    let restarted = KeptSession::default();
    restarted.load(directory.path.clone());
    let (restored, windows) = restarted.take("main", || "unexpected".into());
    assert_eq!(restored.unwrap().context_id.as_deref(), Some("studies"));
    assert!(windows.is_empty());
    assert_eq!(restarted.inner().named_snapshot().folders.len(), 2);
}

#[test]
fn unbookmarking_active_work_preserves_ownership_tabs_snapshots_and_document_files() {
    let (directory, session, documents) = setup();
    directory.write_file_with_content("note.md", "On disk");
    let root = directory.path.to_string_lossy().into_owned();
    keep(&session, "main", "personal", &root);
    let original = session.inner().entries[0].window.clone();
    session
        .edit_named(
            "personal",
            NamedFolderChanges {
                remove: true,
                ..Default::default()
            },
            &documents,
        )
        .unwrap();
    assert!(session.inner().named_snapshot().folders.is_empty());
    assert_eq!(session.inner().context_id("main"), Some("personal"));
    assert_eq!(session.inner().entries[0].window, original);
    assert_eq!(
        fs::read_to_string(directory.path("note.md")).unwrap(),
        "On disk"
    );
    assert_eq!(
        fs::read_to_string(directory.path("snapshots/draft.md")).unwrap(),
        "Untitled edits"
    );
    session
        .report_context("main", Some("personal"), false, original, vec![])
        .unwrap();
    session.select_named("main", None, &documents).unwrap();
    let restarted = KeptSession::default();
    restarted.load(directory.path.clone());
    let snapshot = restarted.inner().named_snapshot();
    assert!(snapshot.folders.is_empty());
    assert!(snapshot.sessions[0].has_unsaved_drafts);
    assert!(snapshot.sessions[0].window_label.is_none());
    let restored = restarted
        .select_named("main", Some("personal"), &documents)
        .unwrap()
        .0
        .unwrap();
    assert_eq!(restored.snapshots["draft"], "Untitled edits");
}

#[test]
fn editing_a_bookmark_destination_never_relocates_or_closes_its_original_session() {
    let (_directory, session, documents) = setup();
    keep(&session, "main", "personal", "C:/Notes");
    let original = session.inner().entries[0].window.clone();
    session
        .edit_named(
            "personal",
            NamedFolderChanges {
                name: Some("Writing".into()),
                path: Some("C:/Writing".into()),
                ..Default::default()
            },
            &documents,
        )
        .unwrap();
    assert_eq!(session.inner().context_id("main"), Some("personal"));
    assert_eq!(session.inner().entries[0].window, original);
    let snapshot = session.inner().named_snapshot();
    assert_eq!(snapshot.folders[0].folder.path, "C:/Writing");
    assert_eq!(snapshot.folders[0].folder.name, "Writing");
    assert_ne!(snapshot.folders[0].context_id, "personal");
    assert_eq!(snapshot.sessions.len(), 2);
}

#[test]
fn adding_another_bookmark_does_not_replace_current_work_and_deduplicates_paths() {
    let (_directory, session, _) = setup();
    keep(&session, "main", "personal", "C:/Notes");
    session
        .create_named(
            "main",
            "writing".into(),
            "Writing".into(),
            "C:/Writing".into(),
        )
        .unwrap();
    assert_eq!(session.inner().context_id("main"), Some("personal"));
    assert_eq!(session.inner().named_snapshot().folders.len(), 2);
    assert!(matches!(
        session.create_named(
            "other",
            "duplicate".into(),
            "Other".into(),
            r"c:\WRITING".into()
        ),
        Err(KeptSessionError::DuplicateBookmark)
    ));
}

#[test]
fn migrates_version_two_bookmarks_without_duplicating_or_losing_sessions() {
    let (directory, session, documents) = setup();
    keep(&session, "main", "personal", "C:/Notes");
    let mut record: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.path("session.json")).unwrap()).unwrap();
    record["version"] = 2.into();
    record.as_object_mut().unwrap().remove("bookmarks");
    fs::write(
        directory.path("session.json"),
        serde_json::to_vec(&record).unwrap(),
    )
    .unwrap();
    let restarted = KeptSession::default();
    restarted.load(directory.path.clone());
    assert_eq!(
        restarted.inner().named_snapshot().folders[0].folder.id,
        "personal"
    );
    assert_eq!(restarted.inner().entries.len(), 1);
    restarted.take("main", || "extra".into());
    restarted
        .edit_named(
            "personal",
            NamedFolderChanges {
                remove: true,
                ..Default::default()
            },
            &documents,
        )
        .unwrap();
    let again = KeptSession::default();
    again.load(directory.path.clone());
    assert!(again.inner().named_snapshot().folders.is_empty());
    assert_eq!(
        again.take("main", || "extra".into()).0.unwrap().snapshots["draft"],
        "Untitled edits"
    );
}

#[test]
fn failed_bookmark_persistence_rolls_back_metadata_without_touching_the_session() {
    let (directory, session, documents) = setup();
    keep(&session, "main", "personal", "C:/Notes");
    fs::remove_file(directory.path("session.json")).unwrap();
    fs::create_dir(directory.path("session.json")).unwrap();
    assert!(
        session
            .edit_named(
                "personal",
                NamedFolderChanges {
                    remove: true,
                    ..Default::default()
                },
                &documents
            )
            .is_err()
    );
    assert_eq!(session.inner().named_snapshot().folders.len(), 1);
    assert_eq!(session.inner().context_id("main"), Some("personal"));
}

#[test]
fn bookmark_directory_validation_rejects_missing_paths_and_regular_files() {
    let directory = TestDirectory::new("bookmark-validation");
    directory.write_file_with_content("note.md", "text");
    assert!(validate_bookmark_directory(&directory.path.to_string_lossy()).is_ok());
    for path in [directory.path("missing"), directory.path("note.md")] {
        assert!(matches!(
            validate_bookmark_directory(&path.to_string_lossy()),
            Err(KeptSessionError::FolderUnavailable { .. })
        ));
    }
}

#[test]
fn migrates_version_one_windows_and_snapshots_without_losing_unsaved_text() {
    let (directory, session, _) = setup();
    fs::create_dir(directory.path("snapshots")).unwrap();
    fs::write(directory.path("snapshots/draft.md"), "Legacy draft").unwrap();
    fs::write(
        directory.path("session.json"),
        serde_json::to_vec(&json!({ "version": 1, "windows": [draft_window("C:/Notes")] }))
            .unwrap(),
    )
    .unwrap();
    session.load(directory.path.clone());
    let restored = session.take("main", || "extra".into()).0.unwrap();
    assert_eq!(restored.snapshots["draft"], "Legacy draft");
    assert!(restored.context_id.is_none());
}

#[test]
fn a_late_report_cannot_reenable_restart_after_it_was_disabled() {
    let (directory, session, _) = setup();
    session
        .report("main", draft_window("C:/Notes"), vec![])
        .unwrap();
    session.clear().unwrap();
    session
        .report("main", draft_window("C:/Notes"), vec![])
        .unwrap();
    assert!(!directory.path("session.json").exists());
    assert!(session.inner().entries.is_empty());
}

#[test]
fn startup_reserves_named_files_before_their_windows_have_restored_editors() {
    let (directory, session, documents) = setup();
    keep(&session, "main", "personal", "C:/Notes");
    let restarted = KeptSession::default();
    restarted.load(directory.path.clone());
    restarted.take_with_documents("main", || "window-2".into(), Some(&documents));
    assert_eq!(
        documents.window_holding(r"c:\NOTES\NOTE.md").as_deref(),
        Some("main")
    );
}

#[test]
fn invalid_context_payloads_and_stale_removal_are_rejected_without_mutation() {
    let (_directory, session, documents) = setup();
    assert!(matches!(
        session.report(
            "main",
            KeptWindow {
                state: serde_json::Value::Null,
                snapshot_ids: vec![]
            },
            vec![]
        ),
        Err(KeptSessionError::InvalidContext)
    ));
    keep(&session, "main", "personal", "C:/Notes");
    session.select_named("main", None, &documents).unwrap();
    assert!(matches!(
        session.edit_named(
            "personal",
            NamedFolderChanges {
                remove: true,
                expected_revision: Some(0),
                ..Default::default()
            },
            &documents
        ),
        Err(KeptSessionError::InvalidContext)
    ));
    assert_eq!(session.inner().entries.len(), 1);
}

#[test]
fn parked_file_ownership_matches_unc_paths_and_preserves_unix_case() {
    let (_directory, session, documents) = setup();
    keep(&session, "main", "personal", r"\\Server\Share");
    session.select_named("main", None, &documents).unwrap();
    assert_eq!(
        session.with_document_owner("main", "//server/share/NOTE.md", |owner| owner),
        Some("personal".into())
    );
    session
        .select_named("main", Some("personal"), &documents)
        .unwrap();
    let mut state = draft_window(r"\\Server\Share");
    state.state["tabs"][0]["path"] = "/Users/Ada/Note.md".into();
    session
        .report_context("main", Some("personal"), true, state, vec![])
        .unwrap();
    session.select_named("main", None, &documents).unwrap();
    assert_eq!(
        session.with_document_owner("main", "/Users/Ada/Note.md", |owner| owner),
        Some("personal".into())
    );
    assert_eq!(
        session.with_document_owner("main", "/users/ada/note.md", |owner| owner),
        None
    );
}
