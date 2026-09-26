// Measurement probe mounted as a child of `folder::watch` through a `#[path]` module. See README.md.
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use notify::{EventKind, RecursiveMode, Watcher};

use super::relevant_event_paths;
use crate::folder::defaults::ignored_directories;

#[derive(Default)]
struct Counters {
    first_at: Option<Instant>,
    last_at: Option<Instant>,
    raw: usize,
    creates: usize,
    removes: usize,
    modifies: usize,
    renames: usize,
    others: usize,
    relevant_emits: usize,
    root_paths: usize,
    errors: usize,
    callback_ns: u128,
}

fn env_path(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("{name} is required")))
}

fn wait_quiet(counters: &Arc<Mutex<Counters>>, quiet: Duration, max: Duration) {
    let started = Instant::now();
    loop {
        thread::sleep(Duration::from_millis(50));
        let last = counters.lock().unwrap().last_at;
        let idle = last.map_or(started.elapsed(), |last| last.elapsed());
        if idle >= quiet || started.elapsed() >= max {
            return;
        }
    }
}

#[test]
#[ignore = "perf probe"]
fn perf_probe_watch() {
    let fixture = env_path("PERF_WATCH_FIXTURE");
    let out_dir = env_path("PERF_OUT");
    let mut log = fs::File::create(out_dir.join("watch.jsonl")).unwrap();
    let ignored = ignored_directories();
    let counters = Arc::new(Mutex::new(Counters::default()));

    let probe_root = fixture.join("zz-watch-probe");
    let ignored_root = fixture.join("node_modules").join("zz-watch-probe");
    let _ = fs::remove_dir_all(&probe_root);
    let _ = fs::remove_dir_all(&ignored_root);

    let handler_counters = Arc::clone(&counters);
    let handler_fixture = fixture.clone();
    let setup_started = Instant::now();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let started = Instant::now();
        let mut counters = handler_counters.lock().unwrap();
        counters.first_at.get_or_insert(started);
        counters.last_at = Some(started);
        match result {
            Ok(event) => {
                counters.raw += 1;
                match event.kind {
                    EventKind::Create(_) => counters.creates += 1,
                    EventKind::Remove(_) => counters.removes += 1,
                    EventKind::Modify(notify::event::ModifyKind::Name(_)) => counters.renames += 1,
                    EventKind::Modify(_) => counters.modifies += 1,
                    _ => counters.others += 1,
                }
                if event.paths.iter().any(|path| path == &handler_fixture) {
                    counters.root_paths += 1;
                }
                if !relevant_event_paths(&event, &handler_fixture, &ignored).is_empty() {
                    counters.relevant_emits += 1;
                }
            }
            Err(_) => counters.errors += 1,
        }
        counters.callback_ns += started.elapsed().as_nanos();
    })
    .unwrap();
    watcher.watch(&fixture, RecursiveMode::Recursive).unwrap();
    let setup_ms = setup_started.elapsed().as_secs_f64() * 1000.0;
    writeln!(
        log,
        r#"{{"op":"setup","fixture":"{}","setupMs":{setup_ms:.2}}}"#,
        fixture.display().to_string().replace('\\', "/")
    )
    .unwrap();

    let mut run = |name: &str, expected: usize, action: &mut dyn FnMut()| {
        *counters.lock().unwrap() = Counters::default();
        let started = Instant::now();
        action();
        let action_ms = started.elapsed().as_secs_f64() * 1000.0;
        wait_quiet(
            &counters,
            Duration::from_millis(1500),
            Duration::from_secs(60),
        );
        let c = counters.lock().unwrap();
        let first_ms = c
            .first_at
            .map_or(-1.0, |at| (at - started).as_secs_f64() * 1000.0);
        let last_ms = c
            .last_at
            .map_or(-1.0, |at| (at - started).as_secs_f64() * 1000.0);
        writeln!(
            log,
            r#"{{"op":"{name}","expectedChanges":{expected},"actionMs":{action_ms:.1},"firstEventMs":{first_ms:.1},"lastEventMs":{last_ms:.1},"raw":{},"creates":{},"removes":{},"modifies":{},"renames":{},"others":{},"relevantEmits":{},"rootPathEvents":{},"errors":{},"callbackTotalMs":{:.1}}}"#,
            c.raw, c.creates, c.removes, c.modifies, c.renames, c.others, c.relevant_emits,
            c.root_paths, c.errors, c.callback_ns as f64 / 1e6
        )
        .unwrap();
        log.flush().unwrap();
    };

    fs::create_dir_all(&probe_root).unwrap();
    thread::sleep(Duration::from_millis(1500));

    let one = probe_root.join("one.md");
    let two = probe_root.join("two.md");
    run("singleCreate", 1, &mut || {
        fs::write(&one, "# one\n").unwrap()
    });
    run("singleRename", 1, &mut || fs::rename(&one, &two).unwrap());
    run("singleDelete", 1, &mut || fs::remove_file(&two).unwrap());

    let write_many = |dir: &Path, count: usize, extension: &str| {
        fs::create_dir_all(dir).unwrap();
        for index in 0..count {
            fs::write(
                dir.join(format!("burst-file-{index:05}.{extension}")),
                "# x\n",
            )
            .unwrap();
        }
    };

    for count in [100, 1_000, 10_000] {
        let dir = probe_root.join(format!("burst-{count}"));
        run(&format!("burstCreateMarkdown{count}"), count, &mut || {
            write_many(&dir, count, "md")
        });
    }

    let modify_dir = probe_root.join("burst-1000");
    run("burstModifyMarkdown1000", 1_000, &mut || {
        for index in 0..1_000 {
            fs::write(
                modify_dir.join(format!("burst-file-{index:05}.md")),
                "# y\n",
            )
            .unwrap();
        }
    });

    let unsupported_dir = probe_root.join("unsupported");
    run("burstCreateUnsupported1000", 1_000, &mut || {
        write_many(&unsupported_dir, 1_000, "txt")
    });
    run("burstCreateIgnored1000", 1_000, &mut || {
        write_many(&ignored_root, 1_000, "md")
    });

    let delete_dir = probe_root.join("burst-10000");
    run("deleteDirectory10000", 10_000, &mut || {
        fs::remove_dir_all(&delete_dir).unwrap()
    });

    drop(watcher);
    let _ = fs::remove_dir_all(&probe_root);
    let _ = fs::remove_dir_all(&ignored_root);
}

