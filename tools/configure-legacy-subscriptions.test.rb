require "minitest/autorun"
require_relative "configure-legacy-subscriptions"

class LegacySubscriptionScopeTest < Minitest::Test
  def setup
    @client = LegacySubscriptions::Client.new("synthetic-test-only")
  end

  def test_group_cannot_target_other_app
    body = { "data" => { "attributes" => { "referenceName" => LegacySubscriptions::GROUP_NAME },
      "relationships" => { "app" => LegacySubscriptions.relation("apps", "6774676236") } } }
    assert_raises(RuntimeError) { @client.assert_post_scope("/v1/subscriptionGroups", body) }
    body["data"]["relationships"]["app"] = LegacySubscriptions.relation("apps", LegacySubscriptions::APP)
    @client.assert_post_scope("/v1/subscriptionGroups", body)
  end

  def test_source_product_and_unregistered_group_are_not_writable
    body = { "data" => { "attributes" => { "productId" => LegacySubscriptions.product_id("standard"),
      "subscriptionPeriod" => "ONE_MONTH", "groupLevel" => 2 },
      "relationships" => { "group" => LegacySubscriptions.relation("subscriptionGroups", "22414765") } } }
    assert_raises(RuntimeError) { @client.assert_post_scope("/v1/subscriptions", body) }
  end

  def test_unapproved_vip_and_annual_subscriptions_are_rejected
    @client.groups.add("synthetic-legacy-group")
    body = { "data" => { "attributes" => { "productId" => LegacySubscriptions.product_id("vip"),
      "subscriptionPeriod" => "ONE_MONTH", "groupLevel" => 1 },
      "relationships" => { "group" => LegacySubscriptions.relation("subscriptionGroups", "synthetic-legacy-group") } } }
    assert_raises(RuntimeError) { @client.assert_post_scope("/v1/subscriptions", body) }
    body["data"]["attributes"].merge!("productId" => LegacySubscriptions.product_id("premium"), "subscriptionPeriod" => "ONE_YEAR")
    assert_raises(RuntimeError) { @client.assert_post_scope("/v1/subscriptions", body) }
  end

  def test_prices_require_owned_target_and_preverified_price_points
    @client.subscriptions["target-subscription"] = "standard"
    body = { "data" => { "attributes" => { "startDate" => nil, "planType" => "UPFRONT" },
      "relationships" => { "subscription" => LegacySubscriptions.relation("subscriptions", "target-subscription"),
        "subscriptionPricePoint" => LegacySubscriptions.relation("subscriptionPricePoints", "source-price-point") } } }
    assert_raises(RuntimeError) { @client.assert_post_scope("/v1/subscriptionPrices", body) }
    @client.price_points["target-subscription"] = Set["target-price-point"]
    body["data"]["relationships"]["subscriptionPricePoint"] = LegacySubscriptions.relation("subscriptionPricePoints", "target-price-point")
    @client.assert_post_scope("/v1/subscriptionPrices", body)
    body["data"]["relationships"]["subscription"] = LegacySubscriptions.relation("subscriptions", "6816311194")
    assert_raises(RuntimeError) { @client.assert_post_scope("/v1/subscriptionPrices", body) }
  end
end