# frozen_string_literal: true

require "base64"
require "digest"
require "stringio"
require "tmpdir"
require "uri"
require_relative "create-ios-certificate-once"

def assert(condition, label)
  raise "Synthetic assertion failed: #{label}" unless condition
  puts "PASS: #{label}"
end

def expect_category(category)
  yield
  raise "Synthetic assertion failed: expected #{category}"
rescue CreateIOSCertificateOnce::Failure => error
  assert(error.category == category, category)
end

def synthetic_certificate(key, serial, team = CreateIOSCertificateOnce::TEAM, subject = "DO_NOT_PRINT_OWNER")
  cert = OpenSSL::X509::Certificate.new
  cert.version = 2
  cert.serial = serial
  cert.subject = OpenSSL::X509::Name.new([["CN", subject], ["OU", team]])
  cert.issuer = cert.subject
  cert.public_key = key.public_key
  cert.not_before = Time.now - 60
  cert.not_after = Time.now + 3600
  cert.sign(key, OpenSSL::Digest.new("SHA256"))
  cert
end

def certificate_row(id, certificate, type = "IOS_DISTRIBUTION")
  {
    "id" => id,
    "type" => "certificates",
    "attributes" => {
      "certificateType" => type,
      "certificateContent" => Base64.strict_encode64(certificate.to_der)
    }
  }
end

def synthetic_identity(key, certificate)
  OpenSSL::PKCS12.create("synthetic password", "synthetic", key, certificate)
end

def decrypt_envelope(envelope, password)
  salt = Base64.strict_decode64(envelope.fetch("salt"))
  iv = Base64.strict_decode64(envelope.fetch("iv"))
  ciphertext_and_tag = Base64.strict_decode64(envelope.fetch("ciphertext"))
  cipher = OpenSSL::Cipher.new("aes-256-gcm")
  cipher.decrypt
  cipher.key = OpenSSL::PKCS5.pbkdf2_hmac(password.encode(Encoding::UTF_8), salt,
                                          200_000, 32, "SHA256")
  cipher.iv = iv
  cipher.auth_tag = ciphertext_and_tag[-16, 16]
  cipher.auth_data = "FlexaMarket public certificate v1".encode(Encoding::UTF_8)
  cipher.update(ciphertext_and_tag[0...-16]) + cipher.final
end

def perform_with(key:, local_certificate:, poster:, reader:, output_path:)
  CreateIOSCertificateOnce.perform(
    token: "synthetic-only",
    identity: Struct.new(:certificate, :key).new(local_certificate, key),
    certificate_password: "synthetic password",
    confirmation: CreateIOSCertificateOnce::APPROVAL,
    run_attempt: "1",
    reader: reader,
    poster: poster,
    output_path: output_path
  )
end

def fixture_route(value)
  uri = URI.parse(value)
  uri.query ? "#{uri.path}?#{uri.query}" : uri.path
end

def app_inventory_fixture(value, app_response, inventory_response)
  case fixture_route(value)
  when %r{\A/v1/apps\?}
    app_response
  when "/v1/certificates?limit=200"
    inventory_response
  else
    raise "Unexpected synthetic read path"
  end
end

assert(CreateIOSCertificateOnce::PUBLIC_ID_PATTERN.match?("47RTX579BA") &&
       CreateIOSCertificateOnce::PUBLIC_ID_PATTERN.match?("11111111-1111-4111-8111-111111111111"),
       "safe opaque Apple IDs and UUIDs are accepted")

key = OpenSSL::PKey::RSA.new(2048)
local = synthetic_certificate(key, 11)
p12 = synthetic_identity(key, local)
encoded_p12 = Base64.strict_encode64(p12.to_der)

assert(CreateIOSCertificateOnce.mac_data_present?(p12.to_der), "PKCS12 MAC is present")
assert(CreateIOSCertificateOnce.load_identity(encoded_p12, "synthetic password").key.public_to_der == key.public_to_der,
       "synthetic existing private key opens and matches")
no_mac = OpenSSL::ASN1::Sequence.new([
  OpenSSL::ASN1::Integer.new(3),
  OpenSSL::ASN1::Sequence.new([
    OpenSSL::ASN1::ObjectId.new("1.2.840.113549.1.7.1"),
    OpenSSL::ASN1::ASN1Data.new([], 0, :CONTEXT_SPECIFIC)
  ])
]).to_der
assert(!CreateIOSCertificateOnce.mac_data_present?(no_mac), "PKCS12 without MAC is rejected")
expect_category("P12_MAC_MISSING_OR_INVALID") do
  CreateIOSCertificateOnce.load_identity(Base64.strict_encode64(no_mac), "synthetic password")
