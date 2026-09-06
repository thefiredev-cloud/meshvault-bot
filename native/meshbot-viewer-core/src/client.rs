use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{Client, Response, StatusCode, redirect::Policy};
use serde::{Deserialize, Deserializer, Serialize, de::DeserializeOwned};
use url::Url;
use zeroize::{Zeroize, Zeroizing};

use crate::{PairingUri, ViewerError, tls};

const MAX_NORMAL_BODY_BYTES: usize = 1024 * 1024;
const MAX_THREAD_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_IDENTIFIER_CHARS: usize = 256;
const MAX_TEXT_CHARS: usize = 20_000;
const MAX_DEVICE_LABEL_CHARS: usize = 80;
const MAX_TOKEN_BYTES: usize = 4_096;
const MAX_MODELS: usize = 512;
const MAX_THREADS: usize = 10_000;
const MAX_MESSAGES: usize = 100_000;
const MAX_EVIDENCE_ITEMS: usize = 32;
const MAX_EVIDENCE_CHARS: usize = 128;

pub struct Model {
    pub name: String,
    pub kind: String,
    pub location: String,
    pub note: Option<String>,
}

pub struct ThreadSummary {
    pub id: String,
    pub agent: Option<String>,
    pub updated: Option<String>,
    pub mtime: f64,
}

pub struct Thread {
    pub id: String,
    pub messages: Vec<Message>,
    pub updated: Option<String>,
}

pub struct Message {
    pub role: String,
    pub ts: String,
    pub text: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum TaskStatus {
    Queued,
    Leased,
    Completed,
    Failed,
}

pub struct Task {
    pub id: String,
    pub thread_id: String,
    pub text: String,
    pub client_nonce: String,
    pub status: TaskStatus,
    pub lease_owner: Option<String>,
    pub lease_fence: u64,
    pub lease_expires_unix: Option<i64>,
    pub result: Option<String>,
    pub error: Option<String>,
    pub evidence: Vec<String>,
    pub created: String,
    pub updated: String,
}

#[derive(Serialize)]
pub struct ChatRequest {
    agent: &'static str,
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thread_id: Option<String>,
}

impl ChatRequest {
    pub fn new(
        agent: &str,
        prompt: &str,
        model: Option<&str>,
        thread_id: Option<&str>,
    ) -> Result<Self, ViewerError> {
        if agent != "chief" || !valid_nonblank_text(prompt, MAX_TEXT_CHARS) {
            return Err(ViewerError::InvalidInput);
        }
        let model = model
            .map(|value| {
                if valid_model(value) {
                    Ok(value.to_owned())
                } else {
                    Err(ViewerError::InvalidInput)
                }
            })
            .transpose()?;
        let thread_id = thread_id
            .map(|value| {
                validate_identifier(value)?;
                Ok(value.to_owned())
            })
            .transpose()?;
        Ok(Self {
            agent: "chief",
            prompt: prompt.to_owned(),
            model,
            thread_id,
        })
    }
}

#[derive(Serialize)]
pub struct CreateTaskRequest {
    thread_id: String,
    text: String,
    client_nonce: String,
}

impl CreateTaskRequest {
    pub fn new(thread_id: &str, text: &str, client_nonce: &str) -> Result<Self, ViewerError> {
        validate_identifier(thread_id)?;
        validate_identifier(client_nonce)?;
        if !valid_nonblank_text(text, MAX_TEXT_CHARS) {
            return Err(ViewerError::InvalidInput);
        }
        Ok(Self {
            thread_id: thread_id.to_owned(),
            text: text.to_owned(),
            client_nonce: client_nonce.to_owned(),
        })
    }
}

struct SecretToken(Zeroizing<String>);

impl SecretToken {
    fn expose(&self) -> &str {
        self.0.as_str()
    }
}

impl<'de> Deserialize<'de> for SecretToken {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        String::deserialize(deserializer).map(Zeroizing::new).map(Self)
    }
}

pub struct MeshBotClient {
    http: Client,
    base: Url,
    token: SecretToken,
}

