use std::{fs, path::Path, time::{Instant, SystemTime}};

fn walk(path: &Path, from_entry: bool, out: &mut Vec<(String, SystemTime)>) {
    for entry in fs::read_dir(path).unwrap().flatten() {
        let file_type = entry.file_type().unwrap();
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if file_type.is_dir() && (name == "node_modules" || name == ".git") {
            continue;
        }
        let entry_path = entry.path();
        let modified = if from_entry {
            entry.metadata().unwrap().modified().unwrap()
        } else {
            fs::metadata(&entry_path).unwrap().modified().unwrap()
        };
        out.push((entry_path.to_string_lossy().into_owned(), modified));
        if file_type.is_dir() {
            walk(&entry_path, from_entry, out);
        }
    }
}

fn main() {
    for fixture in std::env::args().skip(1) {
        let mut results = Vec::new();
        for from_entry in [true, false, true, false] {
            let mut out = Vec::new();
            let started = Instant::now();
            walk(Path::new(&fixture), from_entry, &mut out);
            results.push((from_entry, started.elapsed().as_secs_f64() * 1000.0, out));
        }
        let identical = results[0].2 == results[1].2;
        println!(
            "{{\"fixture\":\"{}\",\"entries\":{},\"dirEntryMetadataMs\":[{:.0},{:.0}],\"pathMetadataMs\":[{:.0},{:.0}],\"identicalTimes\":{identical}}}",
            fixture.replace('\\', "/"), results[0].2.len(), results[0].1, results[2].1, results[1].1, results[3].1
        );
    }
}
