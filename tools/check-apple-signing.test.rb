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
inventory_record = {
  "id" => "synthetic-certificate", "attributes" => {
    "certificateType" => "DISTRIBUTION", "expirationDate" => (Time.now + 3600).utc.iso8601,
    "serialNumber" => "123ABC", "platform" => "UNIVERSAL",
    "name" => "DO_NOT_PRINT_OWNER", "certificateContent" => "DO_NOT_PRINT_BYTES"
  }
}
profile = {
  "attributes" => { "profileType" => "IOS_APP_STORE", "profileState" => "ACTIVE",
    "name" => "DO_NOT_PRINT_PROFILE", "profileContent" => "DO_NOT_PRINT_PROFILE_BYTES" },
  "relationships" => {
    "bundleId" => { "data" => { "id" => "synthetic-bundle" } },
    "certificates" => { "data" => [{ "id" => "synthetic-certificate" }],
      "meta" => { "paging" => { "total" => 1 } } }
  }
}
inventory = AppleSigningDiagnostic.public_inventory([inventory_record], [profile],
  { "synthetic-bundle" => "com.synthetic.app" })
assert(inventory[:profile_links_complete] && inventory[:certificates].first[:listed_profiles].first[:bundle] == "com.synthetic.app",
       "public inventory associates certificate with listed app profile")
assert(!JSON.generate(inventory).include?("DO_NOT_PRINT"), "inventory excludes owner names and certificate/profile bytes")
incomplete = AppleSigningDiagnostic.public_inventory([inventory_record], [profile], {})
assert(!incomplete[:profile_links_complete], "missing app relationship never claims usage is complete")
truncated = Marshal.load(Marshal.dump(profile))
truncated["relationships"]["certificates"]["meta"]["paging"]["total"] = 2
assert(!AppleSigningDiagnostic.public_inventory([inventory_record], [truncated], { "synthetic-bundle" => "com.synthetic.app" })[:profile_links_complete],
       "truncated certificate relationship never claims usage is complete")
ambiguous = Marshal.load(Marshal.dump(profile))
ambiguous["relationships"]["certificates"].delete("meta")
assert(!AppleSigningDiagnostic.public_inventory([inventory_record], [ambiguous], { "synthetic-bundle" => "com.synthetic.app" })[:profile_links_complete],
       "missing relationship pagination evidence never claims usage is complete")
ambiguous["relationships"]["certificates"]["data"] = Array.new(50) { { "id" => "synthetic-certificate" } }
assert(!AppleSigningDiagnostic.public_inventory([inventory_record], [ambiguous], { "synthetic-bundle" => "com.synthetic.app" })[:profile_links_complete],
       "capped relationship without a total never claims usage is complete")
profile_pages = 0
profiles, bundles = AppleSigningDiagnostic.profile_inventory(->(url) {
  query = URI.decode_www_form(URI(url).query).to_h
  assert(query["fields[profiles]"] == "profileType,profileState,expirationDate,bundleId,certificates" &&
         query["fields[bundleIds]"] == "identifier" &&
         query["fields[certificates]"] == "certificateType,expirationDate,serialNumber,platform",
         "every profile page enforces sparse metadata fields")
  profile_pages += 1
  { "data" => [profile], "included" => [{ "id" => "synthetic-bundle", "type" => "bundleIds",
    "attributes" => { "identifier" => "com.synthetic.app" } }],
    "links" => { "next" => profile_pages == 1 ? "/v1/profiles?cursor=synthetic" : nil } }
})
assert(profiles.length == 2 && profile_pages == 2 && bundles["synthetic-bundle"] == "com.synthetic.app",
       "inventory follows all profile pages")
certificate_pages = 0
AppleSigningDiagnostic.certificate_records(->(url) {
  query = URI.decode_www_form(URI(url).query).to_h
  assert(query["fields[certificates]"] == "certificateType,expirationDate,serialNumber,platform" &&
         query["limit"] == "200" && !query.key?("include"),
         "every certificate inventory page enforces sparse metadata fields")
  certificate_pages += 1
  { "data" => [inventory_record], "links" => {
    "next" => certificate_pages == 1 ? "/v1/certificates?cursor=synthetic&fields%5Bcertificates%5D=certificateContent&include=passTypeId" : nil } }
}, "/v1/certificates", metadata_only: true)
assert(certificate_pages == 2, "certificate inventory preserves pagination while rejecting weakened fields")
blocked = false
begin
  AppleSigningDiagnostic.safe_uri("https://example.invalid/v1/profiles", allow_profiles: true)
rescue AppleSigningDiagnostic::Failure
  blocked = true
end
assert(blocked, "inventory cannot leak API token to another host")
puts "All synthetic Apple diagnostic tests passed; no Apple or secrets were accessed."