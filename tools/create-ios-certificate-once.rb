# frozen_string_literal: true

# One explicitly approved Apple certificate creation. No keys are generated,
# no profiles are written, and no certificate is revoked.
require "base64"
require "fileutils"
require "json"
require "net/http"
require "openssl"
require "time"
require "timeout"
require "uri"
require_relative "check-apple-signing"

module CreateIOSCertificateOnce
  TEAM = AppleSigningDiagnostic::TEAM
  BUNDLE = AppleSigningDiagnostic::BUNDLE
  CERTIFICATE_TYPE = "IOS_DISTRIBUTION"
  APPROVAL = "CREATE_ONE_IOS_DISTRIBUTION_NO_REVOCATION"
  CERTIFICATE_OUTPUT = ".local/issued-ios-certificate.encrypted.json"
  PUBLIC_ID_PATTERN = /\A[A-Za-z0-9._-]{1,200}\z/
  ENVELOPE_FORMAT = "flexa-public-certificate-v1"
  ENVELOPE_KDF = "PBKDF2-SHA256"
  ENVELOPE_ITERATIONS = 200_000
  ENVELOPE_AAD = "FlexaMarket public certificate v1"

  class Failure < StandardError
    attr_reader :category

    def initialize(category)
      @category = category
      super("Certificate creation stopped")
    end
  end

  def self.stop(category)
    raise Failure.new(category)
  end

  def self.guard!(confirmation, run_attempt)
    stop("CREATE_ONCE_APPROVAL_REQUIRED") unless confirmation == APPROVAL
    stop("CREATE_ONCE_RUN_ATTEMPT_INVALID") unless run_attempt.to_s == "1"
    true
  end

  def self.mac_data_present?(bytes)
    nodes = OpenSSL::ASN1.decode_all(bytes)
    return false unless nodes.length == 1

    pfx = nodes.first
    return false unless pfx.is_a?(OpenSSL::ASN1::Sequence) &&
                        pfx.value.length == 3 &&
                        pfx.value[0].is_a?(OpenSSL::ASN1::Integer) &&
                        pfx.value[0].value.to_i == 3

    mac_data = pfx.value[2]
    return false unless mac_data.is_a?(OpenSSL::ASN1::Sequence) &&
                        [2, 3].include?(mac_data.value.length)

    digest_info, salt, iterations = mac_data.value
    valid_digest = digest_info.is_a?(OpenSSL::ASN1::Sequence) &&
      digest_info.value.length == 2 &&
      digest_info.value[0].is_a?(OpenSSL::ASN1::Sequence) &&
      digest_info.value[0].value.first.is_a?(OpenSSL::ASN1::ObjectId) &&
      digest_info.value[1].is_a?(OpenSSL::ASN1::OctetString) &&
      !digest_info.value[1].value.empty?
    valid_salt = salt.is_a?(OpenSSL::ASN1::OctetString) && !salt.value.empty?
    valid_iterations = iterations.nil? ||
      (iterations.is_a?(OpenSSL::ASN1::Integer) && iterations.value.to_i.positive?)
    valid_digest && valid_salt && valid_iterations
  rescue OpenSSL::ASN1::ASN1Error, ArgumentError, NoMethodError
    false
  end

  def self.load_identity(encoded, password, now: Time.now)
    encoded = encoded.to_s.gsub(/\s/, "")
    password = password.to_s
    stop("P12_SECRET_MISSING") if encoded.empty?
    stop("P12_PASSWORD_MISSING") if password.empty?

    begin
      bytes = Base64.strict_decode64(encoded)
    rescue ArgumentError
      stop("P12_BASE64_INVALID")
    end
    stop("P12_MAC_MISSING_OR_INVALID") unless mac_data_present?(bytes)

    begin
      identity = OpenSSL::PKCS12.new(bytes, password)
    rescue OpenSSL::PKCS12::PKCS12Error
      stop("P12_INTEGRITY_OR_DECRYPTION_FAILED")
    end

    certificate = identity.certificate
    key = identity.key
    stop("P12_IDENTITY_MISSING") unless certificate && key
    stop("P12_PRIVATE_KEY_NOT_RSA_2048") unless key.is_a?(OpenSSL::PKey::RSA) && key.n.num_bits >= 2048
    stop("P12_CERTIFICATE_KEY_MISMATCH") unless certificate.check_private_key(key)
    stop("P12_CERTIFICATE_TEAM_MISMATCH") unless AppleSigningDiagnostic.team(certificate) == TEAM
    stop("P12_CERTIFICATE_TIME_INVALID") unless certificate.not_before <= now && certificate.not_after > now
    stop("P12_CERTIFICATE_PUBLIC_KEY_NOT_RSA_2048") unless certificate.public_key.is_a?(OpenSSL::PKey::RSA) &&
                                                               certificate.public_key.n.num_bits >= 2048

    identity
  rescue Failure
    raise
  rescue StandardError
    stop("P12_IDENTITY_INVALID")
  end

  def self.build_csr(key)
    stop("CSR_PRIVATE_KEY_INVALID") unless key.is_a?(OpenSSL::PKey::RSA) && key.n.num_bits >= 2048

    request = OpenSSL::X509::Request.new
    request.version = 0
    request.subject = OpenSSL::X509::Name.new([
      ["CN", "FlexaMarket iOS Distribution"],
      ["OU", TEAM]
    ])
    request.public_key = key.public_key
    request.sign(key, OpenSSL::Digest.new("SHA256"))
    unless request.verify(key.public_key) &&
           request.public_key.public_to_der == key.public_to_der
      stop("CSR_VERIFICATION_FAILED")
    end

    request
  rescue Failure
    raise
  rescue StandardError
    stop("CSR_CREATION_FAILED")
  end

  def self.encrypt_public_certificate(der, password)
    stop("PUBLIC_CERTIFICATE_ENCRYPTION_FAILED") unless der.is_a?(String) && !der.empty?
    password_utf8 = password.to_s.encode(Encoding::UTF_8)
    stop("P12_PASSWORD_MISSING") if password_utf8.empty?

    salt = OpenSSL::Random.random_bytes(16)
    iv = OpenSSL::Random.random_bytes(12)
    key = OpenSSL::PKCS5.pbkdf2_hmac(password_utf8, salt, ENVELOPE_ITERATIONS, 32, "SHA256")
    cipher = OpenSSL::Cipher.new("aes-256-gcm")
    cipher.encrypt
    cipher.key = key
    cipher.iv = iv
    cipher.auth_data = ENVELOPE_AAD.encode(Encoding::UTF_8)
    encrypted = cipher.update(der) + cipher.final + cipher.auth_tag(16)

    {
      "format" => ENVELOPE_FORMAT,
      "kdf" => ENVELOPE_KDF,
      "iterations" => ENVELOPE_ITERATIONS,
      "salt" => Base64.strict_encode64(salt),
      "iv" => Base64.strict_encode64(iv),
      "ciphertext" => Base64.strict_encode64(encrypted)
    }
  rescue Failure
    raise
  rescue StandardError
    stop("PUBLIC_CERTIFICATE_ENCRYPTION_FAILED")
  end

  def self.fixed_uri(path)
    uri = AppleSigningDiagnostic.safe_uri(path)
    stop("APPLE_CREATE_ENDPOINT_INVALID") unless uri.path == "/v1/certificates" &&
                                                  uri.query.nil? && uri.fragment.nil?
    uri
  rescue AppleSigningDiagnostic::Failure
    stop("APPLE_UNSAFE_READ_URL_BLOCKED")
  end

  def self.quota_error?(body)
    parsed = JSON.parse(body)
    errors = parsed["errors"]
    return false unless errors.is_a?(Array)

    errors.any? do |error|
      next false unless error.is_a?(Hash)

      private_text = [error["code"], error["title"], error["detail"]]
        .select { |value| value.is_a?(String) }.join(" ").downcase
      private_text.match?(/quota|certificate.{0,30}(limit|maximum)|maximum.{0,30}certificate|too many certificates/)
    end
  rescue JSON::ParserError
    false
  end

  def self.decode_http_response(response, operation)
    status = response.code.to_i
    body = response.body.to_s
    if quota_error?(body) && [400, 403, 409, 422].include?(status)
      stop("APPLE_CERTIFICATE_QUOTA_REACHED")
    end

    case status
    when 401 then stop("APPLE_AUTHENTICATION_REJECTED")
    when 403 then stop("APPLE_PERMISSION_DENIED")
    when 429 then stop("APPLE_RATE_LIMITED")
    end

    if operation == :create
      stop("APPLE_CREATE_TIMEOUT_AMBIGUOUS") if status == 408
      stop("APPLE_CREATE_REQUEST_REJECTED") if status >= 400 && status < 500
      stop("APPLE_CREATE_SERVER_FAILURE_AMBIGUOUS") if status >= 500
      stop("APPLE_CREATE_RESPONSE_AMBIGUOUS") if status >= 300
      stop("APPLE_CREATE_RESPONSE_AMBIGUOUS") unless status == 201
    else
      stop("APPLE_READ_SERVER_FAILURE") if status >= 500
      stop("APPLE_READ_HTTP_FAILED") unless status == 200
    end

    begin
      JSON.parse(body)
    rescue JSON::ParserError
      stop(operation == :create ? "APPLE_CREATE_RESPONSE_AMBIGUOUS" : "APPLE_READ_RESPONSE_INVALID")
    end
  end

  def self.http_json(method, path, token, payload: nil, operation: :read)
    stop("APPLE_CREATE_METHOD_INVALID") if operation == :create && method != "POST"
    uri = if operation == :create
            fixed_uri(path)
          else
            AppleSigningDiagnostic.safe_uri(path)
          end
    request = if method == "POST"
                Net::HTTP::Post.new(uri.request_uri)
              else
                Net::HTTP::Get.new(uri.request_uri)
              end
    request["Authorization"] = "Bearer #{token}"
    request["Accept"] = "application/json"
    if payload
      request["Content-Type"] = "application/json"
      request.body = JSON.generate(payload)
    end
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 20, read_timeout: 30) do |http|
      stop("APPLE_HTTP_NO_RETRY_UNAVAILABLE") unless http.respond_to?(:max_retries=)
      http.max_retries = 0
      http.request(request)
    end
    decode_http_response(response, operation)
  rescue Failure
    raise
  rescue Net::OpenTimeout, Net::ReadTimeout, Timeout::Error
    stop(operation == :create ? "APPLE_CREATE_TIMEOUT_AMBIGUOUS" : "APPLE_READ_TIMEOUT")
  rescue StandardError
    stop(operation == :create ? "APPLE_CREATE_TRANSPORT_AMBIGUOUS" : "APPLE_READ_TRANSPORT_FAILED")
  end

  def self.certificate_der(row, category: "APPLE_CERTIFICATE_INVENTORY_INCOMPLETE")
    content = row.dig("attributes", "certificateContent")
    stop(category) unless content.is_a?(String) && !content.empty?

    Base64.strict_decode64(content.gsub(/\s/, ""))
  rescue Failure
    raise
  rescue StandardError
    stop(category)
  end

  def self.safe_certificate_content(row, category: "APPLE_CERTIFICATE_INVENTORY_INCOMPLETE")
    OpenSSL::X509::Certificate.new(certificate_der(row, category: category))
  rescue Failure
    raise
  rescue StandardError
    stop(category)
  end

  def self.complete_distribution_inventory(reader, records)
    complete_records = records.map do |row|
      unless row.is_a?(Hash) && row["id"].is_a?(String) &&
             row["id"].match?(PUBLIC_ID_PATTERN) && row["attributes"].is_a?(Hash) &&
             row.dig("attributes", "certificateType").is_a?(String) &&
             row.dig("attributes", "certificateType").match?(/\A[A-Z0-9_]{1,80}\z/)
        stop("APPLE_CERTIFICATE_INVENTORY_INCOMPLETE")
      end
      type = row.dig("attributes", "certificateType")
      next row unless AppleSigningDiagnostic::DISTRIBUTION_TYPES.include?(type)
      next row unless row.dig("attributes", "certificateContent").to_s.empty?

      id = row["id"]
      stop("APPLE_CERTIFICATE_INVENTORY_INCOMPLETE") unless id.is_a?(String) && id.match?(PUBLIC_ID_PATTERN)
      detail = reader.call("/v1/certificates/#{URI.encode_www_form_component(id)}")
      data = detail["data"]
      unless data.is_a?(Hash) && data["id"] == id && data["type"] == "certificates" &&
             data.dig("attributes", "certificateType") == type
        stop("APPLE_CERTIFICATE_INVENTORY_INCOMPLETE")
      end
      row.merge("attributes" => row.fetch("attributes").merge(data.fetch("attributes")))
    end

    certificates = complete_records.filter_map do |row|
      type = row.dig("attributes", "certificateType")
      next unless AppleSigningDiagnostic::DISTRIBUTION_TYPES.include?(type)

      [row, safe_certificate_content(row)]
    end
    certificates
  rescue Failure
    raise
  rescue StandardError
    stop("APPLE_CERTIFICATE_INVENTORY_INCOMPLETE")
  end

  def self.ensure_key_not_active!(certificates, public_key, now: Time.now)
    certificates.each do |_row, certificate|
      next unless certificate.not_before <= now && certificate.not_after > now
      if certificate.public_key.public_to_der == public_key.public_to_der
        stop("APPLE_ACTIVE_DISTRIBUTION_PUBLIC_KEY_MATCH")
      end
    end
    true
  end

  def self.verify_created_certificate(data, key, now: Time.now)
    unless data.is_a?(Hash) && data["type"] == "certificates" &&
           data["id"].is_a?(String) && data["id"].match?(PUBLIC_ID_PATTERN) &&
           data.dig("attributes", "certificateType") == CERTIFICATE_TYPE
      stop("APPLE_CREATED_CERTIFICATE_TYPE_OR_ID_INVALID")
    end
    der = certificate_der(data, category: "APPLE_CREATE_RESPONSE_AMBIGUOUS")
    certificate = OpenSSL::X509::Certificate.new(der)
    unless AppleSigningDiagnostic.team(certificate) == TEAM
      stop("APPLE_CREATED_CERTIFICATE_TEAM_MISMATCH")
    end
    unless certificate.not_before <= now && certificate.not_after > now
      stop("APPLE_CREATED_CERTIFICATE_TIME_INVALID")
    end
    unless certificate.public_key.public_to_der == key.public_to_der
      stop("APPLE_CREATED_CERTIFICATE_PUBLIC_KEY_MISMATCH")
    end
    [data["id"], certificate, der]
  rescue Failure
    raise
  rescue StandardError
    stop("APPLE_CREATE_RESPONSE_AMBIGUOUS")
  end

  def self.perform(token:, identity:, certificate_password:, confirmation:, run_attempt:, reader:, poster:,
                   output_path: CERTIFICATE_OUTPUT, now: Time.now)
    guard!(confirmation, run_attempt)
    certificate = identity.certificate
    key = identity.key
    stop("P12_IDENTITY_INVALID") unless certificate && key &&
      certificate.check_private_key(key) &&
      key.is_a?(OpenSSL::PKey::RSA) && key.n.num_bits >= 2048 &&
      AppleSigningDiagnostic.team(certificate) == TEAM &&
      certificate.not_before <= now && certificate.not_after > now

    csr = build_csr(key)
    apps = reader.call("/v1/apps?#{URI.encode_www_form('filter[bundleId]' => BUNDLE, 'limit' => 1, 'fields[apps]' => 'bundleId')}")
    unless apps["data"].is_a?(Array) && apps["data"].any? { |app| app.dig("attributes", "bundleId") == BUNDLE }
      stop("APPLE_TARGET_APP_NOT_ACCESSIBLE")
    end

    records = AppleSigningDiagnostic.certificate_records(reader, "/v1/certificates?limit=200")
    certificates = complete_distribution_inventory(reader, records)
    ensure_key_not_active!(certificates, key.public_key, now: now)

    payload = {
      "data" => {
        "type" => "certificates",
        "attributes" => {
          "certificateType" => CERTIFICATE_TYPE,
          "csrContent" => Base64.strict_encode64(csr.to_der)
        }
      }
    }
    created = poster.call("/v1/certificates", payload)
    begin
      data = created.is_a?(Hash) ? created["data"] : nil
      id, returned_certificate, returned_der = verify_created_certificate(data, key.public_key, now: now)
    rescue Failure
      raise
    rescue StandardError
      stop("APPLE_CREATE_RESPONSE_AMBIGUOUS")
    end

    begin
      confirmed = reader.call("/v1/certificates/#{URI.encode_www_form_component(id)}")
      confirmed_data = confirmed["data"]
      unless confirmed_data.is_a?(Hash) &&
             confirmed_data["id"] == id &&
             confirmed_data["type"] == "certificates" &&
             confirmed_data.dig("attributes", "certificateType") == CERTIFICATE_TYPE
        stop("APPLE_CREATE_CONFIRMATION_AMBIGUOUS")
      end
      confirmed_der = certificate_der(confirmed_data, category: "APPLE_CREATE_CONFIRMATION_AMBIGUOUS")
      confirmed_certificate = OpenSSL::X509::Certificate.new(confirmed_der)
      unless confirmed_der == returned_der &&
             confirmed_certificate.public_key.public_to_der == key.public_key.public_to_der &&
             AppleSigningDiagnostic.team(confirmed_certificate) == TEAM &&
             confirmed_certificate.not_before <= now && confirmed_certificate.not_after > now
        stop("APPLE_CREATE_CONFIRMATION_AMBIGUOUS")
      end
    rescue Failure
      stop("APPLE_CREATE_CONFIRMATION_AMBIGUOUS")
    rescue StandardError
      stop("APPLE_CREATE_CONFIRMATION_AMBIGUOUS")
    end

    envelope = encrypt_public_certificate(confirmed_der, certificate_password)
    FileUtils.mkdir_p(File.dirname(output_path))
    File.write(output_path, JSON.generate(envelope))
    {
      id: id,
      type: CERTIFICATE_TYPE,
      expires: confirmed_certificate.not_after.utc.iso8601
    }
  rescue Failure
    raise
  rescue StandardError
    stop("CREATE_ONCE_FAILED_UNCLASSIFIED")
  end

  def self.emit_success(outcome, io: $stdout)
    io.puts("IOS_CERTIFICATE_CREATED")
    io.puts("NEW_CERTIFICATE_ID: #{outcome.fetch(:id)}")
    io.puts("NEW_CERTIFICATE_TYPE: #{outcome.fetch(:type)}")
    io.puts("NEW_CERTIFICATE_EXPIRES: #{outcome.fetch(:expires)}")
  end

  def self.main
    guard!(ENV["CERTIFICATE_CONFIRMATION"], ENV["GITHUB_RUN_ATTEMPT"])
    require "jwt"
    key_id = ENV["ASC_KEY_ID"].to_s.strip
    issuer = ENV["ASC_ISSUER_ID"].to_s.strip
    key_text = ENV["ASC_KEY_P8"].to_s.gsub("\\n", "\n").strip
    stop("APPLE_AUTH_SECRET_MISSING") if [key_id, issuer, key_text].any?(&:empty?)

    identity = load_identity(ENV["IOS_SIGNING_P12_BASE64"], ENV["IOS_SIGNING_P12_PASSWORD"])
    now = Time.now.to_i
    token = JWT.encode({ iss: issuer, iat: now - 30, exp: now + 600, aud: "appstoreconnect-v1" },
                       OpenSSL::PKey.read(key_text), "ES256", { kid: key_id, typ: "JWT" })
    reader = ->(path) { http_json("GET", path, token) }
    poster = ->(path, payload) { http_json("POST", path, token, payload: payload, operation: :create) }
    outcome = perform(token: token, identity: identity,
                      certificate_password: ENV["IOS_SIGNING_P12_PASSWORD"],
                      confirmation: ENV["CERTIFICATE_CONFIRMATION"],
                      run_attempt: ENV["GITHUB_RUN_ATTEMPT"],
                      reader: reader, poster: poster)
    emit_success(outcome)
  rescue Failure => error
    puts error.category
    exit 1
  rescue StandardError
    puts "CREATE_ONCE_FAILED_UNCLASSIFIED"
    exit 1
  end
end

if $PROGRAM_NAME == __FILE__
  CreateIOSCertificateOnce.main
end