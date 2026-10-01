require "openssl"
require "base64"
require "json"
require "net/http"
require "uri"
require "time"

# Read-only Apple checks. The default mode emits only categories/counts;
# inventory mode emits selected public certificate/profile metadata.
# Neither prints secret contents, raw responses, names or fingerprints.
module AppleSigningDiagnostic
  TEAM = "D782MM56VY"
  BUNDLE = "com.flexamarket.mobile"
  DISTRIBUTION_TYPES = %w[DISTRIBUTION IOS_DISTRIBUTION].freeze
  ORIGIN = "https://api.appstoreconnect.apple.com"

  class Failure < StandardError
    attr_reader :category
    def initialize(category)
      @category = category
      super("Read-only diagnostic stopped")
    end
  end

  def self.team(certificate)
    certificate.subject.to_a.find { |name, _value, _type| name == "OU" }&.[](1)
  end

  def self.assess(certificate, records)
    distribution = records.select { |row| DISTRIBUTION_TYPES.include?(row.dig("attributes", "certificateType")) }
    parsed = records.filter_map do |row|
      content = row.dig("attributes", "certificateContent")
      next if content.to_s.empty?
      begin
        [row, OpenSSL::X509::Certificate.new(Base64.strict_decode64(content.gsub(/\s/, "")))]
      rescue ArgumentError, OpenSSL::X509::CertificateError
        nil
      end
    end
    exact = parsed.select { |_row, remote| remote.to_der == certificate.to_der }
    active_exact = exact.select { |row, _remote| DISTRIBUTION_TYPES.include?(row.dig("attributes", "certificateType")) }
    same_key = parsed.select do |row, remote|
      DISTRIBUTION_TYPES.include?(row.dig("attributes", "certificateType")) &&
        team(remote) == TEAM && remote.not_before <= Time.now && remote.not_after > Time.now &&
        remote.public_key.public_to_der == certificate.public_key.public_to_der
    end
    unreadable = distribution.count do |row|
      !parsed.any? { |parsed_row, _remote| parsed_row.equal?(row) }
    end
    category =
      if team(certificate) != TEAM
        "SIGNING_CERTIFICATE_TEAM_MISMATCH"
      elsif !active_exact.empty?
        "APPLE_DISTRIBUTION_CERTIFICATE_ACTIVE"
      elsif !exact.empty?
        "APPLE_MATCHED_CERTIFICATE_IS_NOT_DISTRIBUTION"
      elsif unreadable.positive?
        "APPLE_CERTIFICATE_CONTENT_INCOMPLETE"
      elsif !same_key.empty?
        "APPLE_ACTIVE_PUBLIC_KEY_MATCHES_DIFFERENT_CERTIFICATE"
      else
        "APPLE_CERTIFICATE_NOT_IN_ACTIVE_LIST"
      end
    [category, {
      "APPLE_CERTIFICATE_ROWS" => records.length,
      "APPLE_DISTRIBUTION_ROWS" => distribution.length,
      "APPLE_PARSED_CERTIFICATE_ROWS" => parsed.length,
      "APPLE_DISTRIBUTION_CONTENT_UNREADABLE" => unreadable,
      "APPLE_EXACT_DISTRIBUTION_MATCHES" => active_exact.length,
      "APPLE_VALID_DISTRIBUTION_PUBLIC_KEY_MATCHES" => same_key.length
    }]
  end

  def self.safe_uri(value, allow_profiles: false)
    uri = URI.join(ORIGIN, value)
    allowed_path = uri.path == "/v1/apps" ||
      uri.path.match?(%r{\A/v1/certificates(?:/[A-Za-z0-9._%~-]+)?\z}) ||
      (allow_profiles && uri.path == "/v1/profiles")
    unless uri.scheme == "https" && uri.host == "api.appstoreconnect.apple.com" &&
           uri.port == 443 && uri.userinfo.nil? && allowed_path
      raise Failure.new("APPLE_UNSAFE_READ_URL_BLOCKED")
    end
    uri
  end

  def self.read_json(value, token, allow_profiles: false)
    uri = safe_uri(value, allow_profiles: allow_profiles)
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 20, read_timeout: 30) do |http|
      http.get(uri.request_uri, "Authorization" => "Bearer #{token}", "Accept" => "application/json")
    end
    case response.code.to_i
    when 401 then raise Failure.new("APPLE_AUTHENTICATION_REJECTED")
    when 403 then raise Failure.new("APPLE_READ_PERMISSION_DENIED")
    when 429 then raise Failure.new("APPLE_READ_RATE_LIMITED")
    end
    raise Failure.new("APPLE_READ_HTTP_FAILED") unless response.is_a?(Net::HTTPSuccess)
    JSON.parse(response.body)
  end

  def self.metadata_uri(value, resource)
    uri = safe_uri(value, allow_profiles: true)
    unless %w[certificates profiles].include?(resource) && uri.path == "/v1/#{resource}"
      raise Failure.new("APPLE_INVENTORY_PAGINATION_RESOURCE_INVALID")
    end
    # Pagination must not drop or weaken the sparse field selection.
    cursor = URI.decode_www_form(uri.query.to_s).select { |name, _value| %w[cursor offset].include?(name) }
    raise Failure.new("APPLE_INVENTORY_PAGINATION_INVALID") if cursor.map(&:first).uniq.length != cursor.length
    fields = { "limit" => 200,
      "fields[certificates]" => "certificateType,expirationDate,serialNumber,platform" }
    if resource == "profiles"
      fields.merge!("include" => "bundleId,certificates", "limit[certificates]" => 50,
        "fields[profiles]" => "profileType,profileState,expirationDate,bundleId,certificates",
        "fields[bundleIds]" => "identifier")
    end
    uri.query = URI.encode_www_form(cursor + fields.to_a)
    uri
  end

  def self.certificate_records(reader, first_page = "/v1/certificates?limit=200", metadata_only: false)
    records = []
    next_page = first_page
    seen = []
    while next_page
      uri = metadata_only ? metadata_uri(next_page, "certificates") : safe_uri(next_page)
      unless uri.path == "/v1/certificates" && !seen.include?(uri.to_s) && seen.length < 10
        raise Failure.new("APPLE_CERTIFICATE_PAGINATION_INCOMPLETE")
      end
      seen << uri.to_s
      page = reader.call(uri.to_s)
      raise Failure.new("APPLE_CERTIFICATE_RESPONSE_INVALID") unless page["data"].is_a?(Array)
      records.concat(page["data"])
      next_page = page.dig("links", "next")
    end
    records
  end

  # This separate mode prints only public certificate/profile metadata.
  # Sparse field selections exclude certificate bytes, profile contents,
  # names and devices. It never reads the PKCS12 secrets.
  def self.profile_inventory(reader)
    next_page = "/v1/profiles"
    seen, profiles, bundles = [], [], {}
    while next_page
      uri = metadata_uri(next_page, "profiles")
      unless uri.path == "/v1/profiles" && !seen.include?(uri.to_s) && seen.length < 10
        raise Failure.new("APPLE_PROFILE_PAGINATION_INCOMPLETE")
      end
      seen << uri.to_s
      page = reader.call(uri.to_s)
      unless page["data"].is_a?(Array) && page.fetch("included", []).is_a?(Array)
        raise Failure.new("APPLE_PROFILE_RESPONSE_INVALID")
      end
      profiles.concat(page["data"])
      page.fetch("included", []).each do |row|
        bundles[row["id"]] = row.dig("attributes", "identifier") if row["type"] == "bundleIds"
      end
      next_page = page.dig("links", "next")
    end
    [profiles, bundles]
  end

  def self.public_field(value, pattern = /\A[A-Za-z0-9._*:+-]{1,200}\z/)
    return nil if value.nil?
    unless value.is_a?(String) && value.match?(pattern)
      raise Failure.new("APPLE_INVENTORY_METADATA_INVALID")
    end
    value
  end

  def self.public_inventory(records, profiles, bundles)
    complete = true
    usage = Hash.new { |hash, key| hash[key] = [] }
    profiles.each do |profile|
      links = profile.dig("relationships", "certificates")
      ids = links && links["data"]
      bundle = bundles[profile.dig("relationships", "bundleId", "data", "id")]
      total = links && links.dig("meta", "paging", "total")
      unless ids.is_a?(Array) && bundle
        complete = false
        next
      end
      complete = false unless total.is_a?(Integer) && total == ids.length && !links.dig("links", "next")
      metadata = {
        bundle: public_field(bundle),
        profile_type: public_field(profile.dig("attributes", "profileType")),
        profile_state: public_field(profile.dig("attributes", "profileState")),
        expires: public_field(profile.dig("attributes", "expirationDate"))
      }
      ids.each { |row| usage[public_field(row.fetch("id"))] << metadata }
    end
    certificates = records.select { |row| DISTRIBUTION_TYPES.include?(row.dig("attributes", "certificateType")) }.map do |row|
      id = public_field(row.fetch("id"))
      attributes = row.fetch("attributes")
      expires = public_field(attributes["expirationDate"])
      {
        id: id, type: public_field(attributes["certificateType"]),
        platform: public_field(attributes["platform"]),
        serial: public_field(attributes["serialNumber"]), expires: expires,
        expired: expires ? Time.iso8601(expires) <= Time.now : nil,
        listed_profiles: usage[id].uniq
      }
    end
    { profile_links_complete: complete, profile_count: profiles.length, certificates: certificates,
      warning: "Listed profiles do not prove all signing usage; no certificate is safe to revoke automatically." }
  end

  def self.inventory_main
    require "jwt"
    key_id = ENV["ASC_KEY_ID"].to_s.strip
    issuer = ENV["ASC_ISSUER_ID"].to_s.strip
    key_text = ENV["ASC_KEY_P8"].to_s.gsub("\\n", "\n").strip
    if [key_id, issuer, key_text].any?(&:empty?)
      raise Failure.new("APPLE_INVENTORY_REQUIRED_SECRET_MISSING")
    end
    now = Time.now.to_i
    token = JWT.encode({ iss: issuer, iat: now - 30, exp: now + 600, aud: "appstoreconnect-v1" },
                      OpenSSL::PKey.read(key_text), "ES256", { kid: key_id, typ: "JWT" })
    reader = ->(url) { read_json(url, token, allow_profiles: true) }
    apps = reader.call("/v1/apps?#{URI.encode_www_form('filter[bundleId]' => BUNDLE, 'limit' => 1, 'fields[apps]' => 'bundleId')}")
    unless apps["data"].is_a?(Array) && apps["data"].any? { |app| app.dig("attributes", "bundleId") == BUNDLE }
      raise Failure.new("APPLE_TARGET_APP_NOT_ACCESSIBLE")
    end
    records = certificate_records(reader, "/v1/certificates", metadata_only: true)
    profiles, bundles = profile_inventory(reader)
    puts "APPLE_SIGNING_INVENTORY_JSON: #{JSON.generate(public_inventory(records, profiles, bundles))}"
    puts "APPLE_SIGNING_INVENTORY_READ_ONLY_COMPLETE"
  rescue Failure => error
    puts error.category
    exit 1
  rescue StandardError
    puts "APPLE_INVENTORY_UNCLASSIFIED_FAILURE"
    exit 1
  end

  def self.main
    require "jwt"
    key_id = ENV["ASC_KEY_ID"].to_s.strip
    issuer = ENV["ASC_ISSUER_ID"].to_s.strip
    key_text = ENV["ASC_KEY_P8"].to_s.gsub("\\n", "\n").strip
    encoded = ENV["IOS_SIGNING_P12_BASE64"].to_s.gsub(/\s/, "")
    password = ENV["IOS_SIGNING_P12_PASSWORD"].to_s
    if [key_id, issuer, key_text, encoded, password].any?(&:empty?)
      raise Failure.new("APPLE_DIAGNOSTIC_REQUIRED_SECRET_MISSING")
    end
    identity = OpenSSL::PKCS12.new(Base64.strict_decode64(encoded), password)
    certificate = identity.certificate
    unless certificate && identity.key && certificate.not_before <= Time.now && certificate.not_after > Time.now &&
           identity.key.public_to_der == certificate.public_key.public_to_der
      raise Failure.new("APPLE_DIAGNOSTIC_LOCAL_IDENTITY_INVALID")
    end
    puts(team(certificate) == TEAM ? "SIGNING_CERTIFICATE_TEAM_MATCH" : "SIGNING_CERTIFICATE_TEAM_MISMATCH")
    now = Time.now.to_i
    token = JWT.encode({ iss: issuer, iat: now - 30, exp: now + 600, aud: "appstoreconnect-v1" },
                       OpenSSL::PKey.read(key_text), "ES256", { kid: key_id, typ: "JWT" })
    reader = ->(url) { read_json(url, token) }
    apps = reader.call("/v1/apps?#{URI.encode_www_form('filter[bundleId]' => BUNDLE, 'limit' => 1)}")
    unless apps["data"].is_a?(Array) && apps["data"].any? { |app| app.dig("attributes", "bundleId") == BUNDLE }
      raise Failure.new("APPLE_TARGET_APP_NOT_ACCESSIBLE")
    end
    puts "APPLE_TARGET_APP_ACCESS_CONFIRMED"
    records = certificate_records(reader)
    original_category, = assess(certificate, records)
    missing = records.count do |row|
      DISTRIBUTION_TYPES.include?(row.dig("attributes", "certificateType")) &&
        row.dig("attributes", "certificateContent").to_s.empty?
    end
    raise Failure.new("APPLE_CERTIFICATE_DETAIL_READ_LIMIT") if missing > 20
    puts "APPLE_DISTRIBUTION_LIST_CONTENT_MISSING: #{missing}"
    records = records.map do |row|
      next row unless DISTRIBUTION_TYPES.include?(row.dig("attributes", "certificateType")) &&
                      row.dig("attributes", "certificateContent").to_s.empty?
      id = URI.encode_www_form_component(row.fetch("id"))
      detail = reader.call("/v1/certificates/#{id}").fetch("data")
      row.merge("attributes" => row.fetch("attributes").merge(detail.fetch("attributes")))
    end
    category, metrics = assess(certificate, records)
    metrics.each { |label, count| puts "#{label}: #{count}" }
    if category == "APPLE_DISTRIBUTION_CERTIFICATE_ACTIVE" && original_category != category
      puts "APPLE_ACTIVE_CERTIFICATE_FOUND_AFTER_DETAIL_LOOKUP"
    end
    puts category
    exit(category == "APPLE_DISTRIBUTION_CERTIFICATE_ACTIVE" ? 0 : 1)
  rescue Failure => error
    puts error.category
    exit 1
  rescue StandardError
    puts "APPLE_DIAGNOSTIC_UNCLASSIFIED_FAILURE"
    exit 1
  end
end

if $PROGRAM_NAME == __FILE__
  if ARGV == ["--inventory"]
    AppleSigningDiagnostic.inventory_main
  elsif ARGV.empty?
    AppleSigningDiagnostic.main
  else
    puts "APPLE_DIAGNOSTIC_ARGUMENT_INVALID"
    exit 1
  end
end