impl MeshBotClient {
    pub async fn pair(
        mut pairing: PairingUri,
        device_name: &str,
        device_kind: &str,
    ) -> Result<Self, ViewerError> {
        if !valid_label(device_name) || !valid_label(device_kind) {
            return Err(ViewerError::InvalidInput);
        }
        let (authority, host) = pairing.address.into_parts();
        let config = tls::client_config(host, pairing.pin)?;
        let http = Client::builder()
            .use_preconfigured_tls(config)
            .https_only(true)
            .redirect(Policy::none())
            .no_proxy()
            .connect_timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| ViewerError::Tls)?;
        let base = Url::parse(&format!("https://{authority}"))
            .map_err(|_| ViewerError::InvalidPairingUri)?;
        let endpoint = base.join("/pair").map_err(|_| ViewerError::InvalidPairingUri)?;
        let body = PairRequest {
            code: pairing.code.as_str(),
            device_name,
            device_kind,
        };
        let response = http.post(endpoint).json(&body).send().await;
        pairing.code.zeroize();
        let response = response.map_err(|_| ViewerError::Network)?;
        ensure_success(&response)?;
        let mut bytes = collect_body(response, MAX_NORMAL_BODY_BYTES).await?;
        let parsed = serde_json::from_slice::<PairResponse>(&bytes)
            .map_err(|_| ViewerError::InvalidResponse);
        bytes.zeroize();
        let parsed = parsed?;
        validate_pair_response(&parsed)?;
        Ok(Self {
            http,
            base,
            token: parsed.token,
        })
    }

    pub async fn models(&self) -> Result<Vec<Model>, ViewerError> {
        let response: ModelsResponse = self
            .get_json(self.fixed_endpoint("models")?, MAX_NORMAL_BODY_BYTES)
            .await?;
        if response.models.len() > MAX_MODELS
            || response.models.iter().any(|model| {
                !valid_response_string(&model.name, 256)
                    || !valid_response_string(&model.kind, 128)
                    || !valid_response_string(&model.location, 256)
                    || model
                        .note
                        .as_deref()
                        .is_some_and(|note| !valid_response_text(note, 2_048))
            })
        {
            return Err(ViewerError::InvalidResponse);
        }
        Ok(response.models)
    }

    pub async fn threads(&self) -> Result<Vec<ThreadSummary>, ViewerError> {
        let response: ThreadsResponse = self
            .get_json(self.fixed_endpoint("threads")?, MAX_THREAD_BODY_BYTES)
            .await?;
        if response.threads.len() > MAX_THREADS
            || response.threads.iter().any(|thread| {
                !valid_response_string(&thread.id, MAX_IDENTIFIER_CHARS)
                    || thread.agent.as_deref().is_some_and(|agent| agent != "chief")
                    || thread
                        .updated
                        .as_deref()
                        .is_some_and(|updated| !valid_response_string(updated, 128))
                    || !thread.mtime.is_finite()
            })
        {
            return Err(ViewerError::InvalidResponse);
        }
        Ok(response.threads)
    }

    pub async fn thread(&self, id: &str) -> Result<Thread, ViewerError> {
        validate_identifier(id)?;
        let thread: Thread = self
            .get_json(self.segment_endpoint("threads", id)?, MAX_THREAD_BODY_BYTES)
            .await?;
        validate_thread(&thread)?;
        Ok(thread)
    }

    pub async fn create_task(&self, request: CreateTaskRequest) -> Result<Task, ViewerError> {
        let task: Task = self
            .post_json(
                self.fixed_endpoint("tasks")?,
                &request,
                MAX_NORMAL_BODY_BYTES,
            )
            .await?;
        validate_task(&task)?;
        Ok(task)
    }

    pub async fn task(&self, id: &str) -> Result<Task, ViewerError> {
        validate_identifier(id)?;
        let task: Task = self
            .get_json(self.segment_endpoint("tasks", id)?, MAX_NORMAL_BODY_BYTES)
            .await?;
        validate_task(&task)?;
        Ok(task)
    }

    fn fixed_endpoint(&self, route: &str) -> Result<Url, ViewerError> {
        self.base
            .join(&format!("/{route}"))
            .map_err(|_| ViewerError::InvalidInput)
    }

    fn segment_endpoint(&self, route: &str, id: &str) -> Result<Url, ViewerError> {
        let encoded = encode_segment(id);
        self.base
            .join(&format!("/{route}/{encoded}"))
            .map_err(|_| ViewerError::InvalidInput)
    }

    async fn get_json<T>(&self, endpoint: Url, limit: usize) -> Result<T, ViewerError>
    where
        T: DeserializeOwned,
    {
        let response = self
            .http
            .get(endpoint)
            .bearer_auth(self.token.expose())
            .send()
            .await
            .map_err(|_| ViewerError::Network)?;
        decode_json_response(response, limit).await
    }

    async fn post_json<B, T>(&self, endpoint: Url, body: &B, limit: usize) -> Result<T, ViewerError>
    where
        B: Serialize + ?Sized,
        T: DeserializeOwned,
    {
        let response = self
            .http
            .post(endpoint)
            .bearer_auth(self.token.expose())
            .json(body)
            .send()
            .await
            .map_err(|_| ViewerError::Network)?;
        decode_json_response(response, limit).await
    }
}

