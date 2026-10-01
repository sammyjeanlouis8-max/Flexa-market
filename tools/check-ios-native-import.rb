# frozen_string_literal: true

# Runner-local verification only: no Apple API, profile, build or artifact.
require "base64"
require "openssl"
require "open3"
require "securerandom"
require "tmpdir"
require_relative "ios-native-p12"

class NativeImportCheckFailure < StandardError; end

def checked_security(*args)
  stdout, _stderr, status = Open3.capture3("/usr/bin/security", *args)
  unless status.success?
    action = args.first.upcase.tr("-", "_")
    raise NativeImportCheckFailure, "NATIVE_SECURITY_#{action}_FAILED"
  end
  stdout
end

begin
  raise NativeImportCheckFailure, "NATIVE_IMPORT_REQUIRES_MACOS" unless RUBY_PLATFORM.include?("darwin")
  owner_password = ENV.fetch("IOS_SIGNING_P12_PASSWORD").dup
  owner_bytes = Base64.strict_decode64(ENV.fetch("IOS_SIGNING_P12_BASE64").gsub(/\s/, ""))
  identity = OpenSSL::PKCS12.new(owner_bytes, owner_password)
  certificate = identity.certificate
  unless certificate && identity.key && certificate.check_private_key(identity.key) &&
         certificate.not_before <= Time.now && certificate.not_after > Time.now &&
         certificate.subject.to_a.any? { |name, value, _| name == "OU" && value == "D782MM56VY" }
    raise NativeImportCheckFailure, "NATIVE_SOURCE_IDENTITY_INVALID"
  end

  fingerprint = OpenSSL::Digest::SHA1.hexdigest(certificate.to_der).upcase
  Dir.mktmpdir("flexa-native-import-check-") do |directory|
    File.chmod(0700, directory)
    keychain = File.join(directory, "check.keychain-db")
    keychain_password = SecureRandom.hex(32)
    keychain_created = false
    begin
      checked_security("create-keychain", "-p", keychain_password, keychain)
      keychain_created = true
      checked_security("unlock-keychain", "-p", keychain_password, keychain)
      IosNativeP12.with_import_bundle(identity) do |path, password|
        checked_security(
          "import", path, "-k", keychain, "-P", password,
          "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"
        )
      end
      checked_security(
        "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:",
        "-s", "-k", keychain_password, keychain
      )
      identities = checked_security("find-identity", "-v", "-p", "codesigning", keychain)
      unless identities.match?(/\b#{Regexp.escape(fingerprint)}\b/)
        raise NativeImportCheckFailure, "NATIVE_TRUSTED_IDENTITY_UNAVAILABLE"
      end
      identities.clear
    ensure
      begin
        checked_security("delete-keychain", keychain) if keychain_created
      ensure
        keychain_password&.clear
      end
    end
  end
rescue IosNativeP12::Failure => error
  puts error.category
  exit 1
rescue NativeImportCheckFailure => error
  puts error.message
  exit 1
rescue StandardError
  puts "NATIVE_IMPORT_CHECK_FAILED"
  exit 1
ensure
  begin
    owner_bytes&.clear
    owner_password&.clear
  rescue StandardError
    puts "NATIVE_IMPORT_MEMORY_CLEANUP_FAILED"
    exit 1
  end
end
puts "NATIVE_OWNER_SIGNING_IMPORT_VALID"