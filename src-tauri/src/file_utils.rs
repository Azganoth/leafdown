use std::{fs, io, path::Path};

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

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{read_utf8_file_with_size_limit, ReadUtf8FileError};
    use crate::test_utils::TestDirectory;

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

        assert!(matches!(
            read_utf8_file_with_size_limit(path.as_path(), 1024),
            Err(ReadUtf8FileError::InvalidEncoding),
        ));
    }
}