#[derive(Serialize)]
struct PairRequest<'a> {
    code: &'a str,
    device_name: &'a str,
    device_kind: &'a str,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PairResponse {
    token: SecretToken,
    device_id: String,
    name: String,
    version: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ModelsResponse {
    models: Vec<Model>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ThreadsResponse {
    threads: Vec<ThreadSummary>,
}

impl<'de> Deserialize<'de> for Model {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Wire {
            name: String,
            kind: String,
            #[serde(rename = "where")]
            location: String,
            note: Option<String>,
        }
        let wire = Wire::deserialize(deserializer)?;
        Ok(Self {
            name: wire.name,
            kind: wire.kind,
            location: wire.location,
            note: wire.note,
        })
    }
}

impl<'de> Deserialize<'de> for ThreadSummary {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Wire {
            id: String,
            agent: Option<String>,
            updated: Option<String>,
            mtime: f64,
        }
        let wire = Wire::deserialize(deserializer)?;
        Ok(Self {
            id: wire.id,
            agent: wire.agent,
            updated: wire.updated,
            mtime: wire.mtime,
        })
    }
}

impl<'de> Deserialize<'de> for Thread {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Wire {
            id: String,
            messages: Vec<Message>,
            updated: Option<String>,
        }
        let wire = Wire::deserialize(deserializer)?;
        Ok(Self {
            id: wire.id,
            messages: wire.messages,
            updated: wire.updated,
        })
    }
}

impl<'de> Deserialize<'de> for Message {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Wire {
            role: String,
            ts: String,
            text: String,
        }
        let wire = Wire::deserialize(deserializer)?;
        Ok(Self {
            role: wire.role,
            ts: wire.ts,
            text: wire.text,
        })
    }
}

impl<'de> Deserialize<'de> for TaskStatus {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "snake_case")]
        enum Wire {
            Queued,
            Leased,
            Completed,
            Failed,
        }
        Ok(match Wire::deserialize(deserializer)? {
            Wire::Queued => Self::Queued,
            Wire::Leased => Self::Leased,
            Wire::Completed => Self::Completed,
            Wire::Failed => Self::Failed,
        })
    }
}

impl<'de> Deserialize<'de> for Task {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Wire {
            id: String,
            thread_id: String,
            text: String,
            client_nonce: String,
            status: TaskStatus,
            lease_owner: Option<String>,
            lease_fence: u64,
            lease_expires_unix: Option<i64>,
            result: Option<String>,
            error: Option<String>,
            evidence: Vec<String>,
            created: String,
            updated: String,
        }
        let wire = Wire::deserialize(deserializer)?;
        Ok(Self {
            id: wire.id,
            thread_id: wire.thread_id,
            text: wire.text,
            client_nonce: wire.client_nonce,
            status: wire.status,
            lease_owner: wire.lease_owner,
            lease_fence: wire.lease_fence,
            lease_expires_unix: wire.lease_expires_unix,
            result: wire.result,
            error: wire.error,
            evidence: wire.evidence,
            created: wire.created,
            updated: wire.updated,
        })
    }
}

async fn decode_json_response<T>(response: Response, limit: usize) -> Result<T, ViewerError>
where
    T: DeserializeOwned,
{
    ensure_success(&response)?;
    let bytes = collect_body(response, limit).await?;
    serde_json::from_slice(&bytes).map_err(|_| ViewerError::InvalidResponse)
}

