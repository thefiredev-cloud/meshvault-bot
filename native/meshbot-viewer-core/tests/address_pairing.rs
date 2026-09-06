use meshbot_viewer_core::{PairingUri, ViewerError, validate_address};

const PIN: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CODE: &str = "mesh-7F2K-XR9Q-4M8V";

fn uri(address: &str) -> String {
    let encoded = address
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect::<String>();
    format!(
        "meshvault://pair?v=2&transport=https&trust=spki-sha256&address={encoded}&spki={PIN}&code={CODE}"
    )
}

#[test]
fn accepts_only_private_canonical_node_addresses() {
    for address in [
        "10.0.0.1:8484",
        "172.16.0.1:443",
        "172.31.255.255:65535",
        "192.168.1.10:8484",
        "100.64.0.1:8484",
        "100.127.255.254:8484",
        "127.0.0.1:8484",
        "[::1]:8484",
        "[fd7a:115c:a1e0::1]:8484",
        "desktop:8484",
        "desktop.local:8484",
        "node.tail123.ts.net:8484",
        "localhost:8484",
    ] {
        assert!(validate_address(address).is_ok(), "{address}");
    }
}

#[test]
fn applies_the_default_port_only_to_direct_address_validation() {
    assert!(validate_address("desktop").is_ok());
    assert!(validate_address("192.168.1.2").is_ok());
    assert!(PairingUri::parse(&uri("desktop:8484")).is_ok());
    assert!(PairingUri::parse(&uri("desktop")).is_err());
}

#[test]
fn rejects_public_ambiguous_and_non_ascii_addresses() {
    for address in [
        "8.8.8.8:8484",
        "100.128.0.1:8484",
        "172.32.0.1:8484",
        "169.254.1.1:8484",
        "[fe80::1]:8484",
        "example.com:8484",
        "foo.example:8484",
        "https://desktop:8484",
        "user@desktop:8484",
        "desktop:8484/path",
        "desktop:8484?x=1",
        "desktop:8484#x",
        "desktop :8484",
        "desktop\n:8484",
        "desktop:0",
        "desktop:65536",
        "desktop:08484",
        "fd7a:115c:a1e0::1:8484",
        "[fd7a:115c:a1e0::1%en0]:8484",
        "désktop:8484",
        "-desktop:8484",
        "desktop-:8484",
        "desk_top:8484",
        "a..local:8484",
    ] {
        assert!(validate_address(address).is_err(), "{address}");
    }
}

#[test]
fn pairing_uri_accepts_the_exact_v2_contract() {
    assert!(PairingUri::parse(&uri("desktop.local:8484")).is_ok());
    assert!(PairingUri::parse(&uri("[fd7a:115c:a1e0::1]:8484")).is_ok());
}

#[test]
fn pairing_uri_rejects_boundary_changes_and_field_smuggling() {
    let valid = uri("desktop.local:8484");
    for invalid in [
        valid.replacen("meshvault", "https", 1),
        valid.replacen("//pair", "//user@pair", 1),
        valid.replacen("//pair", "//pair:8484", 1),
        valid.replacen("//pair?", "//pair/path?", 1),
        format!("{valid}#fragment"),
        valid.replacen("v=2", "v=1", 1),
        valid.replacen("transport=https", "transport=http", 1),
        valid.replacen("trust=spki-sha256", "trust=system", 1),
        format!("{valid}&v=2"),
        format!("{valid}&unknown=x"),
        valid.replacen("&code=", "&code=x&code=", 1),
    ] {
        assert!(PairingUri::parse(&invalid).is_err());
    }
}

#[test]
fn pairing_uri_rejects_noncanonical_encoding_values_and_pins() {
    let valid = uri("desktop.local:8484");
    for invalid in [
        valid.replacen("%3A", "%3a", 1),
        valid.replacen("desktop", "%64esktop", 1),
        valid.replacen("address=desktop", "address=Desktop", 1),
        valid.replacen(CODE, "mesh-7f2k-xr9q-4m8v", 1),
        valid.replacen(PIN, "AAAA", 1),
        valid.replacen(PIN, &format!("{PIN}="), 1),
        valid.replacen(PIN, "___________________________________________", 1),
    ] {
        assert!(PairingUri::parse(&invalid).is_err());
    }
}

#[test]
fn validation_errors_are_fixed_and_redacted() {
    let secret = "private.example.com:9443";
    let error = match validate_address(secret) {
        Ok(()) => panic!("public address unexpectedly accepted"),
        Err(error) => error,
    };
    assert_eq!(error, ViewerError::InvalidAddress);
    assert_eq!(error.to_string(), "invalid address");
    assert!(!format!("{error:?}").contains(secret));
}
