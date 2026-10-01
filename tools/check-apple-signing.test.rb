require_relative "check-apple-signing"

def assert(condition, label)
  raise "Synthetic assertion failed: #{label}" unless condition
  puts "PASS: #{label}"
end

def certificate(key, serial, team = AppleSigningDiagnostic::TEAM)
  cert = OpenSSL::X509::Certificate.new
  cert.version = 2
  cert.serial = serial
  cert.subject = OpenSSL::X509::Name.parse("/CN=Synthetic test only/OU=#{team}")
  cert.issuer = cert.subject
  cert.public_key = key.public_key
  cert.not_before = Time.now - 60
  cert.not_after = Time.now + 3600
  cert.sign(key, OpenSSL::Digest.new("SHA256"))
  cert
end

def record(cert, type = "IOS_DISTRIBUTION")
  { "id" => "synthetic-only", "attributes" => {
    "certificateType" => type, "certificateContent" => Base64.strict_encode64(cert.to_der)
  } }
end

key = OpenSSL::PKey::RSA.new(1024)
local = certificate(key, 1)
assert(AppleSigningDiagnostic.assess(local, [record(local)]).first == "APPLE_DISTRIBUTION_CERTIFICATE_ACTIVE",
       "exact active certificate")
assert(AppleSigningDiagnostic.assess(certificate(key, 2, "SYNTHETICOTHER"), []).first == "SIGNING_CERTIFICATE_TEAM_MISMATCH",
       "different team is not called a corrupt password")
assert(AppleSigningDiagnostic.assess(local, [record(certificate(OpenSSL::PKey::RSA.new(1024), 3))]).first == "APPLE_CERTIFICATE_NOT_IN_ACTIVE_LIST",
       "different active public key")
assert(AppleSigningDiagnostic.assess(local, [record(certificate(key, 4))]).first == "APPLE_ACTIVE_PUBLIC_KEY_MATCHES_DIFFERENT_CERTIFICATE",
       "same private key can match a different active certificate")
assert(AppleSigningDiagnostic.assess(local, [record(local, "IOS_DEVELOPMENT")]).first == "APPLE_MATCHED_CERTIFICATE_IS_NOT_DISTRIBUTION",
       "non-distribution certificate cannot pass")
assert(AppleSigningDiagnostic.assess(local, [{ "attributes" => { "certificateType" => "IOS_DISTRIBUTION" } }]).first == "APPLE_CERTIFICATE_CONTENT_INCOMPLETE",
       "omitted content is not proof of inactivity")
pages = 0
records = AppleSigningDiagnostic.certificate_records(->(_url) {
  pages += 1
  { "data" => [record(local)], "links" => { "next" => pages == 1 ? "/v1/certificates?cursor=synthetic" : nil } }
})
assert(records.length == 2 && pages == 2, "all certificate pages are read")
["https://example.invalid/v1/certificates", "http://api.appstoreconnect.apple.com/v1/certificates",
 "/v1/profiles", "https://user:pass@api.appstoreconnect.apple.com/v1/certificates"].each do |url|
  blocked = false
  begin
    AppleSigningDiagnostic.safe_uri(url)
  rescue AppleSigningDiagnostic::Failure
    blocked = true
  end
  assert(blocked, "unsafe read URL blocked")
end
puts "All synthetic Apple diagnostic tests passed; no Apple or secrets were accessed."