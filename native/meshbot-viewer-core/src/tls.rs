use std::{fmt, net::IpAddr, sync::Arc};

use aws_lc_rs::digest::{SHA256, digest};
use rustls::{
    CertificateError, ClientConfig, DigitallySignedStruct, Error as RustlsError, SignatureScheme,
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    crypto::{
        WebPkiSupportedAlgorithms, verify_tls12_signature, verify_tls13_signature,
    },
    pki_types::{CertificateDer, ServerName, UnixTime},
};
use subtle::ConstantTimeEq;
use x509_parser::{
    certificate::X509Certificate,
    extensions::{GeneralName, ParsedExtension},
    prelude::FromDer,
};

use crate::{ViewerError, address::ExpectedHost};

const MAX_CERTIFICATE_LIFETIME_SECONDS: i64 = 370 * 24 * 60 * 60;
const OID_EC_PUBLIC_KEY: &str = "1.2.840.10045.2.1";
const OID_P256: &str = "1.2.840.10045.3.1.7";
const OID_ECDSA_SHA256: &str = "1.2.840.10045.4.3.2";

pub(crate) struct PinnedServerCertVerifier {
    expected_host: ExpectedHost,
    expected_pin: [u8; 32],
    supported: WebPkiSupportedAlgorithms,
}

impl PinnedServerCertVerifier {
    pub(crate) fn new(expected_host: ExpectedHost, expected_pin: [u8; 32]) -> Self {
        Self {
            expected_host,
            expected_pin,
            supported: rustls::crypto::aws_lc_rs::default_provider()
                .signature_verification_algorithms,
        }
    }

    fn reject() -> RustlsError {
        RustlsError::InvalidCertificate(CertificateError::ApplicationVerificationFailure)
    }

    fn certificate_is_allowed(&self, der: &[u8], now: UnixTime) -> bool {
        let Ok((remainder, certificate)) = X509Certificate::from_der(der) else {
            return false;
        };
        if !remainder.is_empty()
            || certificate.subject() != certificate.issuer()
            || certificate.verify_signature(None).is_err()
            || !valid_time(&certificate, now)
            || !valid_algorithms(&certificate)
            || !valid_extensions(&certificate)
            || !valid_san(&certificate, &self.expected_host)
        {
            return false;
        }

        let actual = digest(&SHA256, certificate.public_key().raw);
        actual
            .as_ref()
            .ct_eq(&self.expected_pin)
            .into()
    }

    fn server_name_matches(&self, server_name: &ServerName<'_>) -> bool {
        match &self.expected_host {
            ExpectedHost::Dns(expected) => server_name.to_str().as_ref() == expected,
            ExpectedHost::Ip(expected) => server_name.to_str().as_ref() == expected.to_string(),
        }
    }
}

impl fmt::Debug for PinnedServerCertVerifier {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("PinnedServerCertVerifier")
    }
}

impl ServerCertVerifier for PinnedServerCertVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        if !intermediates.is_empty()
            || !self.server_name_matches(server_name)
            || !self.certificate_is_allowed(end_entity.as_ref(), now)
        {
            return Err(Self::reject());
        }
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        certificate: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls12_signature(message, certificate, signature, &self.supported)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        certificate: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls13_signature(message, certificate, signature, &self.supported)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.supported.supported_schemes()
    }
}

pub(crate) fn client_config(
    expected_host: ExpectedHost,
    expected_pin: [u8; 32],
) -> Result<ClientConfig, ViewerError> {
    let provider = Arc::new(rustls::crypto::aws_lc_rs::default_provider());
    ClientConfig::builder_with_provider(provider)
        .with_protocol_versions(&[&rustls::version::TLS13, &rustls::version::TLS12])
        .map_err(|_| ViewerError::Tls)
        .map(|builder| {
            builder
                .dangerous()
                .with_custom_certificate_verifier(Arc::new(PinnedServerCertVerifier::new(
                    expected_host,
                    expected_pin,
                )))
                .with_no_client_auth()
        })
}

fn valid_time(certificate: &X509Certificate<'_>, now: UnixTime) -> bool {
    let Ok(now) = i64::try_from(now.as_secs()) else {
        return false;
    };
    let not_before = certificate.validity().not_before.timestamp();
    let not_after = certificate.validity().not_after.timestamp();
    not_before <= now
        && now <= not_after
        && not_after > not_before
        && not_after - not_before <= MAX_CERTIFICATE_LIFETIME_SECONDS
}

