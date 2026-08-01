use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_STAGING_FILE_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Debug)]
pub(crate) enum ReadUtf8FileError {
    ReadFailed(io::Error),
    Oversized {
        size_bytes: u64,
        max_size_bytes: u64,
    },
    InvalidEncoding,
}

pub(crate) fn read_utf8_file_with_size_limit(
    path: &Path,
    max_size_bytes: u64,
) -> Result<String, ReadUtf8FileError> {
    let content_bytes = fs::read(path).map_err(ReadUtf8FileError::ReadFailed)?;
    let size_bytes = content_bytes.len().try_into().unwrap_or(u64::MAX);

    if size_bytes > max_size_bytes {
        return Err(ReadUtf8FileError::Oversized {
            size_bytes,
            max_size_bytes,
        });
    }

    String::from_utf8(content_bytes).map_err(|_| ReadUtf8FileError::InvalidEncoding)
}

/// A truncating write would leave the previous contents unrecoverable if the process died
/// mid-write, and the file on disk is the only copy Leafdown keeps.
pub(crate) fn write_file_atomically(path: &Path, content: &[u8]) -> io::Result<()> {
    let staging_file = StagingFile::create_beside(path)?;

    write_staged_contents(staging_file.path.as_path(), content)?;
    staging_file.persist(path)
}

fn write_staged_contents(path: &Path, content: &[u8]) -> io::Result<()> {
    let mut file = fs::OpenOptions::new().write(true).open(path)?;

    file.write_all(content)?;
    file.sync_all()
}

struct StagingFile {
    path: PathBuf,
    persisted: bool,
}

impl StagingFile {
    fn create_beside(target_path: &Path) -> io::Result<Self> {
        let path = staging_path(target_path);

        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path.as_path())?;

        Ok(Self {
            path,
            persisted: false,
        })
    }

    fn persist(mut self, target_path: &Path) -> io::Result<()> {
        fs::rename(self.path.as_path(), target_path)?;
        self.persisted = true;

        Ok(())
    }
}

impl Drop for StagingFile {
    fn drop(&mut self) {
        if !self.persisted {
            let _ = fs::remove_file(self.path.as_path());
        }
    }
}

/// The suffix must leave a non-Markdown extension in place: `folder::watch` treats an event path
/// it cannot stat as relevant when the path has no extension, so an extension-less staging name
/// would refresh the article navigator on every save.
fn staging_path(target_path: &Path) -> PathBuf {
    let staging_file_id = NEXT_STAGING_FILE_ID.fetch_add(1, Ordering::Relaxed);
    let mut file_name = target_path.file_name().unwrap_or_default().to_os_string();

    file_name.push(format!(
        ".{:x}-{staging_file_id:x}.leafdown-tmp",
        std::process::id()
    ));

    target_path.with_file_name(file_name)
}

#[cfg(test)]
mod tests {
    use std::assert_matches;
    use std::{fs, io::ErrorKind, path::Path};

    use super::{ReadUtf8FileError, read_utf8_file_with_size_limit, write_file_atomically};
    use crate::test_utils::TestDirectory;

    fn staging_file_names(directory: &Path) -> Vec<String> {
        fs::read_dir(directory)
            .expect("test directory should be listed")
            .map(|entry| {
                entry
                    .expect("test directory entry should be read")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .filter(|file_name| file_name.ends_with(".leafdown-tmp"))
            .collect()
    }

    #[test]
    fn reads_utf8_file_content() {
        let folder = TestDirectory::new("read-utf8-file");
        let path = folder.write_file_with_content("docs/readme.md", "# Leafdown\n");

        assert_eq!(
            read_utf8_file_with_size_limit(path.as_path(), 1024).unwrap(),
            "# Leafdown\n",
        );
    }

    #[test]
    fn rejects_files_larger_than_the_size_limit() {
        let folder = TestDirectory::new("read-utf8-file-large");
        let path = folder.write_file_with_content("docs/readme.md", "large");
        let Err(ReadUtf8FileError::Oversized {
            size_bytes,
            max_size_bytes,
        }) = read_utf8_file_with_size_limit(path.as_path(), 4)
        else {
            panic!("expected oversized file error");
        };

        assert_eq!(size_bytes, 5);
        assert_eq!(max_size_bytes, 4);
    }

    #[test]
    fn rejects_invalid_utf8_content() {
        let folder = TestDirectory::new("read-utf8-file-invalid");
        let path = folder.path("invalid.md");
        fs::write(path.as_path(), [0xff, 0xfe]).unwrap();

        assert_matches!(
            read_utf8_file_with_size_limit(path.as_path(), 1024),
            Err(ReadUtf8FileError::InvalidEncoding),
        );
    }

    #[test]
    fn replaces_existing_file_contents() {
        let folder = TestDirectory::new("write-atomically-replace");
        let path = folder.write_file_with_content("readme.md", "old content");

        write_file_atomically(path.as_path(), b"# Leafdown\n").expect("file should be replaced");

        assert_eq!(fs::read_to_string(path.as_path()).unwrap(), "# Leafdown\n");
        assert!(staging_file_names(folder.path.as_path()).is_empty());
    }

    #[test]
    fn creates_missing_files() {
        let folder = TestDirectory::new("write-atomically-create");
        let path = folder.path("readme.md");

        write_file_atomically(path.as_path(), b"# Leafdown\n").expect("file should be created");

        assert_eq!(fs::read_to_string(path.as_path()).unwrap(), "# Leafdown\n");
        assert!(staging_file_names(folder.path.as_path()).is_empty());
    }

    #[test]
    fn reports_missing_parent_directories_as_not_found() {
        let folder = TestDirectory::new("write-atomically-missing-parent");
        let path = folder.path("missing/readme.md");

        let error =
            write_file_atomically(path.as_path(), b"# Leafdown\n").expect_err("write should fail");

        assert_eq!(error.kind(), ErrorKind::NotFound);
    }

    #[test]
    fn removes_the_staging_file_when_the_target_cannot_be_replaced() {
        let folder = TestDirectory::new("write-atomically-blocked-rename");
        let path = folder.create_directory("readme.md");

        write_file_atomically(path.as_path(), b"# Leafdown\n")
            .expect_err("renaming over a directory should fail");

        assert!(path.is_dir());
        assert!(staging_file_names(folder.path.as_path()).is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn keeps_the_original_contents_when_the_target_is_locked() {
        use std::os::windows::fs::OpenOptionsExt;

        let folder = TestDirectory::new("write-atomically-locked-target");
        let path = folder.write_file_with_content("readme.md", "old content");

        {
            let _lock = fs::OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(path.as_path())
                .expect("test file should be locked");

            write_file_atomically(path.as_path(), b"# Leafdown\n")
                .expect_err("replacing a locked file should fail");

            assert!(staging_file_names(folder.path.as_path()).is_empty());
        }

        assert_eq!(fs::read_to_string(path.as_path()).unwrap(), "old content");
    }
}
