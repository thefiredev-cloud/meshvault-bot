#![forbid(unsafe_code)]

mod address;
mod client;
mod pairing;
mod tls;

pub use client::{
    ChatRequest, CreateTaskRequest, MeshBotClient, Message, Model, Task, TaskStatus, Thread,
    ThreadSummary,
};
pub use pairing::PairingUri;

use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ViewerError {
    #[error("invalid address")]
    InvalidAddress,
    #[error("invalid pairing URI")]
    InvalidPairingUri,
    #[error("invalid input")]
    InvalidInput,
    #[error("authentication failed")]
    Authentication,
    #[error("request forbidden")]
    Forbidden,
    #[error("not found")]
    NotFound,
    #[error("request conflict")]
    Conflict,
    #[error("request rate limited")]
    RateLimited,
    #[error("server unavailable")]
    Server,
    #[error("network request failed")]
    Network,
    #[error("TLS authentication failed")]
    Tls,
    #[error("invalid server response")]
    InvalidResponse,
    #[error("server response too large")]
    ResponseTooLarge,
    #[error("stream timed out")]
    StreamTimeout,
    #[error("invalid event stream")]
    InvalidStream,
}

pub fn validate_address(value: &str) -> Result<(), ViewerError> {
    address::Address::parse(value).map(|_| ())
}