// Counts (never records) events under a watched path for a fixed window.
#[test]
#[ignore = "perf probe"]
fn perf_probe_observe() {
    let path = env_path("PERF_OBSERVE_PATH");
    let seconds: u64 = std::env::var("PERF_OBSERVE_SECS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(30);
    let out_dir = env_path("PERF_OUT");
    let ignored = ignored_directories();
    let counters = Arc::new(Mutex::new(Counters::default()));
    let handler_counters = Arc::clone(&counters);
    let handler_path = path.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let started = Instant::now();
        let mut counters = handler_counters.lock().unwrap();
        match result {
            Ok(event) => {
                counters.raw += 1;
                let relevant = relevant_event_paths(&event, &handler_path, &ignored);
                if !relevant.is_empty() {
                    counters.relevant_emits += 1;
                    if relevant
                        .iter()
                        .any(|path| crate::document::is_supported_markdown_path(Path::new(path)))
                    {
                        counters.creates += 1;
                    }
                }
            }
            Err(_) => counters.errors += 1,
        }
        counters.callback_ns += started.elapsed().as_nanos();
    })
    .unwrap();
    watcher.watch(&path, RecursiveMode::Recursive).unwrap();
    thread::sleep(Duration::from_secs(seconds));
    drop(watcher);
    let c = counters.lock().unwrap();
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(out_dir.join("observe.jsonl"))
        .unwrap();
    writeln!(
        log,
        r#"{{"path":"{}","seconds":{seconds},"raw":{},"relevantEmits":{},"relevantWithMarkdownPath":{},"errors":{},"callbackTotalMs":{:.1}}}"#,
        path.display().to_string().replace('\\', "/"),
        c.raw, c.relevant_emits, c.creates, c.errors, c.callback_ns as f64 / 1e6
    )
    .unwrap();
}