end
expect_category("P12_INTEGRITY_OR_DECRYPTION_FAILED") do
  CreateIOSCertificateOnce.load_identity(encoded_p12, "wrong synthetic password")
end

expect_category("CREATE_ONCE_APPROVAL_REQUIRED") do
  CreateIOSCertificateOnce.guard!("not the exact approval", "1")
end
expect_category("CREATE_ONCE_RUN_ATTEMPT_INVALID") do
  CreateIOSCertificateOnce.guard!(CreateIOSCertificateOnce::APPROVAL, "2")
end

request = CreateIOSCertificateOnce.build_csr(key)
assert(request.verify(key.public_key) &&
       request.public_key.public_to_der == key.public_to_der &&
       request.signature_algorithm.to_s.match?(/sha256/i),
       "CSR is SHA256-signed and uses the existing private key")
assert(request.subject.to_s.include?(CreateIOSCertificateOnce::TEAM) &&
       request.subject.to_s.include?("FlexaMarket iOS Distribution") &&
       !request.subject.to_s.include?("DO_NOT_PRINT_OWNER"),
       "CSR subject is generic and contains no owner name")

app_response = { "data" => [{ "attributes" => { "bundleId" => CreateIOSCertificateOnce::BUNDLE } }] }
empty_inventory = { "data" => [], "links" => { "next" => nil } }
issued = synthetic_certificate(key, 22)
issued_id = "47RTX579BA"
issued_row = certificate_row(issued_id, issued)
confirmed_response = { "data" => issued_row }

Dir.mktmpdir("create-ios-certificate-synthetic") do |directory|
  output_path = File.join(directory, "issued.encrypted.json")
  requests = []
  reader = lambda do |path|
    route = fixture_route(path)
    if route.start_with?("/v1/apps?")
      app_response
    elsif route == "/v1/certificates?limit=200"
      empty_inventory
    elsif route == "/v1/certificates/#{issued_id}"
      confirmed_response
    else
      raise "Unexpected synthetic read path"
    end
  end
  poster = lambda do |path, payload|
    requests << [path, payload]
    csr = OpenSSL::X509::Request.new(Base64.strict_decode64(payload.dig("data", "attributes", "csrContent")))
    assert(path == "/v1/certificates" &&
           payload.dig("data", "attributes", "certificateType") == "IOS_DISTRIBUTION" &&
           csr.public_key.public_to_der == key.public_to_der,
           "single POST contains only IOS_DISTRIBUTION and same-key CSR")
    { "data" => issued_row }
  end
  outcome = perform_with(key: key, local_certificate: local, poster: poster,
                         reader: reader, output_path: output_path)
  assert(requests.length == 1, "successful path issues exactly one POST")
  envelope = JSON.parse(File.read(output_path))
  assert(envelope.keys.sort == %w[ciphertext format iterations iv kdf salt] &&
         envelope["format"] == "flexa-public-certificate-v1" &&
         envelope["kdf"] == "PBKDF2-SHA256" && envelope["iterations"] == 200_000 &&
         Base64.strict_decode64(envelope["salt"]).bytesize == 16 &&
         Base64.strict_decode64(envelope["iv"]).bytesize == 12 &&
         decrypt_envelope(envelope, "synthetic password") == issued.to_der,
         "exact public-certificate envelope decrypts to verified DER")
  assert(Dir.children(directory) == ["issued.encrypted.json"] &&
         !File.exist?(File.join(directory, "issued.cer")),
         "only the encrypted public certificate file is saved")

  expect_cipher_error = lambda do |label, modified_envelope, password|
    begin
      decrypt_envelope(modified_envelope, password)
      raise "Synthetic assertion failed: #{label}"
    rescue OpenSSL::Cipher::CipherError
      assert(true, label)
    end
  end
  expect_cipher_error.call("wrong envelope password fails authentication",
                           envelope, "wrong synthetic password")
  tampered = envelope.dup
  ciphertext_and_tag = Base64.strict_decode64(tampered.fetch("ciphertext"))
  ciphertext_and_tag[-1] = (ciphertext_and_tag.getbyte(-1) ^ 1).chr
  tampered["ciphertext"] = Base64.strict_encode64(ciphertext_and_tag)
  expect_cipher_error.call("tampered GCM tag fails authentication",
                           tampered, "synthetic password")

  output = StringIO.new
  CreateIOSCertificateOnce.emit_success(outcome, io: output)
  safe_output = output.string
  assert(safe_output.include?(issued_id) &&
         safe_output.include?("IOS_DISTRIBUTION") &&
         safe_output.include?(outcome.fetch(:expires)),
         "safe success output includes only certificate ID, type, and expiry")
  [issued.subject.to_s, issued.serial.to_s, Digest::SHA256.hexdigest(issued.to_der),
   Base64.strict_encode64(request.to_der), "DO_NOT_PRINT_OWNER"].each do |sensitive|
    assert(!safe_output.include?(sensitive), "success output excludes private details and certificate contents")
  end
