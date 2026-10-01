# frozen_string_literal: true

# Synthetic fixtures only. This step never receives real signing secrets.
require_relative "check-ios-signing"

def assert_category(label, expected, encoded, password)
  result = SigningPreflight.check(encoded, password)
  unless result.category == expected
    raise "#{label}: expected #{expected}, got #{result.category}"
  end
  puts "PASS: #{label}"
end

key = OpenSSL::PKey::RSA.new(2048)
certificate = OpenSSL::X509::Certificate.new
certificate.version = 2
certificate.serial = 1
certificate.subject = OpenSSL::X509::Name.parse("/CN=Synthetic Preflight Test Only")
certificate.issuer = certificate.subject
certificate.public_key = key.public_key
certificate.not_before = Time.now - 60
certificate.not_after = Time.now + 3600
certificate.sign(key, OpenSSL::Digest::SHA256.new)

password = "Synthetic test password "
p12 = OpenSSL::PKCS12.create(
  password, "Synthetic fixture", key, certificate, nil,
  "AES-256-CBC", "AES-256-CBC", 2048, 2048
).to_der
encoded = Base64.strict_encode64(p12)

assert_category("missing P12", "P12_SECRET_MISSING", nil, password)
assert_category("missing password", "PASSWORD_SECRET_MISSING", encoded, nil)
assert_category("HTML is not Base64", "BASE64_INVALID", "<html>not a certificate</html>", password)
assert_category("Base64 text is not a P12", "P12_CONTAINER_INVALID", Base64.strict_encode64("text only"), password)
assert_category("certificate DER is not a P12", "P12_CONTAINER_INVALID", Base64.strict_encode64(certificate.to_der), password)
assert_category("valid local identity", "LOCAL_SIGNING_IDENTITY_VALID", encoded, password)
assert_category("Base64 line wrapping", "LOCAL_SIGNING_IDENTITY_VALID", encoded.scan(/.{1,64}/).join("\n "), password)
assert_category("intentional password space preserved", "P12_INTEGRITY_OR_DECRYPTION_FAILED", encoded, password.strip)
assert_category("wrong password", "P12_INTEGRITY_OR_DECRYPTION_FAILED", encoded, "Synthetic incorrect password")

future = SigningPreflight.check(encoded, password, now: Time.now + 7200)
raise "expired certificate classification failed" unless future.category == "CERTIFICATE_TIME_INVALID"
puts "PASS: expired certificate"
puts "All synthetic preflight tests passed. No real credentials were used."