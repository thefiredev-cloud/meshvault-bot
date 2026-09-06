mod support;

use std::sync::{Arc, Mutex};

use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, post},
};
use meshbot_viewer_core::{
    ChatRequest, CreateTaskRequest, MeshBotClient, PairingUri, TaskStatus, ViewerError,
};
use serde_json::{Value, json};
use support::TestServer;

const TOKEN: &str = "device-token-that-must-remain-private";

fn take_error<T>(result: Result<T, ViewerError>) -> ViewerError {
    match result {
        Ok(_) => panic!("operation unexpectedly succeeded"),
        Err(error) => error,
    }
}

#[derive(Clone, Default)]
struct Requests(Arc<Mutex<Vec<(String, String, Option<String>, Value)>>>);

impl Requests {
    fn push(&self, method: &str, path: &str, headers: &HeaderMap, body: Value) {
        let authorization = headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned);
        self.0
            .lock()
            .unwrap()
            .push((method.to_owned(), path.to_owned(), authorization, body));
    }

    fn snapshot(&self) -> Vec<(String, String, Option<String>, Value)> {
        self.0.lock().unwrap().clone()
    }
}

async fn pair(State(requests): State<Requests>, headers: HeaderMap, Json(body): Json<Value>) -> Response {
    requests.push("POST", "/pair", &headers, body);
    Json(json!({
        "token": TOKEN,
        "device_id": "device-1",
        "name": "Test Node",
        "version": "0.1.0"
    }))
    .into_response()
}

async fn viewer(State(requests): State<Requests>, request: Request) -> Response {
    let method = request.method().to_string();
    let path = request.uri().to_string();
    let headers = request.headers().clone();
    let body = to_bytes(request.into_body(), 64 * 1024).await.unwrap();
    let body = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body).unwrap()
    };
    requests.push(&method, &path, &headers, body);
    if headers.get("authorization").and_then(|value| value.to_str().ok())
        != Some(&format!("Bearer {TOKEN}"))
    {
        return (StatusCode::UNAUTHORIZED, Json(json!({"error": "unauthorized"}))).into_response();
    }
    match (method.as_str(), path.as_str()) {
        ("GET", "/models") => Json(json!({
            "models": [{"name":"qwen2.5:7b","kind":"open-source","where":"your node","note":null}]
        }))
        .into_response(),
        ("GET", "/threads") => Json(json!({
            "threads": [{"id":"chief","agent":"chief","updated":"2026-08-14T00:00:00Z","mtime":7.5}]
        }))
        .into_response(),
        ("GET", path) if path.starts_with("/threads/") => Json(json!({
            "id":"chief","messages":[{"role":"you","ts":"2026-08-14T00:00:00Z","text":"hello"}],"updated":null
        }))
        .into_response(),
        ("POST", "/tasks") => Json(task_json("queued")).into_response(),
        ("GET", path) if path.starts_with("/tasks/") => Json(task_json("completed")).into_response(),
        _ => (StatusCode::NOT_FOUND, Json(json!({"error":"not found"}))).into_response(),
    }
}

fn task_json(status: &str) -> Value {
    json!({
        "id":"task-1","thread_id":"chief","text":"check status","client_nonce":"nonce-1",
        "status":status,"lease_owner":null,"lease_fence":0,"lease_expires_unix":null,
        "result":if status == "completed" { Some("ready") } else { None },"error":null,
        "evidence":[],"created":"2026-08-14T00:00:00Z","updated":"2026-08-14T00:00:01Z"
    })
}

async fn paired_client(router: Router) -> (MeshBotClient, TestServer) {
    let server = TestServer::start(router).await;
    let pairing = PairingUri::parse(&server.pairing_uri()).unwrap();
    let client = MeshBotClient::pair(pairing, "Tanner's iPhone", "ios")
        .await
        .unwrap();
    (client, server)
}

#[tokio::test]
async fn pair_posts_exact_json_and_protected_calls_attach_one_bearer_internally() {
    let requests = Requests::default();
    let router = Router::new()
        .route("/pair", post(pair))
        .fallback(any(viewer))
        .with_state(requests.clone());
    let (client, _server) = paired_client(router).await;
    let models = client.models().await.unwrap();
    assert_eq!(models.len(), 1);
    assert_eq!(models[0].name, "qwen2.5:7b");
    assert_eq!(models[0].location, "your node");

    let requests = requests.snapshot();
    assert_eq!(
        requests[0].3,
        json!({"code":"mesh-7F2K-XR9Q-4M8V","device_name":"Tanner's iPhone","device_kind":"ios"})
    );
    let expected_bearer = format!("Bearer {TOKEN}");
    assert_eq!(requests[1].2.as_deref(), Some(expected_bearer.as_str()));
    assert!(!format!("{:?}", ViewerError::Network).contains(TOKEN));
}

