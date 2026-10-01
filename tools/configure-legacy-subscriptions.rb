require_relative "inspect-apple-subscriptions"
require "bigdecimal"
require "digest"
require "set"

# Owner-approved catalog setup only. Never builds, submits, deletes, or writes
# the other app's subscriptions. A rerun reads existing resources first.
module LegacySubscriptions
  APP = "6754947270"
  BUNDLE = "com.flexamarket.mobile"
  GROUP_NAME = "Flexa Market Plans"
  PLANS = [
    { plan: "standard", source: "6816311194", price: "14.99", level: 2 },
    { plan: "premium", source: "6816313742", price: "29.99", level: 1 }
  ].freeze

  def self.relation(type, id)
    { "data" => { "type" => type, "id" => id } }
  end

  def self.product_id(plan)
    "com.flexamarket.subscription.#{plan}.monthly"
  end

  class Client
    attr_reader :groups, :subscriptions, :group_versions, :subscription_versions, :price_points

    def initialize(auth)
      @auth = auth
      @groups, @subscriptions, @group_versions, @subscription_versions = [Set.new, {}, Set.new, Set.new]
      @price_points = {}
    end

    def assert_post_scope(path, body)
      data = body.fetch("data")
      relationships = data.fetch("relationships", {})
      attrs = data.fetch("attributes", {})
      id = ->(name) { relationships.dig(name, "data", "id") }
      safe = case path
      when "/v1/subscriptionGroups"
        id.call("app") == APP && attrs["referenceName"] == GROUP_NAME
      when "/v1/subscriptions"
        @groups.include?(id.call("group")) && PLANS.any? { |p|
          attrs["productId"] == LegacySubscriptions.product_id(p[:plan]) &&
          attrs["groupLevel"] == p[:level] && attrs["subscriptionPeriod"] == "ONE_MONTH" }
      when "/v1/subscriptionGroupVersions"
        @groups.include?(id.call("subscriptionGroup"))
      when "/v2/subscriptionGroupLocalizations"
        @group_versions.include?(id.call("version")) && attrs["locale"] == "en-US"
      when "/v1/subscriptionVersions"
        @subscriptions.key?(id.call("subscription"))
      when "/v2/subscriptionLocalizations"
        @subscription_versions.include?(id.call("version")) && attrs["locale"] == "en-US"
      when "/v1/subscriptionPlanAvailabilities"
        @subscriptions.key?(id.call("subscription")) && attrs["planType"] == "UPFRONT"
      when "/v1/subscriptionPrices"
        sub = id.call("subscription")
        @subscriptions.key?(sub) && @price_points.fetch(sub, Set.new).include?(id.call("subscriptionPricePoint")) &&
          attrs["startDate"].nil? && attrs["planType"] == "UPFRONT"
      else
        false
      end
      raise "WRITE_OUT_OF_APPROVED_SCOPE" unless safe
    end

    def request(path, body = nil)
      uri = URI.parse(path.start_with?("https://") ? path : "#{AppleSubscriptionInspection::ORIGIN}#{path}")
      raise "UNTRUSTED_API_ORIGIN" unless uri.scheme == "https" && uri.host == "api.appstoreconnect.apple.com" &&
        uri.port == 443 && !uri.userinfo && uri.path.match?(%r{\A/v[12]/(?:apps|subscription\w+|territories)(?:/[\w%.-]+)*\z})
      assert_post_scope(uri.path, body) if body
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout, http.read_timeout = 15, 30
      req = body ? Net::HTTP::Post.new(uri.request_uri) : Net::HTTP::Get.new(uri.request_uri)
      req["Authorization"] = "Bearer #{@auth}"
      req["Accept"] = "application/json"
      if body
        req["Content-Type"] = "application/json"
        req.body = JSON.generate(body)
      end
      response = http.request(req)
      parsed = JSON.parse(response.body)
      unless %w[200 201].include?(response.code)
        errors = Array(parsed["errors"]).map { |error| error.slice("code", "title", "detail") }
        puts "APPLE_CATALOG_API_ERROR: #{JSON.generate({ http: response.code, endpoint: uri.path, errors: errors })}"
        raise "APPLE_API_FAILED"
      end
      parsed
    end

    def list(path)
      rows, included = [], []
      12.times do
        body = request(path)
        rows.concat(Array(body["data"]))
        included.concat(Array(body["included"]))
        path = body.dig("links", "next")
        return { "data" => rows, "included" => included } unless path
      end
      raise "PAGINATION_LIMIT"
    end

    def create(type, attrs, relationships, version = 1)
      request("/v#{version}/#{type}", { "data" => {
        "type" => type, "attributes" => attrs, "relationships" => relationships
      } }).fetch("data")
    end
  end

  def self.price_rows(client, subscription)
    query = URI.encode_www_form("limit" => 200, "include" => "subscriptionPricePoint,territory")
    body = client.list("/v1/subscriptions/#{subscription}/prices?#{query}")
    resources = body["included"].to_h { |item| [[item["type"], item["id"]], item] }
    body["data"].map do |row|
      territory = row.dig("relationships", "territory", "data", "id")
      point_id = row.dig("relationships", "subscriptionPricePoint", "data", "id")
      point = resources.fetch(["subscriptionPricePoints", point_id])
      { territory: territory, price: BigDecimal(point.dig("attributes", "customerPrice").to_s),
        point_id: point_id, start_date: row.dig("attributes", "startDate"),
        plan_type: row.dig("attributes", "planType") || "UPFRONT" }
    end
  end

  def self.localize_group(client, group)
    versions = client.list("/v1/subscriptionGroups/#{group}/versions?limit=200")["data"]
    version = versions.find { |v| v.dig("attributes", "state") == "PREPARE_FOR_SUBMISSION" }
    version ||= client.create("subscriptionGroupVersions", {}, "subscriptionGroup" => relation("subscriptionGroups", group))
    id = version.fetch("id")
    client.group_versions.add(id)
    locales = client.list("/v1/subscriptionGroupVersions/#{id}/localizations?limit=200")["data"]
    unless locales.any? { |l| l.dig("attributes", "locale") == "en-US" }
      client.create("subscriptionGroupLocalizations", { "locale" => "en-US", "name" => GROUP_NAME },
        { "version" => relation("subscriptionGroupVersions", id) }, 2)
    end
  end

  def self.localize_subscription(client, subscription, name)
    versions = client.list("/v1/subscriptions/#{subscription}/versions?limit=200")["data"]
    version = versions.find { |v| v.dig("attributes", "state") == "PREPARE_FOR_SUBMISSION" }
    version ||= client.create("subscriptionVersions", {}, "subscription" => relation("subscriptions", subscription))
    id = version.fetch("id")
    client.subscription_versions.add(id)
    locales = client.list("/v1/subscriptionVersions/#{id}/localizations?limit=200")["data"]
    unless locales.any? { |l| l.dig("attributes", "locale") == "en-US" }
      client.create("subscriptionLocalizations", {
        "locale" => "en-US", "name" => "Flexa Market #{name}",
        "description" => "#{name} monthly plan for Flexa Market sellers."
      }, { "version" => relation("subscriptionVersions", id) }, 2)
    end
  end

  def self.configure_prices(client, subscription, plan, source_rows)
    query = URI.encode_www_form("filter[territory]" => "USA", "include" => "territory", "limit" => 200)
    usa = client.list("/v1/subscriptions/#{subscription}/pricePoints?#{query}")["data"].find { |point|
      BigDecimal(point.dig("attributes", "customerPrice").to_s) == BigDecimal(plan[:price]) }
    raise "APPROVED_USA_PRICE_POINT_UNAVAILABLE" unless usa
    eq = client.list("/v1/subscriptionPricePoints/#{usa['id']}/equalizations?include=territory&limit=200")["data"]
    points = ([usa] + eq).to_h { |point| [point.dig("relationships", "territory", "data", "id"), point] }
    wanted = source_rows.select { |row| row[:start_date].nil? && row[:plan_type] == "UPFRONT" }
    raise "NO_SOURCE_PRICES" if wanted.empty?
    wanted.each do |row|
      point = points.fetch(row[:territory])
      raise "SOURCE_EQUALIZED_PRICE_DIFFERS" unless BigDecimal(point.dig("attributes", "customerPrice").to_s) == row[:price]
    end
    client.price_points[subscription] = wanted.map { |row| points.fetch(row[:territory]).fetch("id") }.to_set
    existing = price_rows(client, subscription).select { |row| row[:start_date].nil? }.to_h { |row| [row[:territory], row] }
    wanted.each do |row|
      if existing[row[:territory]]
        raise "EXISTING_TARGET_PRICE_MISMATCH" unless existing[row[:territory]][:price] == row[:price]
        next
      end
      client.create("subscriptionPrices", { "startDate" => nil, "planType" => "UPFRONT", "preserveCurrentPrice" => false },
        { "subscription" => relation("subscriptions", subscription),
          "subscriptionPricePoint" => relation("subscriptionPricePoints", points.fetch(row[:territory]).fetch("id")) })
    end
    verified = price_rows(client, subscription).select { |row| row[:start_date].nil? }.to_h { |row| [row[:territory], row[:price]] }
    raise "PRICES_NOT_CONFIRMED" unless wanted.all? { |row| verified[row[:territory]] == row[:price] }
    puts "APPLE_PRICES_CONFIRMED: #{JSON.generate({ product_id: product_id(plan[:plan]), usa_usd: plan[:price], territories: wanted.size })}"
    wanted.map { |row| row[:territory] }.sort
  end

  def self.configure_availability(client, subscription, territories)
    records = client.list("/v1/subscriptions/#{subscription}/planAvailabilities?limit=200")["data"]
    upfront = records.find { |r| r.dig("attributes", "planType") == "UPFRONT" }
    if upfront
      current = client.list("/v1/subscriptionPlanAvailabilities/#{upfront['id']}/availableTerritories?limit=200")["data"].map { |r| r["id"] }.sort
      raise "TARGET_AVAILABILITY_DIFFERS" unless current == territories
    else
      client.create("subscriptionPlanAvailabilities", { "planType" => "UPFRONT", "availableInNewTerritories" => true },
        { "subscription" => relation("subscriptions", subscription),
          "availableTerritories" => { "data" => territories.map { |t| { "type" => "territories", "id" => t } } } })
    end
  end

  def self.main
    raise "OWNER_APPROVAL_REQUIRED" unless ENV["LEGACY_CATALOG_APPROVAL"] == "STANDARD_14_99_PREMIUM_29_99_NO_BUILD_NO_SUBMIT"
    client = Client.new(AppleSubscriptionInspection.token)
    app = client.request("/v1/apps/#{APP}?fields%5Bapps%5D=bundleId").fetch("data")
    raise "TARGET_BUNDLE_MISMATCH" unless app.dig("attributes", "bundleId") == BUNDLE
    source = PLANS.to_h do |plan|
      row = client.request("/v1/subscriptions/#{plan[:source]}?include=group").fetch("data")
      raise "SOURCE_IDENTIFIER_MISMATCH" unless row.dig("attributes", "productId") == product_id(plan[:plan]) &&
        row.dig("relationships", "group", "data", "id") == "22414765"
      rows = price_rows(client, plan[:source])
      usd = rows.find { |price| price[:territory] == "USA" && price[:start_date].nil? }
      raise "APPROVED_SOURCE_PRICE_CHANGED" unless usd && usd[:price] == BigDecimal(plan[:price])
      [plan[:plan], rows]
    end
    groups = client.list("/v1/apps/#{APP}/subscriptionGroups?limit=200")["data"]
    raise "UNEXPECTED_TARGET_GROUP" if groups.any? { |g| g.dig("attributes", "referenceName") != GROUP_NAME }
    group = groups.find { |g| g.dig("attributes", "referenceName") == GROUP_NAME }
    group ||= client.create("subscriptionGroups", { "referenceName" => GROUP_NAME }, "app" => relation("apps", APP))
    id = group.fetch("id")
    client.groups.add(id)
    puts "APPLE_TARGET_GROUP_CONFIRMED: #{id}"
    localize_group(client, id)
    products = client.list("/v1/subscriptionGroups/#{id}/subscriptions?limit=200")["data"]
    PLANS.each do |plan|
      product = products.find { |p| p.dig("attributes", "productId") == product_id(plan[:plan]) }
      product ||= client.create("subscriptions", {
        "name" => "Flexa Market #{plan[:plan].capitalize} Monthly", "productId" => product_id(plan[:plan]),
        "subscriptionPeriod" => "ONE_MONTH", "familySharable" => false, "groupLevel" => plan[:level]
      }, "group" => relation("subscriptionGroups", id))
      sub = product.fetch("id")
      client.subscriptions[sub] = plan[:plan]
      puts "APPLE_TARGET_PRODUCT_CONFIRMED: #{JSON.generate({ id: sub, product_id: product_id(plan[:plan]) })}"
      localize_subscription(client, sub, plan[:plan].capitalize)
      territories = configure_prices(client, sub, plan, source.fetch(plan[:plan]))
      configure_availability(client, sub, territories)
      unchanged = price_rows(client, plan[:source])
      raise "SOURCE_PRICES_CHANGED" unless unchanged == source.fetch(plan[:plan])
    end
    result = client.list("/v1/subscriptionGroups/#{id}/subscriptions?limit=200")["data"].map { |p|
      { apple_product_id: p["id"], product_id: p.dig("attributes", "productId"), state: p.dig("attributes", "state") } }
    puts "APPLE_LEGACY_CATALOG_RESULT: #{JSON.generate({ app_id: APP, bundle_id: BUNDLE, group_id: id, products: result })}"
    puts "APPLE_LEGACY_CATALOG_CONFIGURED_NO_BUILD_NO_SUBMIT"
  rescue StandardError => error
    category = error.message.match?(/\A[A-Z_]+\z/) ? error.message : "UNCLASSIFIED_SETUP_FAILURE"
    puts "APPLE_LEGACY_SETUP_STOPPED: #{category}"
    exit 1
  end
end

LegacySubscriptions.main if $PROGRAM_NAME == __FILE__