fn valid_algorithms(certificate: &X509Certificate<'_>) -> bool {
    let public_key = certificate.public_key();
    let curve = public_key
        .algorithm
        .parameters
        .as_ref()
        .and_then(|parameters| parameters.as_oid().ok());
    public_key.algorithm.algorithm.to_id_string() == OID_EC_PUBLIC_KEY
        && curve.is_some_and(|oid| oid.to_id_string() == OID_P256)
        && public_key.subject_public_key.data.len() == 65
        && public_key.subject_public_key.data.first() == Some(&4)
        && certificate.signature_algorithm.algorithm.to_id_string() == OID_ECDSA_SHA256
        && certificate
            .tbs_certificate
            .signature
            .algorithm
            .to_id_string()
            == OID_ECDSA_SHA256
}

fn valid_extensions(certificate: &X509Certificate<'_>) -> bool {
    let mut basic_constraints = None;
    let mut key_usage = None;
    let mut extended_key_usage = None;
    for extension in certificate.extensions() {
        match extension.parsed_extension() {
            ParsedExtension::BasicConstraints(value) => {
                if basic_constraints.replace(value).is_some() {
                    return false;
                }
            }
            ParsedExtension::KeyUsage(value) => {
                if key_usage.replace(value).is_some() {
                    return false;
                }
            }
            ParsedExtension::ExtendedKeyUsage(value) => {
                if extended_key_usage.replace(value).is_some() {
                    return false;
                }
            }
            _ => {}
        }
    }

    basic_constraints.is_some_and(|value| !value.ca)
        && key_usage.is_some_and(|value| {
            value.digital_signature() && !value.key_cert_sign() && !value.crl_sign()
        })
        && extended_key_usage.is_some_and(|value| {
            value.server_auth
                && !value.any
                && !value.client_auth
                && !value.code_signing
                && !value.email_protection
                && !value.time_stamping
                && !value.ocsp_signing
                && value.other.is_empty()
        })
}