fn ensure_success(response: &Response) -> Result<(), ViewerError> {
    let status = response.status();
    if status.is_success() {
        return Ok(());
    }
    Err(match status {
        StatusCode::UNAUTHORIZED => ViewerError::Authentication,
        StatusCode::FORBIDDEN => ViewerError::Forbidden,
        StatusCode::NOT_FOUND => ViewerError::NotFound,
        StatusCode::CONFLICT => ViewerError::Conflict,
        StatusCode::TOO_MANY_REQUESTS => ViewerError::RateLimited,
        status if status.is_server_error() => ViewerError::Server,
        _ => ViewerError::InvalidResponse,
    })
}

async fn collect_body(response: Response, limit: usize) -> Result<Vec<u8>, ViewerError> {
    let mut stream = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| ViewerError::Network)?;
        let next = body
            .len()
            .checked_add(chunk.len())
            .ok_or(ViewerError::ResponseTooLarge)?;
        if next > limit {
            return Err(ViewerError::ResponseTooLarge);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn validate_pair_response(response: &PairResponse) -> Result<(), ViewerError> {
    if response.token.expose().is_empty()
        || response.token.expose().len() > MAX_TOKEN_BYTES
        || reqwest::header::HeaderValue::from_str(response.token.expose()).is_err()
        || !valid_response_string(&response.device_id, MAX_IDENTIFIER_CHARS)
        || !valid_response_string(&response.name, 256)
        || !valid_response_string(&response.version, 64)
    {
        return Err(ViewerError::InvalidResponse);
    }
    Ok(())
}

fn validate_thread(thread: &Thread) -> Result<(), ViewerError> {
    if !valid_response_string(&thread.id, MAX_IDENTIFIER_CHARS)
        || thread.messages.len() > MAX_MESSAGES
        || thread
            .updated
            .as_deref()
            .is_some_and(|updated| !valid_response_string(updated, 128))
        || thread.messages.iter().any(|message| {
            !valid_response_string(&message.role, 64)
                || !valid_response_string(&message.ts, 128)
                || !valid_response_text(&message.text, MAX_THREAD_BODY_BYTES)
        })
    {
        return Err(ViewerError::InvalidResponse);
    }
    Ok(())
}

fn validate_task(task: &Task) -> Result<(), ViewerError> {
    if !valid_response_string(&task.id, MAX_IDENTIFIER_CHARS)
        || !valid_response_string(&task.thread_id, MAX_IDENTIFIER_CHARS)
        || !valid_response_text(&task.text, MAX_TEXT_CHARS)
        || !valid_response_string(&task.client_nonce, MAX_IDENTIFIER_CHARS)
        || task
            .lease_owner
            .as_deref()
            .is_some_and(|value| !valid_response_string(value, MAX_IDENTIFIER_CHARS))
        || task
            .result
            .as_deref()
            .is_some_and(|value| !valid_response_text(value, MAX_TEXT_CHARS))
        || task
            .error
            .as_deref()
            .is_some_and(|value| !valid_response_text(value, MAX_TEXT_CHARS))
        || task.evidence.len() > MAX_EVIDENCE_ITEMS
        || task
            .evidence
            .iter()
            .any(|value| !valid_response_text(value, MAX_EVIDENCE_CHARS))
        || !valid_response_string(&task.created, 128)
        || !valid_response_string(&task.updated, 128)
    {
        return Err(ViewerError::InvalidResponse);
    }
    Ok(())
}

fn valid_label(value: &str) -> bool {
    valid_nonblank_text(value, MAX_DEVICE_LABEL_CHARS)
        && !value.chars().any(char::is_control)
}

fn validate_identifier(value: &str) -> Result<(), ViewerError> {
    if !valid_nonblank_text(value, MAX_IDENTIFIER_CHARS)
        || value.chars().any(char::is_control)
    {
        return Err(ViewerError::InvalidInput);
    }
    Ok(())
}

fn valid_model(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':')
        })
}

fn valid_nonblank_text(value: &str, max_chars: usize) -> bool {
    !value.trim().is_empty()
        && value.chars().count() <= max_chars
        && !value.chars().any(|character| character == '\0')
}

fn valid_response_string(value: &str, max_chars: usize) -> bool {
    valid_nonblank_text(value, max_chars) && !value.chars().any(char::is_control)
}

fn valid_response_text(value: &str, max_chars: usize) -> bool {
    value.chars().count() <= max_chars && !value.chars().any(|character| character == '\0')
}

fn encode_segment(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'~' => {
                (*byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}
