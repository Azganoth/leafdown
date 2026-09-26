// Measurement probe mounted as a child of `folder` through a `#[path]` module. See README.md.
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::Instant,
};

use super::{FileTreeSortOrder, MarkdownFolderTreeNode, defaults::ignored_directories, scan};

fn env_path(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("{name} is required")))
}

fn stats(mut samples: Vec<f64>) -> (f64, f64, f64) {
    samples.sort_by(f64::total_cmp);
    (
        samples[0],
        samples[samples.len() / 2],
        samples[samples.len() - 1],
    )
}

fn count_nodes(children: &[MarkdownFolderTreeNode], files: &mut usize, dirs: &mut usize) {
    for child in children {
        match child {
            MarkdownFolderTreeNode::File { .. } => *files += 1,
            MarkdownFolderTreeNode::Directory { children, .. } => {
                *dirs += 1;
                count_nodes(children, files, dirs);
            }
        }
    }
}

// Enumeration alone, with the same ignore and symlink rules, to separate directory
// reads from tree building and sorting.
fn walk(path: &Path, ignored: &[String], entries: &mut usize, markdown: &mut usize) {
    for entry in fs::read_dir(path).unwrap().flatten() {
        *entries += 1;
        let file_type = entry.file_type().unwrap();
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if scan::is_ignored_directory(entry.file_name().to_string_lossy().as_ref(), ignored) {
                continue;
            }
            walk(&entry.path(), ignored, entries, markdown);
        } else if crate::document::is_supported_markdown_path(&entry.path()) {
            *markdown += 1;
        }
    }
}

#[test]
#[ignore = "perf probe"]
fn perf_probe_scan() {
    let fixtures = env_path("PERF_FIXTURES");
    let out_dir = env_path("PERF_OUT");
    let iterations: usize = std::env::var("PERF_ITERATIONS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(5);
    fs::create_dir_all(out_dir.join("trees")).unwrap();
    let mut log = fs::File::create(out_dir.join("scan.jsonl")).unwrap();
    let ignored = ignored_directories();

    let mut fixture_dirs: Vec<PathBuf> = fs::read_dir(&fixtures)
        .unwrap()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    fixture_dirs.sort();

    for fixture in fixture_dirs {
        let name = fixture.file_name().unwrap().to_string_lossy().into_owned();

        let mut walk_samples = Vec::new();
        let (mut entries, mut markdown) = (0, 0);
        for iteration in 0..=iterations {
            entries = 0;
            markdown = 0;
            let started = Instant::now();
            walk(&fixture, &ignored, &mut entries, &mut markdown);
            if iteration > 0 {
                walk_samples.push(started.elapsed().as_secs_f64() * 1000.0);
            }
        }
        let (walk_min, walk_median, walk_max) = stats(walk_samples);
        writeln!(
            log,
            r#"{{"fixture":"{name}","op":"walk","entries":{entries},"markdown":{markdown},"minMs":{walk_min:.2},"medianMs":{walk_median:.2},"maxMs":{walk_max:.2}}}"#
        )
        .unwrap();

        for (sort_name, sort_order) in [
            ("name", FileTreeSortOrder::Name),
            ("modifiedDate", FileTreeSortOrder::ModifiedDate),
            ("type", FileTreeSortOrder::Type),
        ] {
            let mut scan_samples = Vec::new();
            let mut serialize_samples = Vec::new();
            let mut json = String::new();
            let (mut files, mut dirs) = (0, 0);

            for iteration in 0..=iterations {
                let started = Instant::now();
                let result = scan::scan_folder(&fixture, &ignored, sort_order).unwrap();
                let scanned = started.elapsed().as_secs_f64() * 1000.0;

                let started = Instant::now();
                json = serde_json::to_string(&result).unwrap();
                let serialized = started.elapsed().as_secs_f64() * 1000.0;

                if iteration > 0 {
                    scan_samples.push(scanned);
                    serialize_samples.push(serialized);
                }
                files = 0;
                dirs = 0;
                count_nodes(&result.tree.children, &mut files, &mut dirs);
            }

            let (scan_min, scan_median, scan_max) = stats(scan_samples);
            let (_, serialize_median, _) = stats(serialize_samples);
            writeln!(
                log,
                r#"{{"fixture":"{name}","op":"scan","sort":"{sort_name}","files":{files},"dirs":{dirs},"jsonBytes":{},"minMs":{scan_min:.2},"medianMs":{scan_median:.2},"maxMs":{scan_max:.2},"serializeMedianMs":{serialize_median:.2}}}"#,
                json.len()
            )
            .unwrap();

            if sort_name == "name" {
                fs::write(out_dir.join("trees").join(format!("{name}.json")), &json).unwrap();
            }
        }
        log.flush().unwrap();
    }
}

// One scan of an arbitrary folder context (read-only), reporting counts and time only.
#[test]
#[ignore = "perf probe"]
fn perf_probe_scan_path() {
    let path = env_path("PERF_SCAN_PATH");
    let out_dir = env_path("PERF_OUT");
    let ignored = ignored_directories();
    let started = Instant::now();
    let result = super::scan_folder(&path, ignored.clone(), FileTreeSortOrder::Name).unwrap();
    let scan_ms = started.elapsed().as_secs_f64() * 1000.0;
    let json_bytes = serde_json::to_string(&result).unwrap().len();
    let (mut files, mut dirs) = (0, 0);
    count_nodes(&result.tree.children, &mut files, &mut dirs);
    let (mut entries, mut markdown) = (0, 0);
    let started = Instant::now();
    walk_lenient(&path, &ignored, &mut entries, &mut markdown);
    let walk_ms = started.elapsed().as_secs_f64() * 1000.0;
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(out_dir.join("scan-path.jsonl"))
        .unwrap();
    writeln!(
        log,
        r#"{{"path":"{}","scanMs":{scan_ms:.0},"secondWalkMs":{walk_ms:.0},"entries":{entries},"files":{files},"dirs":{dirs},"warnings":{},"jsonBytes":{json_bytes}}}"#,
        path.display().to_string().replace('\\', "/"),
        result.warnings.len()
    )
    .unwrap();
}

fn walk_lenient(path: &Path, ignored: &[String], entries: &mut usize, markdown: &mut usize) {
    let Ok(read_dir) = fs::read_dir(path) else {
        return;
    };
    for entry in read_dir.flatten() {
        *entries += 1;
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if !scan::is_ignored_directory(entry.file_name().to_string_lossy().as_ref(), ignored) {
                walk_lenient(&entry.path(), ignored, entries, markdown);
            }
        } else if crate::document::is_supported_markdown_path(&entry.path()) {
            *markdown += 1;
        }
    }
}
