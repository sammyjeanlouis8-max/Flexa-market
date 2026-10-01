# frozen_string_literal: true

# Validate the actual release call's configuration without running Sigh,
# requesting credentials, or making any Apple API request.
require "fastlane"
require "sigh"

begin
  source = File.read(File.expand_path("../artifacts/ios-native/fastlane/Fastfile", __dir__))
  calls = source.scan(/^[ \t]*get_provisioning_profile\((.*?)^[ \t]*\)/m)
  raise "ambiguous profile configuration" unless calls.length == 1
  api_key = { key_id: "DRY_RUN", issuer_id: "DRY_RUN", key_content: "DRY_RUN", in_house: false }
  registered_certificate = { "id" => "DRY_RUN_EXISTING_CERT_ID" }
  options = eval("{#{calls.first.first}}", binding, "synthetic-profile-options")
  available = Sigh::Options.available_options
  config = FastlaneCore::Configuration.create(available, options)
  raise "wrong application" unless config[:app_identifier] == "com.flexamarket.mobile"
  raise "certificate reuse missing" unless config[:cert_id] == registered_certificate.fetch("id")
  raise "wrong platform" unless config[:platform] == "ios"
  raise "non-App-Store flags" unless config[:adhoc] == false && config[:development] == false
  profile_type = Sigh.profile_type_for_config(platform: config[:platform], in_house: false, config: config)
  raise "wrong profile type" unless profile_type == Spaceship::ConnectAPI::Profile::ProfileType::IOS_APP_STORE
  puts "PASS: release options select IOS_APP_STORE and reuse the existing certificate"

  conflict_rejected = false
  begin
    FastlaneCore::Configuration.create(available, options.merge(adhoc: false, development: false))
  rescue StandardError => error
    conflict_rejected = error.message.include?("You can't enable both")
  end
  raise "exclusive false flags accepted unexpectedly" unless conflict_rejected
  puts "PASS: conflicting explicit false flags are caught before any Apple request"
rescue StandardError => error
  puts "FAIL: synthetic profile configuration; class=#{error.class}"
  exit 1
end