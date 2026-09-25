use std::{
    error::Error as StdError,
    fmt,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    sync::Arc,
    time::Duration,
};

use reqwest::{
    Client, Url,
    dns::{Addrs, Name, Resolve, Resolving},
    header::{ACCEPT, HeaderMap, HeaderValue},
    redirect,
};
use serde::Serialize;
use tauri::ipc::Response;

const SECURE_SCHEME: &str = "https";
const MAX_REDIRECTS: usize = 5;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES: &str = "image/png,image/jpeg,image/gif,image/webp";
const USER_AGENT: &str = concat!("Leafdown/", env!("CARGO_PKG_VERSION"));

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum FetchRemoteImageError {
    InvalidTarget,
    InsecureScheme,
    BlockedDestination,
    InsecureRedirect,
    TooManyRedirects,
    HttpStatus { status: u16 },
    TooLarge,
    UnsupportedType,
    Timeout,
    Network,
}

struct FetchPolicy {
    scheme: &'static str,
    connect_timeout: Duration,
    request_timeout: Duration,
    trusted_host: Option<TrustedHost>,
    root_certificate: Option<reqwest::Certificate>,
}

// A name the resolver maps to a fixed address without classifying it. Only tests
// and the desktop E2E build construct one, so a loopback server can stand in for
// a public host.
#[derive(Clone)]
struct TrustedHost {
    name: String,
    address: IpAddr,
}

impl FetchPolicy {
    fn for_app() -> Self {
        let policy = Self {
            scheme: SECURE_SCHEME,
            connect_timeout: CONNECT_TIMEOUT,
            request_timeout: REQUEST_TIMEOUT,
            trusted_host: None,
            root_certificate: None,
        };

        #[cfg(feature = "desktop-e2e")]
        let policy = desktop_e2e::with_loopback_host(policy);

        policy
    }
}

#[derive(Debug)]
struct PolicyViolation(FetchRemoteImageError);

impl fmt::Display for PolicyViolation {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "remote image policy rejected the request: {:?}",
            self.0
        )
    }
}

impl StdError for PolicyViolation {}

#[tauri::command]
pub(crate) async fn fetch_remote_image(target: String) -> Result<Response, FetchRemoteImageError> {
    fetch_image_bytes(target.as_str(), &FetchPolicy::for_app())
        .await
        .map(Response::new)
}

/// The host a load action names before any request, or `None` when the target
/// is not one the fetch would attempt.
pub(crate) fn remote_image_host(target: &str) -> Option<String> {
    let url = parse_target(target, SECURE_SCHEME).ok()?;
    let host = url.host_str()?;

    Some(match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_owned(),
    })
}

fn parse_target(target: &str, scheme: &str) -> Result<Url, FetchRemoteImageError> {
    let url = Url::parse(target.trim()).map_err(|_| FetchRemoteImageError::InvalidTarget)?;

    if url.scheme() != scheme {
        return Err(FetchRemoteImageError::InsecureScheme);
    }

    if !url.username().is_empty() || url.password().is_some() || url.host_str().is_none() {
        return Err(FetchRemoteImageError::InvalidTarget);
    }

    Ok(url)
}

fn validate_redirect(url: &Url, scheme: &str) -> Result<(), FetchRemoteImageError> {
    if url.scheme() != scheme {
        return Err(FetchRemoteImageError::InsecureRedirect);
    }

    if !url.username().is_empty() || url.password().is_some() {
        return Err(FetchRemoteImageError::InvalidTarget);
    }

    validate_literal_address(url)
}

// The client does not consult the DNS resolver for IP literals, so the resolver's
// address filter never sees them.
fn validate_literal_address(url: &Url) -> Result<(), FetchRemoteImageError> {
    let Some(host) = url.host_str() else {
        return Err(FetchRemoteImageError::InvalidTarget);
    };
    let literal = host
        .strip_prefix('[')
        .and_then(|host| host.strip_suffix(']'))
        .unwrap_or(host);

    match literal.parse::<IpAddr>() {
        Ok(address) if !is_public_address(address) => {
            Err(FetchRemoteImageError::BlockedDestination)
        }
        _ => Ok(()),
    }
}

