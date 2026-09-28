use std::collections::BTreeMap;

use url::{Url, form_urlencoded};
use zeroize::Zeroizing;

use crate::{ViewerError, address::Address};

pub struct PairingUri {
    pub(crate) address: Address,
    pub(crate) pin: [u8; 32],
    pub(crate) code: Zeroizing<String>,
}

impl PairingUri {
    pub fn parse(value: &str) -> Result<Self, ViewerError> {
        if value.is_empty()
            || value.len() > 2_048
            || !value.is_ascii()
            || !value.starts_with("meshvault://pair")
        {
            return Err(ViewerError::InvalidPairingUri);
        }
        let url = Url::parse(value).map_err(|_| ViewerError::InvalidPairingUri)?;
        if url.scheme() != "meshvault"
            || url.host_str() != Some("pair")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
            || !(url.path().is_empty() || url.path() == "/")
            || url.fragment().is_some()
        {
            return Err(ViewerError::InvalidPairingUri);
        }

        let raw_query = url.query().ok_or(ViewerError::InvalidPairingUri)?;
        let fields = parse_fields(raw_query)?;
        if fields.len() != 6
            || fields.get("v").map(String::as_str) != Some("2")
            || fields.get("transport").map(String::as_str) != Some("https")
            || fields.get("trust").map(String::as_str) != Some("spki-sha256")
        {
            return Err(ViewerError::InvalidPairingUri);
        }

        let raw_address = fields
            .get("address")
            .ok_or(ViewerError::InvalidPairingUri)?;
        let address = Address::parse(raw_address).map_err(|_| ViewerError::InvalidPairingUri)?;
        if !address.is_canonical(raw_address) {
            return Err(ViewerError::InvalidPairingUri);
        }
        let raw_pin = fields.get("spki").ok_or(ViewerError::InvalidPairingUri)?;
        let pin = decode_pin(raw_pin)?;
        let code = fields.get("code").ok_or(ViewerError::InvalidPairingUri)?;
        if !valid_code(code) {
            return Err(ViewerError::InvalidPairingUri);
        }

        Ok(Self {
            address,
            pin,
            code: Zeroizing::new(code.clone()),
        })
    }
}

fn parse_fields(raw_query: &str) -> Result<BTreeMap<String, String>, ViewerError> {
    let mut fields = BTreeMap::new();
    let components = raw_query.split('&').collect::<Vec<_>>();
    if components.len() != 6 {
        return Err(ViewerError::InvalidPairingUri);
    }
    for component in components {
        let (raw_key, raw_value) = component
            .split_once('=')
            .ok_or(ViewerError::InvalidPairingUri)?;
        if raw_value.contains('=') || raw_key.is_empty() || raw_value.is_empty() {
            return Err(ViewerError::InvalidPairingUri);
        }
        let decoded = form_urlencoded::parse(component.as_bytes()).collect::<Vec<_>>();
        if decoded.len() != 1 {
            return Err(ViewerError::InvalidPairingUri);
        }
        let key = decoded[0].0.as_ref();
        let value = decoded[0].1.as_ref();
        let canonical = form_urlencoded::Serializer::new(String::new())
            .append_pair(key, value)
            .finish();
        if canonical != component
            || !matches!(key, "v" | "transport" | "trust" | "address" | "spki" | "code")
            || fields.insert(key.to_owned(), value.to_owned()).is_some()
        {
            return Err(ViewerError::InvalidPairingUri);
        }
        if raw_key != key && !raw_key.is_empty() {
            return Err(ViewerError::InvalidPairingUri);
        }
    }
    Ok(fields)
}

fn valid_code(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("mesh-") else {
        return false;
    };
    let mut groups = rest.split('-');
    (0..3).all(|_| {
        groups.next().is_some_and(|group| {
            group.len() == 4
                && group
                    .bytes()
                    .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
        })
    }) && groups.next().is_none()
}

fn decode_pin(value: &str) -> Result<[u8; 32], ViewerError> {
    if value.len() != 43 || value.contains('=') {
        return Err(ViewerError::InvalidPairingUri);
    }
    let mut output = Vec::with_capacity(32);
    let mut accumulator = 0_u32;
    let mut bits = 0_u8;
    for byte in value.bytes() {
        let part = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            _ => return Err(ViewerError::InvalidPairingUri),
        };
        accumulator = (accumulator << 6) | u32::from(part);
        bits += 6;
        while bits >= 8 {
            bits -= 8;
            output.push(((accumulator >> bits) & 0xff) as u8);
            accumulator &= (1_u32 << bits).wrapping_sub(1);
        }
    }
    if bits != 2 || accumulator != 0 || output.len() != 32 {
        return Err(ViewerError::InvalidPairingUri);
    }
    output
        .try_into()
        .map_err(|_| ViewerError::InvalidPairingUri)
}