fn valid_san(certificate: &X509Certificate<'_>, expected_host: &ExpectedHost) -> bool {
    let mut san = None;
    for extension in certificate.extensions() {
        if let ParsedExtension::SubjectAlternativeName(value) = extension.parsed_extension() {
            if san.replace(value).is_some() {
                return false;
            }
        }
    }
    let Some(san) = san else {
        return false;
    };
    let mut matched = false;
    for name in &san.general_names {
        match name {
            GeneralName::DNSName(name) => {
                if name.contains('*') {
                    return false;
                }
                if matches!(expected_host, ExpectedHost::Dns(expected) if name == expected) {
                    matched = true;
                }
            }
            GeneralName::IPAddress(bytes) => {
                let candidate = match bytes.len() {
                    4 => <[u8; 4]>::try_from(*bytes)
                        .ok()
                        .map(std::net::Ipv4Addr::from)
                        .map(IpAddr::V4),
                    16 => <[u8; 16]>::try_from(*bytes)
                        .ok()
                        .map(std::net::Ipv6Addr::from)
                        .map(IpAddr::V6),
                    _ => None,
                };
                if matches!(expected_host, ExpectedHost::Ip(expected) if candidate.as_ref() == Some(expected)) {
                    matched = true;
                }
            }
            _ => {}
        }
    }
    matched
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use aws_lc_rs::digest::{SHA256, digest};
    use rcgen::{
        BasicConstraints, CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair,
        KeyUsagePurpose, PKCS_ECDSA_P256_SHA256, PKCS_ECDSA_P384_SHA384, date_time_ymd,
    };
    use rustls::{
        client::danger::ServerCertVerifier,
        pki_types::{CertificateDer, ServerName, UnixTime},
    };
    use x509_parser::{certificate::X509Certificate, prelude::FromDer};

    use super::PinnedServerCertVerifier;
    use crate::address::ExpectedHost;

    const TEST_NOW: u64 = 1_776_000_000;

    fn valid_params(name: &str) -> CertificateParams {
        let mut params = CertificateParams::new(vec![name.to_owned()]).unwrap();
        params.not_before = date_time_ymd(2026, 1, 1);
        params.not_after = date_time_ymd(2027, 1, 1);
        params.is_ca = IsCa::ExplicitNoCa;
        params.key_usages = vec![KeyUsagePurpose::DigitalSignature];
        params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
        params
    }

    fn certificate(params: CertificateParams, algorithm: &'static rcgen::SignatureAlgorithm) -> Vec<u8> {
        let key = KeyPair::generate_for(algorithm).unwrap();
        params.self_signed(&key).unwrap().der().to_vec()
    }

    fn pin(der: &[u8]) -> [u8; 32] {
        let (_, cert) = X509Certificate::from_der(der).unwrap();
        digest(&SHA256, cert.public_key().raw)
            .as_ref()
            .try_into()
            .unwrap()
    }

    fn verify(der: &[u8], expected_pin: [u8; 32], intermediates: &[CertificateDer<'static>]) -> bool {
        let verifier = PinnedServerCertVerifier::new(
            ExpectedHost::Dns("localhost".to_owned()),
            expected_pin,
        );
        let server_name = ServerName::try_from("localhost").unwrap();
        verifier
            .verify_server_cert(
                &CertificateDer::from(der.to_vec()),
                intermediates,
                &server_name,
                &[],
                UnixTime::since_unix_epoch(Duration::from_secs(TEST_NOW)),
            )
            .is_ok()
    }

    #[test]
    fn accepts_one_current_self_signed_p256_server_certificate_with_the_exact_pin_and_san() {
        let der = certificate(valid_params("localhost"), &PKCS_ECDSA_P256_SHA256);
        assert!(verify(&der, pin(&der), &[]));
    }

    #[test]
    fn rejects_wrong_pin_san_wildcard_and_intermediate_chain() {
        let der = certificate(valid_params("localhost"), &PKCS_ECDSA_P256_SHA256);
        let wrong_san = certificate(valid_params("other.local"), &PKCS_ECDSA_P256_SHA256);
        let wildcard = certificate(valid_params("*.local"), &PKCS_ECDSA_P256_SHA256);
        assert!(!verify(&der, [0x55; 32], &[]));
        assert!(!verify(&wrong_san, pin(&wrong_san), &[]));
        assert!(!verify(&wildcard, pin(&wildcard), &[]));
        assert!(!verify(
            &der,
            pin(&der),
            &[CertificateDer::from(der.clone())],
        ));
    }

    #[test]
    fn rejects_missing_or_unsafe_basic_constraints_key_usage_and_extended_key_usage() {
        let mut missing_bc = valid_params("localhost");
        missing_bc.is_ca = IsCa::NoCa;
        let mut ca = valid_params("localhost");
        ca.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        let mut missing_ku = valid_params("localhost");
        missing_ku.key_usages.clear();
        let mut signing_ca = valid_params("localhost");
        signing_ca.key_usages.push(KeyUsagePurpose::KeyCertSign);
        let mut missing_eku = valid_params("localhost");
        missing_eku.extended_key_usages.clear();
        let mut client_eku = valid_params("localhost");
        client_eku
            .extended_key_usages
            .push(ExtendedKeyUsagePurpose::ClientAuth);

        for der in [
            certificate(missing_bc, &PKCS_ECDSA_P256_SHA256),
            certificate(ca, &PKCS_ECDSA_P256_SHA256),
            certificate(missing_ku, &PKCS_ECDSA_P256_SHA256),
            certificate(signing_ca, &PKCS_ECDSA_P256_SHA256),
            certificate(missing_eku, &PKCS_ECDSA_P256_SHA256),
            certificate(client_eku, &PKCS_ECDSA_P256_SHA256),
        ] {
            assert!(!verify(&der, pin(&der), &[]));
        }
    }

    #[test]
    fn rejects_wrong_curve_signature_validity_lifetime_and_self_signature() {
        let p384 = certificate(valid_params("localhost"), &PKCS_ECDSA_P384_SHA384);

        let mut expired = valid_params("localhost");
        expired.not_before = date_time_ymd(2024, 1, 1);
        expired.not_after = date_time_ymd(2025, 1, 1);
        let expired = certificate(expired, &PKCS_ECDSA_P256_SHA256);

        let mut future = valid_params("localhost");
        future.not_before = date_time_ymd(2028, 1, 1);
        future.not_after = date_time_ymd(2029, 1, 1);
        let future = certificate(future, &PKCS_ECDSA_P256_SHA256);

        let mut too_long = valid_params("localhost");
        too_long.not_before = date_time_ymd(2026, 1, 1);
        too_long.not_after = date_time_ymd(2028, 1, 1);
        let too_long = certificate(too_long, &PKCS_ECDSA_P256_SHA256);

        let mut bad_signature = certificate(valid_params("localhost"), &PKCS_ECDSA_P256_SHA256);
        let last = bad_signature.last_mut().unwrap();
        *last ^= 1;

        for der in [p384, expired, future, too_long, bad_signature] {
            assert!(!verify(&der, pin(&der), &[]));
        }
    }

    #[test]
    fn verifier_debug_is_redacted_and_schemes_come_from_the_crypto_provider() {
        let verifier = PinnedServerCertVerifier::new(
            ExpectedHost::Dns("secret-node.local".to_owned()),
            [0x77; 32],
        );
        assert_eq!(format!("{verifier:?}"), "PinnedServerCertVerifier");
        assert_eq!(
            verifier.supported_verify_schemes(),
            rustls::crypto::aws_lc_rs::default_provider()
                .signature_verification_algorithms
                .supported_schemes()
        );
    }
}