async fn fetch_image_bytes(
    target: &str,
    policy: &FetchPolicy,
) -> Result<Vec<u8>, FetchRemoteImageError> {
    let url = parse_target(target, policy.scheme)?;

    validate_literal_address(&url)?;

    let client = build_client(policy)?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(classify_request_error)?;
    let status = response.status();

    if !status.is_success() {
        return Err(FetchRemoteImageError::HttpStatus {
            status: status.as_u16(),
        });
    }

    if response
        .content_length()
        .is_some_and(|length| length > MAX_IMAGE_BYTES as u64)
    {
        return Err(FetchRemoteImageError::TooLarge);
    }

    let mut body = Vec::new();

    while let Some(chunk) = response.chunk().await.map_err(classify_request_error)? {
        if body.len() + chunk.len() > MAX_IMAGE_BYTES {
            return Err(FetchRemoteImageError::TooLarge);
        }

        body.extend_from_slice(&chunk);
    }

    if !has_supported_image_signature(&body) {
        return Err(FetchRemoteImageError::UnsupportedType);
    }

    Ok(body)
}

fn build_client(policy: &FetchPolicy) -> Result<Client, FetchRemoteImageError> {
    let scheme = policy.scheme;
    let redirect_policy = redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() > MAX_REDIRECTS {
            return attempt.error(PolicyViolation(FetchRemoteImageError::TooManyRedirects));
        }

        match validate_redirect(attempt.url(), scheme) {
            Ok(()) => attempt.follow(),
            Err(error) => attempt.error(PolicyViolation(error)),
        }
    });
    let mut headers = HeaderMap::new();

    headers.insert(ACCEPT, HeaderValue::from_static(ACCEPTED_IMAGE_TYPES));

    // A proxy resolves names outside the filtering resolver, so none is used.
    let builder = Client::builder()
        .no_proxy()
        .referer(false)
        .redirect(redirect_policy)
        .dns_resolver(Arc::new(PublicAddressResolver {
            trusted_host: policy.trusted_host.clone(),
        }))
        .connect_timeout(policy.connect_timeout)
        .timeout(policy.request_timeout)
        .user_agent(USER_AGENT)
        .default_headers(headers);
    let builder = match &policy.root_certificate {
        Some(certificate) => builder.add_root_certificate(certificate.clone()),
        None => builder,
    };

    builder.build().map_err(|error| {
        log::warn!("remote image client could not be built: {error}");
        FetchRemoteImageError::Network
    })
}

fn classify_request_error(error: reqwest::Error) -> FetchRemoteImageError {
    if let Some(PolicyViolation(kind)) = find_policy_violation(&error) {
        return *kind;
    }

    if error.is_timeout() {
        return FetchRemoteImageError::Timeout;
    }

    log::warn!(
        "remote image request failed: {}",
        describe_error_chain(&error.without_url())
    );

    FetchRemoteImageError::Network
}

fn find_policy_violation<'a>(error: &'a (dyn StdError + 'static)) -> Option<&'a PolicyViolation> {
    let mut current = Some(error);

    while let Some(error) = current {
        if let Some(violation) = error.downcast_ref::<PolicyViolation>() {
            return Some(violation);
        }

        current = error.source();
    }

    None
}

fn describe_error_chain(error: &(dyn StdError + 'static)) -> String {
    let mut description = error.to_string();
    let mut current = error.source();

    while let Some(source) = current {
        description.push_str(": ");
        description.push_str(source.to_string().as_str());
        current = source.source();
    }

    description
}

// The connector dials only the addresses returned here, so filtering them closes
// the window a separate validation step would leave for DNS rebinding.
struct PublicAddressResolver {
    trusted_host: Option<TrustedHost>,
}

impl Resolve for PublicAddressResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_owned();
        let trusted_host = self.trusted_host.clone();

        Box::pin(async move {
            if let Some(trusted_host) =
                trusted_host.filter(|trusted| trusted.name.eq_ignore_ascii_case(host.as_str()))
            {
                let addresses: Addrs =
                    Box::new(std::iter::once(SocketAddr::new(trusted_host.address, 0)));

                return Ok(addresses);
            }

            let addresses: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0))
                .await?
                .filter(|address| is_public_address(address.ip()))
                .collect();

            if addresses.is_empty() {
                return Err(PolicyViolation(FetchRemoteImageError::BlockedDestination).into());
            }

            let addresses: Addrs = Box::new(addresses.into_iter());

            Ok(addresses)
        })
    }
}

