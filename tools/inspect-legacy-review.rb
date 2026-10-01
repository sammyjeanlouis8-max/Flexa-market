require "openssl"
require "base64"
require "json"
require "net/http"
require "uri"

# Read-only inspection of the legacy listing. No build, signing, or submission.
APP_ID = "6754947270"
BUNDLE = "com.flexamarket.mobile"

def apple_token
  raise "CREDENTIALS_UNAVAILABLE" unless %w[ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8].all? { |k| !ENV[k].to_s.empty? }
  encode = ->(v) { Base64.urlsafe_encode64(v, padding: false) }
  now = Time.now.to_i
  header = encode.call(JSON.generate(alg: "ES256", kid: ENV.fetch("ASC_KEY_ID"), typ: "JWT"))
  payload = encode.call(JSON.generate(iss: ENV.fetch("ASC_ISSUER_ID"), iat: now - 30, exp: now + 600, aud: "appstoreconnect-v1"))
  input = "#{header}.#{payload}"
  key = OpenSSL::PKey.read(ENV.fetch("ASC_KEY_P8").gsub("\\n", "\n"))
  raise "SIGNING_KEY_INVALID" unless key.is_a?(OpenSSL::PKey::EC) && key.group.curve_name == "prime256v1"
  signature = OpenSSL::ASN1.decode(key.sign("SHA256", input)).value.map { |i| i.value.to_s(2).rjust(32, "\x00") }.join
  raise "SIGNATURE_INVALID" unless signature.bytesize == 64
  "#{input}.#{encode.call(signature)}"
end

def read_apple(path, token)
  uri = URI.parse("https://api.appstoreconnect.apple.com#{path}")
  allowed = ["/v1/apps/#{APP_ID}", "/v1/apps/#{APP_ID}/appStoreVersions", "/v1/apps/#{APP_ID}/builds"]
  raise "READ_OUT_OF_SCOPE" unless allowed.include?(uri.path)
  http = Net::HTTP.new(uri.host, 443)
  http.use_ssl = true
  http.open_timeout = 15
  http.read_timeout = 30
  req = Net::HTTP::Get.new(uri.request_uri)
  req["Authorization"] = "Bearer #{token}"
  req["Accept"] = "application/json"
  response = http.request(req)
  raise "APPLE_HTTP_#{response.code}" unless response.code == "200"
  JSON.parse(response.body)
end

begin
  token = apple_token
  app = read_apple("/v1/apps/#{APP_ID}?fields%5Bapps%5D=bundleId", token).fetch("data")
  raise "TARGET_BUNDLE_MISMATCH" unless app.dig("attributes", "bundleId") == BUNDLE
  query = URI.encode_www_form("include" => "build", "limit" => "200")
  versions = read_apple("/v1/apps/#{APP_ID}/appStoreVersions?#{query}", token)
  builds = Array(versions["included"]).select { |r| r["type"] == "builds" }.to_h { |r| [r["id"], r["attributes"]] }
  rows = versions.fetch("data").map do |v|
    build_id = v.dig("relationships", "build", "data", "id")
    { version_id: v["id"], version: v.dig("attributes", "versionString"),
      platform: v.dig("attributes", "platform"), state: v.dig("attributes", "appStoreState"),
      selected_build_id: build_id, selected_build: builds.dig(build_id, "version"),
      build_processing_state: builds.dig(build_id, "processingState") }
  end
  puts "LEGACY_REVIEW_VERSIONS: #{JSON.generate(rows)}"
  query = URI.encode_www_form("filter[version]" => "98", "include" => "preReleaseVersion", "limit" => "200")
  available = read_apple("/v1/apps/#{APP_ID}/builds?#{query}", token)
  releases = Array(available["included"]).select { |r| r["type"] == "preReleaseVersions" }.to_h { |r| [r["id"], r["attributes"]] }
  candidates = available.fetch("data").map do |b|
    { build_id: b["id"], build: b.dig("attributes", "version"),
      marketing_version: releases.dig(b.dig("relationships", "preReleaseVersion", "data", "id"), "version"),
      processing_state: b.dig("attributes", "processingState"), expired: b.dig("attributes", "expired") }
  end
  puts "LEGACY_BUILD_98: #{JSON.generate(candidates)}"
  puts "READ_ONLY_COMPLETE_NO_BUILD_NO_SUBMISSION"
rescue StandardError => error
  category = error.message.match?(/\A[A-Z_0-9]+\z/) ? error.message : "SAFE_INSPECTION_FAILURE"
  puts "READ_ONLY_INSPECTION_STOPPED: #{category}"
  exit 1
end