#[tokio::test]
async fn viewer_routes_decode_strict_bounded_shapes_and_escape_every_id_as_one_segment() {
    let requests = Requests::default();
    let router = Router::new()
        .route("/pair", post(pair))
        .fallback(any(viewer))
        .with_state(requests.clone());
    let (client, _server) = paired_client(router).await;

    let threads = client.threads().await.unwrap();
    assert_eq!(threads.len(), 1);
    assert_eq!(threads[0].agent.as_deref(), Some("chief"));
    let thread = client.thread("/../?secret#fragment%value").await.unwrap();
    assert_eq!(thread.messages[0].role, "you");
    let created = client
        .create_task(CreateTaskRequest::new("chief", "check status", "nonce-1").unwrap())
        .await
        .unwrap();
    assert!(matches!(created.status, TaskStatus::Queued));
    let task = client.task("./../task?x#y%z").await.unwrap();
    assert!(matches!(task.status, TaskStatus::Completed));

    let paths = requests
        .snapshot()
        .into_iter()
        .map(|request| request.1)
        .collect::<Vec<_>>();
    assert!(paths.contains(&"/threads/%2F%2E%2E%2F%3Fsecret%23fragment%25value".to_owned()));
    assert!(paths.contains(&"/tasks/%2E%2F%2E%2E%2Ftask%3Fx%23y%25z".to_owned()));
}

#[tokio::test]
async fn chat_and_task_inputs_are_rejected_locally_before_any_network_request() {
    assert!(ChatRequest::new("chief", "hello", Some("qwen2.5:7b"), Some("chief")).is_ok());
    assert!(ChatRequest::new("riley", "hello", None, None).is_err());
    assert!(ChatRequest::new("chief", "hello", Some("../../model"), None).is_err());
    assert!(ChatRequest::new("chief", "", None, None).is_err());
    assert!(CreateTaskRequest::new("", "work", "nonce").is_err());
    assert!(CreateTaskRequest::new("chief", "", "nonce").is_err());
    assert!(CreateTaskRequest::new("chief", "work", "").is_err());
}

#[tokio::test]
async fn non_success_status_and_reflective_body_are_never_exposed() {
    let secret = "prompt token node-address";
    let router = Router::new()
        .route("/pair", post(|| async {
            Json(json!({"token":TOKEN,"device_id":"d","name":"n","version":"v"}))
        }))
        .route(
            "/models",
            any(move || async move {
                (StatusCode::INTERNAL_SERVER_ERROR, secret).into_response()
            }),
        );
    let (client, _server) = paired_client(router).await;
    let error = take_error(client.models().await);
    assert_eq!(error, ViewerError::Server);
    assert!(!error.to_string().contains(secret));
    assert!(!format!("{error:?}").contains(secret));
}

#[tokio::test]
async fn malformed_unknown_and_oversized_json_fail_with_fixed_categories() {
    let huge = "x".repeat(1024 * 1024 + 1);
    let router = Router::new()
        .route("/pair", post(|| async {
            Json(json!({"token":TOKEN,"device_id":"d","name":"n","version":"v"}))
        }))
        .route("/models", any(|| async { Body::from("{") }))
        .route(
            "/threads",
            any(move || {
                let huge = huge.clone();
                async move { Body::from(huge) }
            }),
        )
        .route(
            "/tasks/{id}",
            any(|| async { Json(json!({"unexpected":"field"})) }),
        );
    let (client, _server) = paired_client(router).await;
    assert_eq!(take_error(client.models().await), ViewerError::InvalidResponse);
    assert_eq!(take_error(client.threads().await), ViewerError::InvalidResponse);
    assert_eq!(take_error(client.task("task-1").await), ViewerError::InvalidResponse);
}

#[tokio::test]
async fn redirects_fail_and_never_reach_the_redirect_target() {
    let target_hits = Arc::new(Mutex::new(0_u32));
    let hits = Arc::clone(&target_hits);
    let target = TestServer::start(Router::new().fallback(any(move || {
        let hits = Arc::clone(&hits);
        async move {
            *hits.lock().unwrap() += 1;
            StatusCode::OK
        }
    })))
    .await;
    let location = target.https_url("/stolen");
    let source = TestServer::start(Router::new().route(
        "/pair",
        post(move || {
            let location = location.clone();
            async move { (StatusCode::FOUND, [("location", location)]) }
        }),
    ))
    .await;
    let pairing = PairingUri::parse(&source.pairing_uri()).unwrap();
    let error = match MeshBotClient::pair(pairing, "Desktop", "electron").await {
        Ok(_) => panic!("redirect unexpectedly paired"),
        Err(error) => error,
    };
    assert_eq!(error, ViewerError::InvalidResponse);
    assert_eq!(*target_hits.lock().unwrap(), 0);
}

#[tokio::test]
async fn wrong_pin_stops_before_the_http_handler() {
    let hits = Arc::new(Mutex::new(0_u32));
    let handler_hits = Arc::clone(&hits);
    let server = TestServer::start(Router::new().route(
        "/pair",
        post(move || {
            let handler_hits = Arc::clone(&handler_hits);
            async move {
                *handler_hits.lock().unwrap() += 1;
                Json(json!({"token":TOKEN,"device_id":"d","name":"n","version":"v"}))
            }
        }),
    ))
    .await;
    let wrong_pin = "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVA";
    let pairing = PairingUri::parse(&server.pairing_uri_with_pin(wrong_pin)).unwrap();
    assert!(MeshBotClient::pair(pairing, "Desktop", "electron")
        .await
        .is_err());
    assert_eq!(*hits.lock().unwrap(), 0);
}
