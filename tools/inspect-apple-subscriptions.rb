require "openssl"
require "base64"
require "json"
require "net/http"
require "uri"

# Diagnostic only: GET requests, selected metadata, no credentials in output.
module AppleSubscriptionInspection
  ORIGIN = "https://api.appstoreconnect.apple.com"
  APPS = {
    "build97" => ["6754947270", "com.flexamarket.mobile"],
    "build96" => ["6774676236", "app.replit.flexamarket"]
  }.freeze

  def self.b64(value)
    Base64.urlsafe_encode64(value, padding: false)
  end

  def self.token
    required = %w[ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8]
    raise "CREDENTIALS_UNAVAILABLE" unless required.all? { |name| !ENV[name].to_s.strip.empty? }
    now = Time.now.to_i
    header = b64(JSON.generate({ alg: "ES256", kid: ENV.fetch("ASC_KEY_ID"), typ: "JWT" }))
    payload = b64(JSON.generate({ iss: ENV.fetch("ASC_ISSUER_ID"), iat: now - 30, exp: now + 600, aud: "appstoreconnect-v1" }))
    input = "#{header}.#{payload}"
    key = OpenSSL::PKey.read(ENV.fetch("ASC_KEY_P8").gsub("\\n", "\n"))
    raise "SIGNING_KEY_INVALID" unless key.is_a?(OpenSSL::PKey::EC) && key.group.curve_name == "prime256v1"
    sequence = OpenSSL::ASN1.decode(key.sign("SHA256", input))
    signature = sequence.value.map { |integer| integer.value.to_s(2).rjust(32, "\x00") }.join
    raise "SIGNATURE_INVALID" unless signature.bytesize == 64
    "#{input}.#{b64(signature)}"
  end

  def self.get(path, auth)
    uri = URI.parse(path.start_with?("https://") ? path : "#{ORIGIN}#{path}")
    allowed = %r{\A/v1/(?:apps/(?:6754947270|6774676236)(?:/subscriptionGroups)?|subscriptionGroups/\d+/subscriptions|subscriptions/(?:6816311194|6816314812))\z}
    raise "REQUEST_OUT_OF_SCOPE" unless uri.scheme == "https" && uri.host == "api.appstoreconnect.apple.com" &&
      uri.port == 443 && !uri.userinfo && allowed.match?(uri.path)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = 15
    http.read_timeout = 30
    request = Net::HTTP::Get.new(uri.request_uri)
    request["Authorization"] = "Bearer #{auth}"
    request["Accept"] = "application/json"
    response = http.request(request)
    unless response.code == "200"
      return { "diagnostic_error" => "HTTP_#{response.code}" }
    end
    JSON.parse(response.body)
  end

  def self.list(path, auth)
    data = []
    included = []
    6.times do
      body = get(path, auth)
      return body if body["diagnostic_error"]
      data.concat(Array(body["data"]))
      included.concat(Array(body["included"]))
      path = body.dig("links", "next")
      return { "data" => data, "included" => included } unless path
    end
    { "diagnostic_error" => "PAGINATION_LIMIT" }
  end

  def self.relationship_ids(row, name)
    data = row.dig("relationships", name, "data")
    data.is_a?(Array) ? data.map { |item| item["id"] } : data ? [data["id"]] : []
  end

  def self.inspect_app(label, id, expected_bundle, auth)
    body = get("/v1/apps/#{id}?fields%5Bapps%5D=name,bundleId", auth)
    return { label: label, app_id: id, error: body["diagnostic_error"] } if body["diagnostic_error"]
    app = body.fetch("data").fetch("attributes")
    report = { label: label, app_id: id, bundle_id: app["bundleId"], expected_bundle_matches: app["bundleId"] == expected_bundle }
    return report.merge(error: "BUNDLE_MISMATCH") unless report[:expected_bundle_matches]
    query = URI.encode_www_form({
      "limit" => 200,
      "include" => "subscriptionGroupLocalizations",
      "fields[subscriptionGroupLocalizations]" => "name,locale,state",
      "fields[subscriptionGroups]" => "referenceName,subscriptionGroupLocalizations"
    })
    groups = list("/v1/apps/#{id}/subscriptionGroups?#{query}", auth)
    return report.merge(error: groups["diagnostic_error"]) if groups["diagnostic_error"]
    report[:groups] = groups["data"].map do |group|
      group_report = { group_id: group["id"], name: group.dig("attributes", "referenceName"),
        localization_count: relationship_ids(group, "subscriptionGroupLocalizations").length }
      subquery = URI.encode_www_form({
        "limit" => 200,
        "include" => "subscriptionLocalizations,appStoreReviewScreenshot,prices",
        "fields[subscriptions]" => "name,productId,state,subscriptionPeriod,groupLevel,subscriptionLocalizations,appStoreReviewScreenshot,prices",
        "fields[subscriptionLocalizations]" => "name,locale,description,state",
        "fields[subscriptionAppStoreReviewScreenshots]" => "assetDeliveryState",
        "fields[subscriptionPrices]" => "startDate,preserved"
      })
      subs = list("/v1/subscriptionGroups/#{group['id']}/subscriptions?#{subquery}", auth)
      if subs["diagnostic_error"]
        group_report[:error] = subs["diagnostic_error"]
        next group_report
      end
      resources = subs["included"].to_h { |item| [[item["type"], item["id"]], item] }
      group_report[:subscriptions] = subs["data"].map do |sub|
        attrs = sub.fetch("attributes")
        locales = relationship_ids(sub, "subscriptionLocalizations").filter_map do |localization_id|
          attributes = resources[["subscriptionLocalizations", localization_id]]&.fetch("attributes", {})
          attributes && { locale: attributes["locale"], name_present: !attributes["name"].to_s.empty?,
            description_present: !attributes["description"].to_s.empty?, state: attributes["state"] }
        end
        screenshots = relationship_ids(sub, "appStoreReviewScreenshot")
        { apple_product_id: sub["id"], product_id: attrs["productId"], state: attrs["state"],
          period: attrs["subscriptionPeriod"], group_level: attrs["groupLevel"], localizations: locales,
          review_screenshot_present: !screenshots.empty?, price_record_count: relationship_ids(sub, "prices").length }
      end
      group_report
    end
    report
  end

  def self.main
    auth = token
    report = APPS.map { |label, (id, bundle)| inspect_app(label, id, bundle, auth) }
    puts "APPLE_SUBSCRIPTION_INSPECTION_JSON: #{JSON.generate(report)}"
    puts "APPLE_READ_ONLY_COMPLETE"
  rescue StandardError
    # Never include exception messages, raw responses, or authentication data.
    puts "APPLE_INSPECTION_FAILED_NO_CREDENTIAL_OUTPUT"
    exit 1
  end
end

AppleSubscriptionInspection.main if $PROGRAM_NAME == __FILE__