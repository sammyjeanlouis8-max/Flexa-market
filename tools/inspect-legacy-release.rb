require_relative "configure-legacy-subscriptions"

# One-time read-only inspection for the requested legacy rebuild. No build,
# certificate, submission, review-account, or provider-state writes.
begin
  client = LegacySubscriptions::Client.new(AppleSubscriptionInspection.token)
  app = client.request("/v1/apps/#{LegacySubscriptions::APP}?fields%5Bapps%5D=bundleId").fetch("data")
  raise "TARGET_BUNDLE_MISMATCH" unless app.dig("attributes", "bundleId") == LegacySubscriptions::BUNDLE
  builds = client.list("/v1/apps/#{LegacySubscriptions::APP}/builds?include=preReleaseVersion&limit=200")
  releases = builds["included"].to_h { |row| [row["id"], row.dig("attributes", "version")] }
  summary = builds["data"].map do |build|
    release = build.dig("relationships", "preReleaseVersion", "data", "id")
    { build: build.dig("attributes", "version"), version: releases[release],
      processing_state: build.dig("attributes", "processingState") }
  end
  puts "LEGACY_APP_BUILDS: #{JSON.generate(summary)}"
  raise "BUILD_98_ALREADY_EXISTS" if summary.any? { |row| row[:version] == "1.0.1" && row[:build] == "98" }
  products = client.list("/v1/subscriptionGroups/22432061/subscriptions?limit=200")["data"]
  expected = LegacySubscriptions::PLANS.map { |plan| LegacySubscriptions.product_id(plan[:plan]) }.sort
  raise "TARGET_PRODUCT_SET_MISMATCH" unless products.map { |row| row.dig("attributes", "productId") }.sort == expected
  rows = products.map do |product|
    id = product.fetch("id")
    versions = client.list("/v1/subscriptions/#{id}/versions?limit=200")["data"]
    metadata = versions.map do |version|
      locales = client.list("/v1/subscriptionVersions/#{version['id']}/localizations?limit=200")["data"]
      detail = client.request("/v1/subscriptionVersions/#{version['id']}").fetch("data")
      { state: version.dig("attributes", "state"),
        locales: locales.map { |locale| locale.dig("attributes", "locale") },
        screenshot_relationships: detail.fetch("relationships", {}).select { |key, _| key.match?(/screenshot/i) }
          .transform_values { |value| !value["data"].nil? } }
    end
    usa = LegacySubscriptions.price_rows(client, id).find { |row| row[:territory] == "USA" && row[:start_date].nil? }
    { id: id, product_id: product.dig("attributes", "productId"), state: product.dig("attributes", "state"),
      usa_usd: usa && usa[:price].to_s("F"), versions: metadata }
  end
  puts "LEGACY_RELEASE_METADATA: #{JSON.generate(rows)}"
  puts "LEGACY_BUILD_98_NUMBER_AVAILABLE_NO_BUILD_NO_SUBMIT"
rescue StandardError => error
  category = error.message.match?(/\A[A-Z_0-9]+\z/) ? error.message : "UNCLASSIFIED_READ_ONLY_INSPECTION_FAILURE"
  puts "LEGACY_RELEASE_INSPECTION_STOPPED: #{category}"
  exit 1
end