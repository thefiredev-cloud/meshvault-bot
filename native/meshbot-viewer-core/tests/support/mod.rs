use std::{net::{SocketAddr, TcpListener}, time::Duration};

use aws_lc_rs::digest::{SHA256, digest};
use axum::Router;
use axum_server::{Handle, tls_rustls::RustlsConfig};
use rcgen::{
    CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair, KeyUsagePurpose,
    PKCS_ECDSA_P256_SHA256, date_time_ymd,
};
use x509_parser::{certificate::X509Certificate, prelude::FromDer};

pub struct TestServer {
    port: u16,
    pin: String,
    handle: Handle<SocketAddr>,
}

impl TestServer {
    pub async fn start(router: Router) -> Self {
        let mut params = CertificateParams::new(vec!["127.0.0.1".to_owned()]).unwrap();
        params.not_before = date_time_ymd(2026, 1, 1);
        params.not_after = date_time_ymd(2027, 1, 1);
        params.is_ca = IsCa::ExplicitNoCa;
        params.key_usages = vec![KeyUsagePurpose::DigitalSignature];
        params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
        let key = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256).unwrap();
        let certificate = params.self_signed(&key).unwrap().der().to_vec();
        let (_, parsed) = X509Certificate::from_der(&certificate).unwrap();
        let pin = encode_base64url(digest(&SHA256, parsed.public_key().raw).as_ref());
        let config = RustlsConfig::from_der(vec![certificate], key.serialize_der())
            .await
            .unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = Handle::new();
        let server = axum_server::from_tcp_rustls(listener, config)
            .unwrap()
            .handle(handle.clone())
            .serve(router.into_make_service());
        drop(tokio::spawn(server));
        Self { port, pin, handle }
    }

    pub fn pairing_uri(&self) -> String {
        format!(
            "meshvault://pair?v=2&transport=https&trust=spki-sha256&address=127.0.0.1%3A{}&spki={}&code=mesh-7F2K-XR9Q-4M8V",
            self.port, self.pin
        )
    }

    pub fn pairing_uri_with_pin(&self, pin: &str) -> String {
        self.pairing_uri().replacen(&self.pin, pin, 1)
    }

    pub fn https_url(&self, path: &str) -> String {
        format!("https://127.0.0.1:{}{path}", self.port)
    }
}

impl Drop for TestServer {
    fn drop(&mut self) {
        self.handle
            .graceful_shutdown(Some(Duration::from_millis(100)));
    }
}

fn encode_base64url(input: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut output = String::new();
    let mut accumulator = 0_u32;
    let mut bits = 0_u8;
    for byte in input {
        accumulator = (accumulator << 8) | u32::from(*byte);
        bits += 8;
        while bits >= 6 {
            bits -= 6;
            output.push(ALPHABET[((accumulator >> bits) & 0x3f) as usize] as char);
            accumulator &= (1_u32 << bits).wrapping_sub(1);
        }
    }
    if bits != 0 {
        output.push(ALPHABET[((accumulator << (6 - bits)) & 0x3f) as usize] as char);
    }
    output
}
