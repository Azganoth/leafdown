use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::Mutex,
};

use crate::path_utils::path_to_string;

/// The document this process was launched to open, such as a file the operating system routed
/// through a file association. The frontend takes it once, so a webview reload does not reopen it.
#[derive(Debug, Default)]
pub(crate) struct LaunchDocument {
    path: Mutex<Option<PathBuf>>,
}

impl LaunchDocument {
    pub(crate) fn from_process() -> Self {
        Self::from_args(std::env::args_os())
    }

    fn from_args(args: impl IntoIterator<Item = OsString>) -> Self {
        Self {
            path: Mutex::new(launch_document_path(args)),
        }
    }

    fn take(&self) -> Option<PathBuf> {
        self.path
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take()
    }
}

/// The first argument after the program names the document; later arguments are ignored. A
/// relative path resolves against the working directory the process started in.
fn launch_document_path(args: impl IntoIterator<Item = OsString>) -> Option<PathBuf> {
    let argument = args.into_iter().nth(1)?;

    if argument.is_empty() {
        return None;
    }

    std::path::absolute(Path::new(&argument)).ok()
}

#[tauri::command]
pub(crate) fn take_launch_document_path(state: tauri::State<'_, LaunchDocument>) -> Option<String> {
    state.take().map(|path| path_to_string(path.as_path()))
}

#[cfg(test)]
mod tests {
    use std::{ffi::OsString, path::PathBuf};

    use super::{LaunchDocument, launch_document_path};

    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    #[test]
    fn takes_the_first_argument_as_the_document_path() {
        let path = r"C:\Users\Ana Lúcia\Notas de reunião\日本語 notes.md";

        assert_eq!(
            launch_document_path(args(&["leafdown.exe", path, "ignored.md"])),
            Some(PathBuf::from(path))
        );
    }

    #[test]
    fn has_no_document_without_a_path_argument() {
        assert_eq!(launch_document_path(args(&["leafdown.exe"])), None);
        assert_eq!(launch_document_path(args(&["leafdown.exe", ""])), None);
        assert_eq!(launch_document_path(Vec::new()), None);
    }

    #[test]
    fn resolves_a_relative_path_against_the_working_directory() {
        let expected = std::env::current_dir()
            .expect("the test should have a working directory")
            .join("notes")
            .join("today.md");

        assert_eq!(
            launch_document_path(args(&["leafdown.exe", "notes/today.md"])),
            Some(expected)
        );
    }

    #[test]
    fn keeps_unsupported_and_missing_paths_for_the_open_workflow_to_report() {
        let path = r"C:\missing\notes.txt";

        assert_eq!(
            launch_document_path(args(&["leafdown.exe", path])),
            Some(PathBuf::from(path))
        );
    }

    #[test]
    fn hands_the_document_out_once() {
        let launch_document = LaunchDocument::from_args(args(&["leafdown.exe", r"C:\notes.md"]));

        assert_eq!(launch_document.take(), Some(PathBuf::from(r"C:\notes.md")));
        assert_eq!(launch_document.take(), None);
    }
}
