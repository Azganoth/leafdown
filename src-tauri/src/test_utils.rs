use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

static NEXT_TEST_DIR_ID: AtomicUsize = AtomicUsize::new(0);

pub(crate) struct TestDirectory {
    pub(crate) path: PathBuf,
}

impl TestDirectory {
    pub(crate) fn new(name: &str) -> Self {
        let id = NEXT_TEST_DIR_ID.fetch_add(1, Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("leafdown-{name}-{}-{id}", std::process::id()));

        fs::create_dir_all(&path).expect("test directory should be created");

        Self { path }
    }

    pub(crate) fn create_directory(&self, relative_path: &str) -> PathBuf {
        let path = self.path.join(relative_path);
        fs::create_dir_all(&path).expect("test directory should be created");
        path
    }

    pub(crate) fn path(&self, relative_path: &str) -> PathBuf {
        self.path.join(relative_path)
    }

    pub(crate) fn write_file(&self, relative_path: &str) -> PathBuf {
        self.write_file_with_content(relative_path, "# Test\n")
    }

    pub(crate) fn markdown_document_path(&self) -> PathBuf {
        self.write_file("docs/readme.md")
    }

    pub(crate) fn write_file_with_content(
        &self,
        relative_path: &str,
        content: impl AsRef<[u8]>,
    ) -> PathBuf {
        let path = self.path.join(relative_path);

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("test file parent should be created");
        }

        fs::write(&path, content).expect("test file should be written");

        path
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

/// Expectations built from a raw `canonicalize` would re-encode the verbatim `\\?\` prefix that
/// #146 removed, so tests compare against the form the backend actually exposes.
pub(crate) fn canonical_path_string(path: &Path) -> String {
    let canonical = path.canonicalize().expect("path should canonicalize");

    dunce::simplified(canonical.as_path())
        .to_string_lossy()
        .into_owned()
}

pub(crate) fn pathdiff(path: &Path, base: &Path) -> String {
    let path_components = path.components().collect::<Vec<_>>();
    let base_components = base.components().collect::<Vec<_>>();
    let common_count = path_components
        .iter()
        .zip(base_components.iter())
        .take_while(|(path_component, base_component)| path_component == base_component)
        .count();
    let mut diff = PathBuf::new();

    for _ in common_count..base_components.len() {
        diff.push("..");
    }

    for component in &path_components[common_count..] {
        diff.push(component.as_os_str());
    }

    diff.to_string_lossy().into_owned()
}
