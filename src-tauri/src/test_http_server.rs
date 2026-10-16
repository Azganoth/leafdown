use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    thread,
    time::Duration,
};

/// A name the test fetch policy resolves to loopback, standing in for a public host.
pub(crate) const TEST_HOST: &str = "remote.leafdown.test";

type Handler = dyn Fn(&str, u16) -> Reply + Send + Sync;

pub(crate) enum Reply {
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
    Hangup,
}

impl Reply {
    pub(crate) fn ok(content_type: &str, body: &[u8]) -> Self {
        Self::Full {
            status: "200 OK",
            headers: vec![("Content-Type", content_type.to_owned())],
            body: body.to_vec(),
        }
    }

    pub(crate) fn redirect(location: String) -> Self {
        Self::Full {
            status: "302 Found",
            headers: vec![("Location", location)],
            body: Vec::new(),
        }
    }
}

pub(crate) struct TestServer {
    pub(crate) port: u16,
    connections: Arc<AtomicUsize>,
    requests: Arc<Mutex<Vec<String>>>,
}

impl TestServer {
    pub(crate) fn start(handler: impl Fn(&str, u16) -> Reply + Send + Sync + 'static) -> Self {
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

    pub(crate) fn url(&self, path: &str) -> String {
        format!("http://{TEST_HOST}:{}{path}", self.port)
    }

    pub(crate) fn connections(&self) -> usize {
        self.connections.load(Ordering::SeqCst)
    }

    pub(crate) fn requests(&self) -> Vec<String> {
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
                    .and_then(|()| stream.write_all(format!("{:x}\r\n", chunk.len()).as_bytes()))
                    .and_then(|()| stream.write_all(&chunk))
                    .and_then(|()| stream.write_all(b"\r\n"));
            }

            result.and_then(|()| stream.write_all(b"0\r\n\r\n"))
        }
        Reply::Stall => {
            thread::sleep(Duration::from_secs(3));
            Ok(())
        }
        Reply::Hangup => Ok(()),
    };
}

pub(crate) fn header_value<'a>(request: &'a str, name: &str) -> Option<&'a str> {
    request.lines().find_map(|line| {
        let (header, value) = line.split_once(':')?;

        header.eq_ignore_ascii_case(name).then(|| value.trim())
    })
}
