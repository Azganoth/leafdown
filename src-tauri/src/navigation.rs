use tauri::{
    Runtime, Url,
    plugin::{Builder, TauriPlugin},
};

const LOCAL_HOST_SUFFIX: &str = ".localhost";
const LOCAL_HOSTS: [&str; 3] = ["localhost", "127.0.0.1", "[::1]"];

pub(crate) fn build_navigation_guard_plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("leafdown-navigation-guard")
        .on_navigation(|_webview, url| {
            if is_remote_navigation(url) {
                log::warn!(
                    "blocked webview navigation to a remote origin: {}",
                    url.as_str()
                );
                return false;
            }

            true
        })
        .build()
}

fn is_remote_navigation(url: &Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }

    url.host_str()
        .is_none_or(|host| !(LOCAL_HOSTS.contains(&host) || host.ends_with(LOCAL_HOST_SUFFIX)))
}

#[cfg(test)]
mod tests {
    use tauri::Url;

    use super::is_remote_navigation;

    fn parsed(url: &str) -> Url {
        Url::parse(url).expect("test URL should parse")
    }

    #[test]
    fn allows_local_frontend_origins() {
        for url in [
            "tauri://localhost",
            "tauri://localhost/index.html",
            "http://tauri.localhost/",
            "https://tauri.localhost/index.html",
            "http://localhost:1420/",
            "http://127.0.0.1:1420/",
            "http://asset.localhost/C%3A%2FNotes%2Ficon.png",
        ] {
            assert!(!is_remote_navigation(&parsed(url)), "{url}");
        }
    }

    #[test]
    fn denies_remote_origins() {
        for url in [
            "http://example.com/",
            "https://example.com/steal",
            "https://localhost.example.com/",
            "https://tauri.localhost.example.com/",
        ] {
            assert!(is_remote_navigation(&parsed(url)), "{url}");
        }
    }
}