fn is_public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_public_ipv4(address),
        IpAddr::V6(address) => is_public_ipv6(address),
    }
}

fn is_public_ipv4(address: Ipv4Addr) -> bool {
    let [a, b, c, _] = address.octets();

    !(a == 0
        || a == 10
        || (a == 100 && (64..=127).contains(&b))
        || a == 127
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 192 && b == 88 && c == 99)
        || (a == 192 && b == 168)
        || (a == 198 && (18..=19).contains(&b))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224)
}

// Only global unicast (2000::/3) is reachable, apart from the transition forms
// that embed an IPv4 address and are judged by it.
fn is_public_ipv6(address: Ipv6Addr) -> bool {
    if let Some(embedded) = embedded_ipv4(address) {
        return is_public_ipv4(embedded);
    }

    let segments = address.segments();

    (segments[0] & 0xe000) == 0x2000
        && !(segments[0] == 0x2001 && segments[1] < 0x0200)
        && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
        && !(segments[0] == 0x3fff && segments[1] < 0x1000)
}

fn embedded_ipv4(address: Ipv6Addr) -> Option<Ipv4Addr> {
    let segments = address.segments();
    let octets = address.octets();
    let trailing = Ipv4Addr::new(octets[12], octets[13], octets[14], octets[15]);

    match segments {
        [0, 0, 0, 0, 0, 0xffff, _, _] => Some(trailing),
        [0x64, 0xff9b, 0, 0, 0, 0, _, _] => Some(trailing),
        [0x2002, _, _, ..] => Some(Ipv4Addr::new(octets[2], octets[3], octets[4], octets[5])),
        _ => None,
    }
}

