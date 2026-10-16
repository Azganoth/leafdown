use reqwest::{
    Response, StatusCode,
    header::{ACCEPT, HeaderMap, HeaderName, HeaderValue, RETRY_AFTER},
    redirect,
};
use semver::Version;
use serde::{Deserialize, Serialize};

use crate::remote_image::{FetchPolicy, describe_error_chain, public_client_builder};

const RELEASES_ENDPOINT: &str = "https://api.github.com/repos/Azganoth/leafdown/releases";
const RELEASE_PAGE_PREFIX: &str = "https://github.com/Azganoth/leafdown/releases/tag/";
const MAX_RELEASE_LIST_BYTES: usize = 4 * 1024 * 1024;
const GITHUB_JSON: &str = "application/vnd.github+json";
const GITHUB_API_VERSION: &str = "2022-11-28";
const RATE_LIMIT_REMAINING: HeaderName = HeaderName::from_static("x-ratelimit-remaining");
// The comparison is local, so the request does not carry the running version.
const USER_AGENT: &str = "Leafdown";

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum UpdateCheck {
    UpToDate {
        current_version: String,
    },
    Available {
        current_version: String,
        version: String,
        release_url: String,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum CheckForUpdatesError {
    Network,
    Timeout,
    RateLimited,
    UnexpectedResponse,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

#[tauri::command]
pub(crate) async fn check_for_updates(
    app: tauri::AppHandle,
) -> Result<UpdateCheck, CheckForUpdatesError> {
    let current = app.package_info().version.clone();

    check_release_list(RELEASES_ENDPOINT, &FetchPolicy::for_app(), &current).await
}

async fn check_release_list(
    endpoint: &str,
    policy: &FetchPolicy,
    current: &Version,
) -> Result<UpdateCheck, CheckForUpdatesError> {
    let client = build_client(policy)?;
    let mut response = client
        .get(endpoint)
        .send()
        .await
        .map_err(classify_request_error)?;
    let status = response.status();

    if is_rate_limited(&response) {
        return Err(CheckForUpdatesError::RateLimited);
    }

    if !status.is_success() {
        log::warn!("release list request returned {status}");
        return Err(CheckForUpdatesError::UnexpectedResponse);
    }

    let mut body = Vec::new();

    while let Some(chunk) = response.chunk().await.map_err(classify_request_error)? {
        if body.len() + chunk.len() > MAX_RELEASE_LIST_BYTES {
            log::warn!("release list exceeded {MAX_RELEASE_LIST_BYTES} bytes");
            return Err(CheckForUpdatesError::UnexpectedResponse);
        }

        body.extend_from_slice(&chunk);
    }

    let releases: Vec<Release> = serde_json::from_slice(&body).map_err(|error| {
        log::warn!("release list could not be read: {error}");
        CheckForUpdatesError::UnexpectedResponse
    })?;

    Ok(select_update(&releases, current))
}

fn build_client(policy: &FetchPolicy) -> Result<reqwest::Client, CheckForUpdatesError> {
    let mut headers = HeaderMap::new();

    headers.insert(ACCEPT, HeaderValue::from_static(GITHUB_JSON));
    headers.insert(
        HeaderName::from_static("x-github-api-version"),
        HeaderValue::from_static(GITHUB_API_VERSION),
    );

    public_client_builder(policy)
        .redirect(redirect::Policy::none())
        .user_agent(USER_AGENT)
        .default_headers(headers)
        .build()
        .map_err(|error| {
            log::warn!("update check client could not be built: {error}");
            CheckForUpdatesError::Network
        })
}

// GitHub answers an exhausted or secondary rate limit with 403 or 429, and only its
// headers tell a limited 403 apart from a refusal.
fn is_rate_limited(response: &Response) -> bool {
    let headers = response.headers();

    match response.status() {
        StatusCode::TOO_MANY_REQUESTS => true,
        StatusCode::FORBIDDEN => {
            headers.contains_key(RETRY_AFTER)
                || headers
                    .get(RATE_LIMIT_REMAINING)
                    .is_some_and(|remaining| remaining.as_bytes() == b"0")
        }
        _ => false,
    }
}

fn classify_request_error(error: reqwest::Error) -> CheckForUpdatesError {
    if error.is_timeout() {
        return CheckForUpdatesError::Timeout;
    }

    log::warn!(
        "release list request failed: {}",
        describe_error_chain(&error.without_url())
    );

    CheckForUpdatesError::Network
}

/// A pre-release build follows every release; a stable build follows only stable ones.
fn select_update(releases: &[Release], current: &Version) -> UpdateCheck {
    let follows_prereleases = !current.pre.is_empty();
    let newest = releases
        .iter()
        .filter(|release| !release.draft)
        .filter_map(|release| Some((release, release_version(release.tag_name.as_str())?)))
        .filter(|(release, version)| {
            follows_prereleases || (!release.prerelease && version.pre.is_empty())
        })
        .filter(|(_, version)| version.cmp_precedence(current).is_gt())
        .max_by(|(_, left), (_, right)| left.cmp_precedence(right));

    match newest {
        Some((release, version)) => UpdateCheck::Available {
            current_version: current.to_string(),
            version: version.to_string(),
            release_url: format!("{RELEASE_PAGE_PREFIX}{}", release.tag_name),
        },
        None => UpdateCheck::UpToDate {
            current_version: current.to_string(),
        },
    }
}

fn release_version(tag: &str) -> Option<Version> {
    Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok()
}

#[cfg(test)]
mod tests {
    use semver::Version;

    use super::{
        CheckForUpdatesError, GITHUB_API_VERSION, GITHUB_JSON, MAX_RELEASE_LIST_BYTES, Release,
        USER_AGENT, UpdateCheck, check_release_list, select_update,
    };
    use crate::{
        remote_image::FetchPolicy,
        test_http_server::{Reply, TestServer, header_value},
    };

    fn release(tag: &str, prerelease: bool) -> Release {
        Release {
            tag_name: tag.to_owned(),
            draft: false,
            prerelease,
        }
    }

    fn draft(tag: &str) -> Release {
        Release {
            draft: true,
            ..release(tag, true)
        }
    }

    fn offered(releases: &[Release], current: &str) -> Option<String> {
        match select_update(releases, &Version::parse(current).unwrap()) {
            UpdateCheck::Available { version, .. } => Some(version),
            UpdateCheck::UpToDate { .. } => None,
        }
    }

    fn check(
        server: &TestServer,
        path: &str,
        current: &str,
    ) -> Result<UpdateCheck, CheckForUpdatesError> {
        tauri::async_runtime::block_on(check_release_list(
            server.url(path).as_str(),
            &FetchPolicy::for_test(),
            &Version::parse(current).unwrap(),
        ))
    }

    fn json(body: &str) -> Reply {
        Reply::ok("application/json", body.as_bytes())
    }

    fn status(status: &'static str, headers: Vec<(&'static str, String)>) -> Reply {
        Reply::Full {
            status,
            headers,
            body: b"{\"message\":\"refused\"}".to_vec(),
        }
    }

    #[test]
    fn compares_releases_by_semver_precedence() {
        let releases = [
            release("v0.1.0-alpha.3", true),
            release("v0.1.0-alpha.10", true),
            release("v0.1.0-alpha.4", true),
        ];

        assert_eq!(
            offered(&releases, "0.1.0-alpha.3"),
            Some("0.1.0-alpha.10".to_owned())
        );
        assert_eq!(offered(&releases, "0.1.0-alpha.10"), None);
        assert_eq!(
            offered(
                &[release("v0.1.0", false), release("v0.1.0-beta.1", true)],
                "0.1.0-alpha.4"
            ),
            Some("0.1.0".to_owned())
        );
        assert_eq!(offered(&[release("v0.1.0-rc.1", true)], "0.1.0"), None);
        assert_eq!(
            offered(&[release("v0.1.0+build.2", false)], "0.1.0+build.1"),
            None
        );
    }

    #[test]
    fn offers_a_prerelease_build_the_newest_release_of_any_kind() {
        assert_eq!(
            offered(
                &[release("v0.1.0", false), release("v0.2.0-alpha.1", true)],
                "0.1.0-alpha.3"
            ),
            Some("0.2.0-alpha.1".to_owned())
        );
        assert_eq!(
            offered(
                &[release("v0.1.0-alpha.4", true), release("v0.1.0", false)],
                "0.1.0-alpha.3"
            ),
            Some("0.1.0".to_owned())
        );
    }

    #[test]
    fn offers_a_stable_build_only_newer_stable_releases() {
        assert_eq!(
            offered(
                &[release("v0.2.0-alpha.1", true), release("v0.1.1", false)],
                "0.1.0"
            ),
            Some("0.1.1".to_owned())
        );
        assert_eq!(offered(&[release("v0.2.0-alpha.1", true)], "0.1.0"), None);
        assert_eq!(offered(&[release("v0.2.0", true)], "0.1.0"), None);
        assert_eq!(offered(&[release("v0.2.0-rc.1", false)], "0.1.0"), None);
    }

    #[test]
    fn never_offers_a_draft_or_an_unversioned_tag() {
        assert_eq!(offered(&[draft("v0.1.0-alpha.4")], "0.1.0-alpha.3"), None);
        assert_eq!(
            offered(
                &[release("nightly", true), release("archive/spike", true)],
                "0.1.0-alpha.3"
            ),
            None
        );
    }

    #[test]
    fn links_the_offered_release_page_by_its_tag() {
        assert_eq!(
            select_update(
                &[release("v0.1.0-alpha.4", true)],
                &Version::parse("0.1.0-alpha.3").unwrap()
            ),
            UpdateCheck::Available {
                current_version: "0.1.0-alpha.3".to_owned(),
                version: "0.1.0-alpha.4".to_owned(),
                release_url: "https://github.com/Azganoth/leafdown/releases/tag/v0.1.0-alpha.4"
                    .to_owned(),
            }
        );
    }

    #[test]
    fn reads_the_release_list_and_skips_drafts() {
        let server = TestServer::start(|_, _| {
            json(
                r#"[
                    {"tag_name":"v0.1.0-alpha.5","draft":true,"prerelease":true,"html_url":"https://example.com"},
                    {"tag_name":"v0.1.0-alpha.4","draft":false,"prerelease":true,"body":"Notes"},
                    {"tag_name":"v0.1.0-alpha.3","draft":false,"prerelease":true}
                ]"#,
            )
        });

        assert_eq!(
            check(&server, "/releases", "0.1.0-alpha.3"),
            Ok(UpdateCheck::Available {
                current_version: "0.1.0-alpha.3".to_owned(),
                version: "0.1.0-alpha.4".to_owned(),
                release_url: "https://github.com/Azganoth/leafdown/releases/tag/v0.1.0-alpha.4"
                    .to_owned(),
            })
        );
        assert_eq!(
            check(&server, "/releases", "0.1.0-alpha.4"),
            Ok(UpdateCheck::UpToDate {
                current_version: "0.1.0-alpha.4".to_owned(),
            })
        );
        assert_eq!(
            check(&server, "/releases", "0.1.0"),
            Ok(UpdateCheck::UpToDate {
                current_version: "0.1.0".to_owned(),
            })
        );
    }

    #[test]
    fn sends_only_the_request_and_an_unversioned_user_agent() {
        let server = TestServer::start(|_, _| json("[]"));

        assert!(
            check(
                &server,
                "/repos/Azganoth/leafdown/releases",
                "0.1.0-alpha.3"
            )
            .is_ok()
        );

        let requests = server.requests();

        assert_eq!(requests.len(), 1);
        assert!(
            requests[0].starts_with("GET /repos/Azganoth/leafdown/releases HTTP/1.1\r\n"),
            "{}",
            requests[0]
        );
        assert_eq!(header_value(&requests[0], "User-Agent"), Some(USER_AGENT));
        assert_eq!(header_value(&requests[0], "Accept"), Some(GITHUB_JSON));
        assert_eq!(
            header_value(&requests[0], "X-GitHub-Api-Version"),
            Some(GITHUB_API_VERSION)
        );
        assert_eq!(header_value(&requests[0], "Referer"), None);
        assert_eq!(header_value(&requests[0], "Cookie"), None);
        assert!(!requests[0].contains("alpha"), "{}", requests[0]);
    }

    #[test]
    fn reports_rate_limits_separately_from_other_refusals() {
        let server = TestServer::start(|path, _| match path {
            "/exhausted" => status(
                "403 Forbidden",
                vec![("X-RateLimit-Remaining", "0".to_owned())],
            ),
            "/secondary" => status("403 Forbidden", vec![("Retry-After", "60".to_owned())]),
            "/too-many" => status("429 Too Many Requests", Vec::new()),
            _ => status(
                "403 Forbidden",
                vec![("X-RateLimit-Remaining", "59".to_owned())],
            ),
        });

        for path in ["/exhausted", "/secondary", "/too-many"] {
            assert_eq!(
                check(&server, path, "0.1.0-alpha.3"),
                Err(CheckForUpdatesError::RateLimited),
                "{path}"
            );
        }

        assert_eq!(
            check(&server, "/refused", "0.1.0-alpha.3"),
            Err(CheckForUpdatesError::UnexpectedResponse)
        );
    }

    #[test]
    fn reports_unexpected_responses() {
        let server = TestServer::start(|path, port| match path {
            "/missing" => status("404 Not Found", Vec::new()),
            "/error" => status("500 Internal Server Error", Vec::new()),
            "/moved" => Reply::redirect(format!("http://127.0.0.1:{port}/releases")),
            "/html" => Reply::ok("text/html", b"<!doctype html><title>Sign in</title>"),
            "/object" => json(r#"{"message":"Not Found"}"#),
            _ => Reply::Chunked {
                chunk: vec![b' '; 1024 * 1024],
                count: MAX_RELEASE_LIST_BYTES / (1024 * 1024) + 1,
            },
        });

        for path in ["/missing", "/error", "/moved", "/html", "/object", "/huge"] {
            assert_eq!(
                check(&server, path, "0.1.0-alpha.3"),
                Err(CheckForUpdatesError::UnexpectedResponse),
                "{path}"
            );
        }

        assert_eq!(server.requests().len(), 6);
    }

    #[test]
    fn reports_a_stalled_response_as_a_timeout() {
        let server = TestServer::start(|_, _| Reply::Stall);

        assert_eq!(
            check(&server, "/releases", "0.1.0-alpha.3"),
            Err(CheckForUpdatesError::Timeout)
        );
    }

    #[test]
    fn reports_a_dropped_connection_as_a_network_failure() {
        let server = TestServer::start(|_, _| Reply::Hangup);

        assert_eq!(
            check(&server, "/releases", "0.1.0-alpha.3"),
            Err(CheckForUpdatesError::Network)
        );
    }

    #[test]
    fn serializes_results_and_errors_with_stable_kinds() {
        assert_eq!(
            serde_json::to_value(UpdateCheck::Available {
                current_version: "0.1.0-alpha.3".to_owned(),
                version: "0.1.0-alpha.4".to_owned(),
                release_url: "https://github.com/Azganoth/leafdown/releases/tag/v0.1.0-alpha.4"
                    .to_owned(),
            })
            .unwrap(),
            serde_json::json!({
                "kind": "available",
                "currentVersion": "0.1.0-alpha.3",
                "version": "0.1.0-alpha.4",
                "releaseUrl": "https://github.com/Azganoth/leafdown/releases/tag/v0.1.0-alpha.4",
            })
        );
        assert_eq!(
            serde_json::to_value(UpdateCheck::UpToDate {
                current_version: "0.1.0".to_owned(),
            })
            .unwrap(),
            serde_json::json!({ "kind": "upToDate", "currentVersion": "0.1.0" })
        );
        assert_eq!(
            serde_json::to_value(CheckForUpdatesError::RateLimited).unwrap(),
            serde_json::json!({ "kind": "rateLimited" })
        );
        assert_eq!(
            serde_json::to_value(CheckForUpdatesError::UnexpectedResponse).unwrap(),
            serde_json::json!({ "kind": "unexpectedResponse" })
        );
    }
}
