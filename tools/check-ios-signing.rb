# frozen_string_literal: true

# Category-only local signing preflight. Never contact Apple, build the app,
# write the identity to disk, or expose credentials/raw exception messages.
require "base64"
require "openssl"

module SigningPreflight
  Result = Struct.new(:category, :ok, keyword_init: true)

  def self.result(category, ok = false)
    Result.new(category: category, ok: ok)
  end

  def self.check(encoded, password, now: Time.now)
    encoded = encoded.to_s.gsub(/\s/, "")
    password = password.to_s # Preserve intentional whitespace exactly.
    return result("P12_SECRET_MISSING") if encoded.empty?
    return result("PASSWORD_SECRET_MISSING") if password.empty?

    begin
      bytes = Base64.strict_decode64(encoded)
    rescue ArgumentError
      return result("BASE64_INVALID")
    end

    begin
      nodes = OpenSSL::ASN1.decode_all(bytes)
      pfx = nodes.first
      valid_pfx = nodes.length == 1 &&
        pfx.is_a?(OpenSSL::ASN1::Sequence) &&
        [2, 3].include?(pfx.value.length) &&
        pfx.value[0].is_a?(OpenSSL::ASN1::Integer) &&
        pfx.value[0].value.to_i == 3
      return result("P12_CONTAINER_INVALID") unless valid_pfx

      content_info = pfx.value[1]
      valid_content_info = content_info.is_a?(OpenSSL::ASN1::Sequence) &&
        content_info.value.length == 2 &&
        content_info.value[0].is_a?(OpenSSL::ASN1::ObjectId) &&
        %w[1.2.840.113549.1.7.1 1.2.840.113549.1.7.2].include?(content_info.value[0].oid) &&
        content_info.value[1].tag_class == :CONTEXT_SPECIFIC &&
        content_info.value[1].tag == 0
      return result("P12_CONTAINER_INVALID") unless valid_content_info
    rescue OpenSSL::ASN1::ASN1Error, ArgumentError
      return result("P12_CONTAINER_INVALID")
    end

    begin
      identity = OpenSSL::PKCS12.new(bytes, password)
    rescue OpenSSL::PKCS12::PKCS12Error => error
      # Inspect only internally; never output raw library error messages.
      message = error.message.downcase
      if message.match?(/unsupported|unknown cipher|fetch failed|unable to fetch/)
        return result("CRYPTO_ALGORITHM_OR_PROVIDER_UNSUPPORTED")
      end
      if message.match?(/mac verify|invalid password|bad decrypt|cipherfinal|decrypt error/)
        # This does not distinguish an incorrect password from corruption.
        return result("P12_INTEGRITY_OR_DECRYPTION_FAILED")
      end
      return result("P12_PARSE_FAILED_UNCLASSIFIED")
    end

    certificate = identity.certificate
    key = identity.key
    return result("CERTIFICATE_OR_PRIVATE_KEY_MISSING") unless certificate && key
    return result("CERTIFICATE_PRIVATE_KEY_MISMATCH") unless certificate.check_private_key(key)
    if certificate.not_after <= now || certificate.not_before > now
      return result("CERTIFICATE_TIME_INVALID")
    end

    result("LOCAL_SIGNING_IDENTITY_VALID", true)
  rescue StandardError
    # Fail closed without a stack trace or potentially sensitive error text.
    result("DIAGNOSTIC_FAILED_UNCLASSIFIED")
  end

  MESSAGES = {
    "P12_SECRET_MISSING" => "The P12 secret is missing or empty.",
    "PASSWORD_SECRET_MISSING" => "The password secret is missing or empty.",
    "BASE64_INVALID" => "The saved value is not valid strict Base64.",
    "P12_CONTAINER_INVALID" => "Decoded content is not a recognizable PKCS12 container.",
    "CRYPTO_ALGORITHM_OR_PROVIDER_UNSUPPORTED" => "This runtime cannot use a required crypto algorithm or provider.",
    "P12_INTEGRITY_OR_DECRYPTION_FAILED" => "Integrity or decryption failed; password mismatch and damaged data remain possible.",
    "P12_PARSE_FAILED_UNCLASSIFIED" => "PKCS12 parsing failed for an unclassified reason.",
    "CERTIFICATE_OR_PRIVATE_KEY_MISSING" => "The identity lacks a certificate or usable private key.",
    "CERTIFICATE_PRIVATE_KEY_MISMATCH" => "The certificate and private key do not match.",
    "CERTIFICATE_TIME_INVALID" => "The certificate is expired or not yet valid.",
    "LOCAL_SIGNING_IDENTITY_VALID" => "The current pair opens and contains a matching, time-valid local signing identity. Apple registration is NOT checked.",
    "DIAGNOSTIC_FAILED_UNCLASSIFIED" => "The diagnostic failed closed for an unclassified reason."
  }.freeze

  def self.report(result)
    # Only constants and runtime versions are emitted, never input-derived data.
    level = result.ok ? "notice" : "error"
    text = "#{result.category}: #{MESSAGES.fetch(result.category)}"
    puts "::#{level} title=Signing preflight::#{text}"
    if ENV["GITHUB_STEP_SUMMARY"]
      File.open(ENV.fetch("GITHUB_STEP_SUMMARY"), "a") do |file|
        file.puts "## Signing diagnostic"
        file.puts text
        file.puts "\nNo Apple request, app build, signing import, or upload was performed."
      end
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    puts "Ruby runtime: #{RUBY_VERSION}"
    puts "Ruby OpenSSL: #{OpenSSL::VERSION}"
    puts "OpenSSL compiled: #{OpenSSL::OPENSSL_VERSION}"
    puts "OpenSSL loaded: #{OpenSSL::OPENSSL_LIBRARY_VERSION}" if defined?(OpenSSL::OPENSSL_LIBRARY_VERSION)
    result = SigningPreflight.check(
      ENV["IOS_SIGNING_P12_BASE64"],
      ENV["IOS_SIGNING_P12_PASSWORD"]
    )
    SigningPreflight.report(result)
    exit(result.ok ? 0 : 1)
  rescue StandardError
    puts "::error title=Signing preflight::DIAGNOSTIC_FAILED_UNCLASSIFIED"
    exit 1
  end
end