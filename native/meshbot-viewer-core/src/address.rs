use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use crate::ViewerError;

pub(crate) const DEFAULT_PORT: u16 = 8484;

pub(crate) enum ExpectedHost {
    Dns(String),
    Ip(IpAddr),
}

pub(crate) struct Address {
    authority: String,
    host: ExpectedHost,
}

impl Address {
    pub(crate) fn parse(value: &str) -> Result<Self, ViewerError> {
        if value.is_empty()
            || value.len() > 512
            || !value.is_ascii()
            || value.bytes().any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control())
            || value.contains("//")
            || value.contains(['@', '/', '?', '#', '%'])
        {
            return Err(ViewerError::InvalidAddress);
        }

        let (raw_host, port, bracketed) = split_authority(value)?;
        let host = parse_host(raw_host, bracketed)?;
        let authority = match &host {
            ExpectedHost::Dns(name) => format!("{name}:{port}"),
            ExpectedHost::Ip(IpAddr::V4(ip)) => format!("{ip}:{port}"),
            ExpectedHost::Ip(IpAddr::V6(ip)) => format!("[{ip}]:{port}"),
        };
        Ok(Self { authority, host })
    }

    pub(crate) fn is_canonical(&self, value: &str) -> bool {
        self.authority == value
    }

    pub(crate) fn into_parts(self) -> (String, ExpectedHost) {
        (self.authority, self.host)
    }
}

fn split_authority(value: &str) -> Result<(&str, u16, bool), ViewerError> {
    if let Some(rest) = value.strip_prefix('[') {
        let close = rest.find(']').ok_or(ViewerError::InvalidAddress)?;
        let host = &rest[..close];
        let suffix = &rest[close + 1..];
        if host.is_empty() || suffix.contains(']') {
            return Err(ViewerError::InvalidAddress);
        }
        let port = if suffix.is_empty() {
            DEFAULT_PORT
        } else {
            parse_port(
                suffix
                    .strip_prefix(':')
                    .ok_or(ViewerError::InvalidAddress)?,
            )?
        };
        return Ok((host, port, true));
    }

    if value.contains(['[', ']']) || value.matches(':').count() > 1 {
        return Err(ViewerError::InvalidAddress);
    }
    let (host, port) = match value.split_once(':') {
        Some((host, port)) => (host, parse_port(port)?),
        None => (value, DEFAULT_PORT),
    };
    if host.is_empty() {
        return Err(ViewerError::InvalidAddress);
    }
    Ok((host, port, false))
}

fn parse_port(value: &str) -> Result<u16, ViewerError> {
    if value.is_empty()
        || !value.bytes().all(|byte| byte.is_ascii_digit())
        || (value.len() > 1 && value.starts_with('0'))
    {
        return Err(ViewerError::InvalidAddress);
    }
    let port = value
        .parse::<u16>()
        .map_err(|_| ViewerError::InvalidAddress)?;
    if port == 0 || port.to_string() != value {
        return Err(ViewerError::InvalidAddress);
    }
    Ok(port)
}

fn parse_host(value: &str, bracketed: bool) -> Result<ExpectedHost, ViewerError> {
    if let Ok(ip) = value.parse::<IpAddr>() {
        match ip {
            IpAddr::V4(ip) if !bracketed && allowed_ipv4(ip) => {
                return Ok(ExpectedHost::Ip(IpAddr::V4(ip)));
            }
            IpAddr::V6(ip) if bracketed && allowed_ipv6(ip) => {
                return Ok(ExpectedHost::Ip(IpAddr::V6(ip)));
            }
            _ => return Err(ViewerError::InvalidAddress),
        }
    }
    if bracketed || !valid_dns_name(value) {
        return Err(ViewerError::InvalidAddress);
    }

    let name = value.to_ascii_lowercase();
    let allowed = !name.contains('.')
        || name == "localhost"
        || name.strip_suffix(".local").is_some_and(|prefix| !prefix.is_empty())
        || name.strip_suffix(".ts.net").is_some_and(|prefix| !prefix.is_empty());
    if !allowed {
        return Err(ViewerError::InvalidAddress);
    }
    Ok(ExpectedHost::Dns(name))
}

fn allowed_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, _, _] = ip.octets();
    a == 10
        || a == 127
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 100 && (64..=127).contains(&b))
}

fn allowed_ipv6(ip: Ipv6Addr) -> bool {
    ip.is_loopback() || (ip.octets()[0] & 0xfe) == 0xfc
}

fn valid_dns_name(value: &str) -> bool {
    if value.is_empty() || value.len() > 253 || value.starts_with('.') || value.ends_with('.') {
        return false;
    }
    value.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    })
}

