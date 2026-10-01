require_relative "inspect-legacy-review"

VERSION_ID = "8e3f3723-950c-421a-83c3-19e941dc2481"
PREVIOUS_BUILD_ID = "923201e7-740b-4f69-adef-e5def58213d4"
TARGET_BUILD_ID = "bcf41846-b277-418f-b2b4-bf078aa3a4b8"

begin
  raise "OWNER_SELECTION_APPROVAL_REQUIRED" unless ENV["SELECTION_CONFIRMATION"] == "SELECT_LEGACY_BUILD_98_ONLY_NO_SUBMISSION"
  token = apple_token
  app = read_apple("/v1/apps/#{APP_ID}?fields%5Bapps%5D=bundleId", token).fetch("data")
  raise "TARGET_BUNDLE_MISMATCH" unless app.dig("attributes", "bundleId") == BUNDLE
  version_query = URI.encode_www_form("include" => "build", "limit" => "200")
  versions_path = "/v1/apps/#{APP_ID}/appStoreVersions?#{version_query}"
  version = read_apple(versions_path, token).fetch("data").find { |v| v["id"] == VERSION_ID }
  raise "TARGET_VERSION_MISSING" unless version
  raise "TARGET_PLATFORM_MISMATCH" unless version.dig("attributes", "platform") == "IOS"
  raise "VERSION_NOT_EDITABLE" unless %w[REJECTED METADATA_REJECTED PREPARE_FOR_SUBMISSION].include?(version.dig("attributes", "appStoreState"))
  current = version.dig("relationships", "build", "data", "id")
  raise "CURRENT_BUILD_CHANGED_STOP" unless [PREVIOUS_BUILD_ID, TARGET_BUILD_ID].include?(current)

  query = URI.encode_www_form("filter[app]" => APP_ID, "filter[version]" => "93,98",
    "include" => "app,preReleaseVersion", "fields[apps]" => "bundleId",
    "fields[preReleaseVersions]" => "version,platform",
    "fields[builds]" => "version,processingState,expired,buildAudienceType,preReleaseVersion,app",
    "limit" => "200")
  builds = read_apple("/v1/builds?#{query}", token)
  target = builds.fetch("data").find { |b| b["id"] == TARGET_BUILD_ID }
  previous = builds.fetch("data").find { |b| b["id"] == PREVIOUS_BUILD_ID }
  raise "EXPECTED_BUILDS_MISSING" unless target && previous
  raise "TARGET_BUILD_NUMBER_MISMATCH" unless target.dig("attributes", "version") == "98"
  raise "TARGET_BUILD_APP_MISMATCH" unless target.dig("relationships", "app", "data", "id") == APP_ID
  raise "TARGET_BUILD_NOT_ELIGIBLE" unless target.dig("attributes", "processingState") == "VALID" &&
    target.dig("attributes", "expired") == false && target.dig("attributes", "buildAudienceType") == "APP_STORE_ELIGIBLE"
  raise "MARKETING_VERSION_MISMATCH" unless target.dig("relationships", "preReleaseVersion", "data", "id") ==
    previous.dig("relationships", "preReleaseVersion", "data", "id")

  unless current == TARGET_BUILD_ID
    # The sole permitted write. Never creates a review submission or release.
    uri = URI("https://api.appstoreconnect.apple.com/v1/appStoreVersions/#{VERSION_ID}/relationships/build")
    http = Net::HTTP.new(uri.host, 443)
    http.use_ssl = true
    http.open_timeout, http.read_timeout = 15, 30
    request = Net::HTTP::Patch.new(uri.request_uri)
    request["Authorization"] = "Bearer #{token}"
    request["Content-Type"] = "application/json"
    request.body = JSON.generate(data: { type: "builds", id: TARGET_BUILD_ID })
    response = http.request(request)
    unless response.code == "204"
      body = JSON.parse(response.body)
      puts "APPLE_SELECTION_ERROR: #{JSON.generate(http: response.code, errors: Array(body["errors"]).map { |e| e.slice("code", "title", "detail") })}"
      raise "BUILD_SELECTION_HTTP_#{response.code}"
    end
  end

  after = read_apple(versions_path, token).fetch("data").find { |v| v["id"] == VERSION_ID }
  raise "SELECTION_NOT_CONFIRMED" unless after && after.dig("relationships", "build", "data", "id") == TARGET_BUILD_ID
  puts "LEGACY_BUILD_SELECTION_CONFIRMED: #{JSON.generate(app: APP_ID, version: after.dig("attributes", "versionString"), selected_build: "98", state: after.dig("attributes", "appStoreState"))}"
  puts "NO_NATIVE_BUILD_NO_REVIEW_SUBMISSION_NO_OTHER_APP_WRITES"
rescue StandardError => error
  category = error.message.match?(/\A[A-Z_0-9]+\z/) ? error.message : "SAFE_SELECTION_FAILURE"
  puts "LEGACY_BUILD_SELECTION_STOPPED: #{category}"
  exit 1
end