fn has_supported_image_signature(bytes: &[u8]) -> bool {
    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";
    const JPEG: &[u8] = b"\xff\xd8\xff";

    bytes.starts_with(PNG)
        || bytes.starts_with(JPEG)
        || bytes.starts_with(b"GIF87a")
        || bytes.starts_with(b"GIF89a")
        || (bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP")
}

#[cfg(feature = "desktop-e2e")]
mod desktop_e2e {
    use std::net::IpAddr;

    use super::{FetchPolicy, TrustedHost};

    const HOST_VARIABLE: &str = "LEAFDOWN_E2E_REMOTE_IMAGE_HOST";
    const ADDRESS_VARIABLE: &str = "LEAFDOWN_E2E_REMOTE_IMAGE_ADDRESS";
    const CERTIFICATE_VARIABLE: &str = "LEAFDOWN_E2E_REMOTE_IMAGE_CERTIFICATE";

    // Lets the E2E runner serve a success path from loopback without a public host.
    pub(super) fn with_loopback_host(mut policy: FetchPolicy) -> FetchPolicy {
        let (Ok(name), Ok(address), Ok(certificate_path)) = (
            std::env::var(HOST_VARIABLE),
            std::env::var(ADDRESS_VARIABLE),
            std::env::var(CERTIFICATE_VARIABLE),
        ) else {
            return policy;
        };
        let Ok(address) = address.parse::<IpAddr>() else {
            log::warn!("{ADDRESS_VARIABLE} is not an IP address: {address}");
            return policy;
        };
        let certificate = std::fs::read(certificate_path.as_str())
            .map_err(|error| error.to_string())
            .and_then(|pem| {
                reqwest::Certificate::from_pem(pem.as_slice()).map_err(|error| error.to_string())
            });

        match certificate {
            Ok(certificate) => {
                policy.trusted_host = Some(TrustedHost { name, address });
                policy.root_certificate = Some(certificate);
            }
            Err(error) => log::warn!("{CERTIFICATE_VARIABLE} could not be loaded: {error}"),
        }

        policy
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::{IpAddr, Ipv4Addr, TcpListener, TcpStream},
        sync::{
            Arc, Mutex,
            atomic::{AtomicUsize, Ordering},
        },
        thread,
        time::Duration,
    };

    use reqwest::Url;

    use super::{
        FetchPolicy, FetchRemoteImageError, MAX_IMAGE_BYTES, TrustedHost, USER_AGENT,
        fetch_image_bytes, has_supported_image_signature, is_public_address, parse_target,
        remote_image_host, validate_redirect,
    };

    const TEST_HOST: &str = "images.leafdown.test";
    const PNG_BYTES: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    type Handler = dyn Fn(&str, u16) -> Reply + Send + Sync;

    enum Reply {
        Full {
            status: &'static str,
            headers: Vec<(&'static str, String)>,
            body: Vec<u8>,
        },
        Chunked {
            chunk: Vec<u8>,
            count: usize,
        },
        Stall,
    }

    impl Reply {
        fn ok(content_type: &str, body: &[u8]) -> Self {
            Self::Full {
                status: "200 OK",
                headers: vec![("Content-Type", content_type.to_owned())],
                body: body.to_vec(),
            }
        }

        fn redirect(location: String) -> Self {
            Self::Full {
                status: "302 Found",
                headers: vec![("Location", location)],
                body: Vec::new(),
            }
        }
    }

    struct TestServer {
        port: u16,
        connections: Arc<AtomicUsize>,
        requests: Arc<Mutex<Vec<String>>>,
    }

    impl TestServer {
        fn start(handler: impl Fn(&str, u16) -> Reply + Send + Sync + 'static) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("test server should bind");
            let port = listener.local_addr().unwrap().port();
            let connections = Arc::new(AtomicUsize::new(0));
            let requests = Arc::new(Mutex::new(Vec::new()));
            let handler: Arc<Handler> = Arc::new(handler);
            let server = Self {
                port,
                connections: Arc::clone(&connections),
                requests: Arc::clone(&requests),
            };

            thread::spawn(move || {
                for stream in listener.incoming().flatten() {
                    connections.fetch_add(1, Ordering::SeqCst);

                    let handler = Arc::clone(&handler);
                    let requests = Arc::clone(&requests);

                    thread::spawn(move || serve(stream, port, handler.as_ref(), &requests));
                }
            });

            server
        }

        fn url(&self, path: &str) -> String {
            format!("http://{TEST_HOST}:{}{path}", self.port)
        }

        fn connections(&self) -> usize {
            self.connections.load(Ordering::SeqCst)
        }

        fn requests(&self) -> Vec<String> {
            self.requests.lock().unwrap().clone()
        }
    }

    fn serve(mut stream: TcpStream, port: u16, handler: &Handler, requests: &Mutex<Vec<String>>) {
        let mut request = Vec::new();
        let mut buffer = [0; 1024];

        while !request.ends_with(b"\r\n\r\n") {
            match stream.read(&mut buffer) {
                Ok(0) | Err(_) => return,
                Ok(read) => request.extend_from_slice(&buffer[..read]),
            }
        }

        let request = String::from_utf8_lossy(&request).into_owned();
        let path = request.split_whitespace().nth(1).unwrap_or("/").to_owned();

        requests.lock().unwrap().push(request);

        let _ = match handler(path.as_str(), port) {
            Reply::Full {
                status,
                headers,
                body,
            } => {
                let mut head = format!("HTTP/1.1 {status}\r\nConnection: close\r\n");

                for (name, value) in headers {
                    head.push_str(format!("{name}: {value}\r\n").as_str());
                }

                head.push_str(format!("Content-Length: {}\r\n\r\n", body.len()).as_str());
                stream
                    .write_all(head.as_bytes())
                    .and_then(|()| stream.write_all(&body))
            }
            Reply::Chunked { chunk, count } => {
                let mut result = stream.write_all(
                    b"HTTP/1.1 200 OK\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n\r\n",
                );

                for _ in 0..count {
                    result = result
                        .and_then(|()| {
                            stream.write_all(format!("{:x}\r\n", chunk.len()).as_bytes())
                        })
                        .and_then(|()| stream.write_all(&chunk))
                        .and_then(|()| stream.write_all(b"\r\n"));
                }

                result.and_then(|()| stream.write_all(b"0\r\n\r\n"))
            }
            Reply::Stall => {
                thread::sleep(Duration::from_secs(3));
                Ok(())
            }
        };
    }

    fn test_policy() -> FetchPolicy {
        FetchPolicy {
            scheme: "http",
            connect_timeout: Duration::from_secs(5),
            request_timeout: Duration::from_millis(500),
            trusted_host: Some(TrustedHost {
                name: TEST_HOST.to_owned(),
                address: IpAddr::V4(Ipv4Addr::LOCALHOST),
            }),
            root_certificate: None,
        }
    }

    fn fetch(target: &str) -> Result<Vec<u8>, FetchRemoteImageError> {
        tauri::async_runtime::block_on(fetch_image_bytes(target, &test_policy()))
    }

    fn header_value<'a>(request: &'a str, name: &str) -> Option<&'a str> {
        request.lines().find_map(|line| {
            let (header, value) = line.split_once(':')?;

            header.eq_ignore_ascii_case(name).then(|| value.trim())
        })
    }

    #[test]
    fn classifies_only_globally_routable_addresses_as_public() {
        for address in [
            "0.0.0.0",
            "10.1.2.3",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.0.0.8",
            "192.0.2.1",
            "192.168.1.1",
            "198.18.0.1",
            "198.51.100.1",
            "203.0.113.1",
            "224.0.0.1",
            "240.0.0.1",
            "255.255.255.255",
            "::",
            "::1",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "ff02::1",
            "2001:db8::1",
            "3fff::1",
            "2001::1",
            "64:ff9b:1::1",
            "::ffff:127.0.0.1",
            "::ffff:192.168.1.1",
            "64:ff9b::10.0.0.1",
            "2002:7f00:1::1",
            "::127.0.0.1",
        ] {
            assert!(
                !is_public_address(address.parse().unwrap()),
                "{address} should be blocked"
            );
        }

        for address in [
            "1.1.1.1",
            "8.8.8.8",
            "100.63.255.255",
            "100.128.0.1",
            "172.15.0.1",
            "172.32.0.1",
            "192.0.1.1",
            "198.20.0.1",
            "2606:4700::1111",
            "2a00:1450::1",
            "::ffff:8.8.8.8",
            "64:ff9b::8.8.8.8",
            "2002:0808:0808::1",
        ] {
            assert!(
                is_public_address(address.parse().unwrap()),
                "{address} should be public"
            );
        }
    }

    #[test]
    fn accepts_only_credential_free_https_targets() {
        assert!(parse_target("https://example.com/a.png", "https").is_ok());
        assert!(parse_target("  HTTPS://example.com/a.png  ", "https").is_ok());

        for (target, expected) in [
            (
                "http://example.com/a.png",
                FetchRemoteImageError::InsecureScheme,
            ),
            (
                "ftp://example.com/a.png",
                FetchRemoteImageError::InsecureScheme,
            ),
            ("file:///C:/a.png", FetchRemoteImageError::InsecureScheme),
            ("//example.com/a.png", FetchRemoteImageError::InvalidTarget),
            ("./a.png", FetchRemoteImageError::InvalidTarget),
            (
                "https://user@example.com/a.png",
                FetchRemoteImageError::InvalidTarget,
            ),
            (
                "https://user:pass@example.com/a.png",
                FetchRemoteImageError::InvalidTarget,
            ),
        ] {
            assert_eq!(
                parse_target(target, "https").err(),
                Some(expected),
                "{target}"
            );
        }
    }

    #[test]
    fn names_the_host_only_for_loadable_targets() {
        assert_eq!(
            remote_image_host("https://images.example.com/a.png"),
            Some("images.example.com".to_owned())
        );
        assert_eq!(
            remote_image_host("https://example.com:8443/a.png"),
            Some("example.com:8443".to_owned())
        );
        assert_eq!(
            remote_image_host("https://example.com:443/a.png"),
            Some("example.com".to_owned())
        );
        assert_eq!(
            remote_image_host("https://bücher.example/a.png"),
            Some("xn--bcher-kva.example".to_owned())
        );
        assert_eq!(remote_image_host("http://example.com/a.png"), None);
        assert_eq!(remote_image_host("//example.com/a.png"), None);
        assert_eq!(remote_image_host("https://user@example.com/a.png"), None);
    }

    #[test]
    fn rejects_redirects_that_downgrade_carry_credentials_or_reach_blocked_literals() {
        let redirect = |target: &str| validate_redirect(&Url::parse(target).unwrap(), "https");

        assert_eq!(redirect("https://example.com/a.png"), Ok(()));
        assert_eq!(
            redirect("http://example.com/a.png"),
            Err(FetchRemoteImageError::InsecureRedirect)
        );
        assert_eq!(
            redirect("ftp://example.com/a.png"),
            Err(FetchRemoteImageError::InsecureRedirect)
        );
        assert_eq!(
            redirect("https://user:pass@example.com/a.png"),
            Err(FetchRemoteImageError::InvalidTarget)
        );

        for target in [
            "https://127.0.0.1/a.png",
            "https://[::1]/a.png",
            "https://[::ffff:127.0.0.1]/a.png",
            "https://0.0.0.0/a.png",
            "https://2130706433/a.png",
            "https://0x7f.1/a.png",
            "https://10.255.255.1/a.png",
            "https://[::ffff:192.168.1.1]/a.png",
        ] {
            assert_eq!(
                redirect(target),
                Err(FetchRemoteImageError::BlockedDestination),
                "{target}"
            );
        }
    }

    #[test]
    fn recognizes_supported_image_signatures() {
        assert!(has_supported_image_signature(PNG_BYTES));
        assert!(has_supported_image_signature(b"\xff\xd8\xff\xe0JFIF"));
        assert!(has_supported_image_signature(b"GIF87a..."));
        assert!(has_supported_image_signature(b"GIF89a..."));
        assert!(has_supported_image_signature(b"RIFF\x10\0\0\0WEBPVP8 "));

        assert!(!has_supported_image_signature(b""));
        assert!(!has_supported_image_signature(
            b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>"
        ));
        assert!(!has_supported_image_signature(b"<!doctype html><html>"));
        assert!(!has_supported_image_signature(b"RIFF\x10\0\0\0WAVEfmt "));
    }

    #[test]
    fn fetches_an_image_by_signature_rather_than_content_type() {
        let server = TestServer::start(|_, _| Reply::ok("application/octet-stream", PNG_BYTES));

        assert_eq!(fetch(server.url("/image").as_str()), Ok(PNG_BYTES.to_vec()));
    }

    #[test]
    fn rejects_bodies_without_a_supported_signature() {
        let server = TestServer::start(|path, _| match path {
            "/page" => Reply::ok("image/png", b"<!doctype html><title>Not an image</title>"),
            _ => Reply::ok(
                "image/svg+xml",
                b"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"/>",
            ),
        });

        assert_eq!(
            fetch(server.url("/page").as_str()),
            Err(FetchRemoteImageError::UnsupportedType)
        );
        assert_eq!(
            fetch(server.url("/image.svg").as_str()),
            Err(FetchRemoteImageError::UnsupportedType)
        );
    }

    #[test]
    fn reports_unsuccessful_statuses() {
        let server = TestServer::start(|_, _| Reply::Full {
            status: "404 Not Found",
            headers: Vec::new(),
            body: b"missing".to_vec(),
        });

        assert_eq!(
            fetch(server.url("/missing.png").as_str()),
            Err(FetchRemoteImageError::HttpStatus { status: 404 })
        );
    }

    #[test]
    fn rejects_declared_and_streamed_bodies_over_the_limit() {
        let server = TestServer::start(|path, _| match path {
            "/declared" => Reply::Full {
                status: "200 OK",
                headers: Vec::new(),
                body: [PNG_BYTES, vec![0; MAX_IMAGE_BYTES].as_slice()].concat(),
            },
            _ => Reply::Chunked {
                chunk: vec![0; 1024 * 1024],
                count: 11,
            },
        });

        assert_eq!(
            fetch(server.url("/declared").as_str()),
            Err(FetchRemoteImageError::TooLarge)
        );
        assert_eq!(
            fetch(server.url("/streamed").as_str()),
            Err(FetchRemoteImageError::TooLarge)
        );
    }

    #[test]
    fn times_out_a_stalled_response() {
        let server = TestServer::start(|_, _| Reply::Stall);

        assert_eq!(
            fetch(server.url("/slow.png").as_str()),
            Err(FetchRemoteImageError::Timeout)
        );
    }

    #[test]
    fn blocks_loopback_destinations_before_connecting() {
        let server = TestServer::start(|_, _| Reply::ok("image/png", PNG_BYTES));

        for host in [
            "127.0.0.1".to_owned(),
            "[::1]".to_owned(),
            "[::ffff:127.0.0.1]".to_owned(),
            "2130706433".to_owned(),
            "0x7f.1".to_owned(),
            "localhost".to_owned(),
            "LOCALHOST.".to_owned(),
        ] {
            assert_eq!(
                fetch(format!("http://{host}:{}/image.png", server.port).as_str()),
                Err(FetchRemoteImageError::BlockedDestination),
                "{host}"
            );
        }

        assert_eq!(server.connections(), 0);
    }

    #[test]
    fn follows_at_most_five_redirects_and_revalidates_each_hop() {
        let server = TestServer::start(|path, port| {
            let hops = path
                .strip_prefix("/hops/")
                .and_then(|hops| hops.parse::<u8>().ok());

            match (path, hops) {
                (_, Some(0)) => Reply::ok("image/png", PNG_BYTES),
                (_, Some(hops)) => {
                    Reply::redirect(format!("http://{TEST_HOST}:{port}/hops/{}", hops - 1))
                }
                ("/to-private", _) => Reply::redirect("http://10.255.255.1/a.png".to_owned()),
                ("/to-loopback", _) => Reply::redirect(format!("http://127.0.0.1:{port}/hops/0")),
                ("/to-ftp", _) => Reply::redirect("ftp://example.com/a.png".to_owned()),
                ("/to-credentials", _) => {
                    Reply::redirect(format!("http://user:pass@{TEST_HOST}:{port}/hops/0"))
                }
                _ => Reply::ok("text/plain", b"unexpected"),
            }
        });

        assert_eq!(
            fetch(server.url("/hops/5").as_str()),
            Ok(PNG_BYTES.to_vec())
        );
        assert_eq!(
            fetch(server.url("/hops/6").as_str()),
            Err(FetchRemoteImageError::TooManyRedirects)
        );

        for (path, expected) in [
            ("/to-private", FetchRemoteImageError::BlockedDestination),
            ("/to-loopback", FetchRemoteImageError::BlockedDestination),
            ("/to-ftp", FetchRemoteImageError::InsecureRedirect),
            ("/to-credentials", FetchRemoteImageError::InvalidTarget),
        ] {
            let connections = server.connections();

            assert_eq!(fetch(server.url(path).as_str()), Err(expected), "{path}");
            assert_eq!(server.connections(), connections + 1, "{path}");
        }
    }

    #[test]
    fn sends_no_referer_or_cookie_and_identifies_the_app() {
        let server = TestServer::start(|path, port| match path {
            "/start" => Reply::Full {
                status: "302 Found",
                headers: vec![
                    ("Location", format!("http://{TEST_HOST}:{port}/image.png")),
                    ("Set-Cookie", "session=1".to_owned()),
                ],
                body: Vec::new(),
            },
            _ => Reply::ok("image/png", PNG_BYTES),
        });

        assert_eq!(fetch(server.url("/start").as_str()), Ok(PNG_BYTES.to_vec()));

        let requests = server.requests();

        assert_eq!(requests.len(), 2);

        for request in requests {
            assert_eq!(header_value(&request, "Referer"), None);
            assert_eq!(header_value(&request, "Cookie"), None);
            assert_eq!(header_value(&request, "User-Agent"), Some(USER_AGENT));
            assert_eq!(
                header_value(&request, "Accept"),
                Some("image/png,image/jpeg,image/gif,image/webp")
            );
        }
    }

    #[test]
    fn serializes_errors_with_stable_kinds() {
        assert_eq!(
            serde_json::to_value(FetchRemoteImageError::BlockedDestination).unwrap(),
            serde_json::json!({ "kind": "blockedDestination" })
        );
        assert_eq!(
            serde_json::to_value(FetchRemoteImageError::HttpStatus { status: 404 }).unwrap(),
            serde_json::json!({ "kind": "httpStatus", "status": 404 })
        );
    }
}