end

Dir.mktmpdir("create-ios-certificate-synthetic") do |directory|
  output_path = File.join(directory, "issued.encrypted.json")
  count = 0
  reader = ->(path) { app_inventory_fixture(path, app_response, empty_inventory) }
  quota_response = Struct.new(:code, :body).new(
    "422",
    JSON.generate("errors" => [{ "code" => "CERTIFICATE_LIMIT_EXCEEDED",
      "detail" => "DO_NOT_PRINT_QUOTA_RESPONSE" }])
  )
  poster = lambda do |_path, _payload|
    count += 1
    CreateIOSCertificateOnce.decode_http_response(quota_response, :create)
  end
  expect_category("APPLE_CERTIFICATE_QUOTA_REACHED") do
    perform_with(key: key, local_certificate: local, poster: poster,
                 reader: reader, output_path: output_path)
  end
  assert(count == 1 && !File.exist?(output_path), "quota response produces one POST and no retry/artifact")
end

Dir.mktmpdir("create-ios-certificate-synthetic") do |directory|
  count = 0
  reader = ->(path) { app_inventory_fixture(path, app_response, empty_inventory) }
  poster = lambda do |_path, _payload|
    count += 1
    raise CreateIOSCertificateOnce::Failure.new("APPLE_CREATE_TIMEOUT_AMBIGUOUS")
  end
  expect_category("APPLE_CREATE_TIMEOUT_AMBIGUOUS") do
    perform_with(key: key, local_certificate: local, poster: poster,
                 reader: reader, output_path: File.join(directory, "issued.encrypted.json"))
  end
  assert(count == 1, "timeout stays ambiguous and is never retried")
end

[
  ["APPLE_CREATED_CERTIFICATE_TYPE_OR_ID_INVALID",
   { "data" => issued_row.merge("attributes" => issued_row.fetch("attributes").merge("certificateType" => "IOS_DEVELOPMENT")) }],
  ["APPLE_CREATED_CERTIFICATE_TEAM_MISMATCH",
   { "data" => certificate_row("22222222-2222-4222-8222-222222222222", synthetic_certificate(key, 23, "SYNTHETICOTHER")) }],
  ["APPLE_CREATED_CERTIFICATE_PUBLIC_KEY_MISMATCH",
   { "data" => certificate_row("33333333-3333-4333-8333-333333333333", synthetic_certificate(OpenSSL::PKey::RSA.new(2048), 24)) }]
].each do |category, invalid_response|
  Dir.mktmpdir("create-ios-certificate-synthetic") do |directory|
    post_count = 0
    reader = ->(path) { app_inventory_fixture(path, app_response, empty_inventory) }
    poster = lambda do |_path, _payload|
      post_count += 1
      invalid_response
    end
    expect_category(category) do
      perform_with(key: key, local_certificate: local, poster: poster,
                 reader: reader, output_path: File.join(directory, "issued.encrypted.json"))
    end
    assert(post_count == 1 && Dir.children(directory).empty?,
           "invalid Apple result stops without retry or public artifact")
  end
end

Dir.mktmpdir("create-ios-certificate-synthetic") do |directory|
  post_count = 0
  already_active = certificate_row("44444444-4444-4444-8444-444444444444", local)
  reader = lambda do |path|
    route = fixture_route(path)
    if route.start_with?("/v1/apps?")
      app_response
    elsif route == "/v1/certificates?limit=200"
      { "data" => [already_active], "links" => { "next" => nil } }
    else
      raise "Unexpected synthetic read path"
    end
  end
  poster = ->(_path, _payload) { post_count += 1 }
  expect_category("APPLE_ACTIVE_DISTRIBUTION_PUBLIC_KEY_MATCH") do
    perform_with(key: key, local_certificate: local, poster: poster,
                 reader: reader, output_path: File.join(directory, "issued.encrypted.json"))
  end
  assert(post_count.zero?, "active matching distribution key prevents any POST")
end

mock_response = Struct.new(:code, :body).new(
  "429",
  JSON.generate("errors" => [{ "code" => "RATE_LIMIT", "detail" => "DO_NOT_PRINT_PRIVATE_RESPONSE" }])
)
expect_category("APPLE_RATE_LIMITED") do
  CreateIOSCertificateOnce.decode_http_response(mock_response, :create)
end

puts "All synthetic one-time certificate tests passed; no Apple services or credentials were accessed."