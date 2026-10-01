# frozen_string_literal: true

require "fileutils"
require "openssl"
require "open3"
require "securerandom"
require "tmpdir"

# Builds a short-lived, native-importable PKCS12 bundle without serializing a
# private key anywhere except directly into OpenSSL's stdin.
module IosNativeP12
  class Failure < StandardError
    CATEGORIES = %w[
      IDENTITY_INVALID
      OPENSSL_NOT_FOUND
      BUNDLE_EXPORT_FAILED
      BUNDLE_VERIFICATION_FAILED
      TEMPORARY_STORAGE_FAILED
      TEMPORARY_CLEANUP_FAILED
      BLOCK_REQUIRED
    ].freeze

    attr_reader :category

    def initialize(category)
      @category = CATEGORIES.include?(category) ? category : "BUNDLE_EXPORT_FAILED"
      super(@category)
    end
  end

  def self.with_import_bundle(identity)
    raise Failure.new("BLOCK_REQUIRED") unless block_given?

    key, leaf, ca_certs, expected_leaf_der, expected_key_der, expected_ca_ders =
      validate_identity(identity)
    openssl = openssl_binary
    raise Failure.new("OPENSSL_NOT_FOUND") unless openssl

    directory = nil
    password = nil
    private_pem = nil
    certificates_pem = nil
    bundle_bytes = nil
    stdout = nil
    stderr = nil

    begin
      begin
        directory = Dir.mktmpdir("ios-native-p12-")
        File.chmod(0700, directory)
        password = SecureRandom.hex(32)
        private_pem = key.private_to_pem
        certificates_pem = ([leaf] + ca_certs).map(&:to_pem).join

        certificates_path = File.join(directory, "certificates.pem")
        File.open(certificates_path, File::WRONLY | File::CREAT | File::EXCL, 0600) do |file|
          file.write(certificates_pem)
        end

        bundle_path = File.join(directory, "identity.p12")
        File.open(bundle_path, File::WRONLY | File::CREAT | File::EXCL, 0600) {}

        stdout, stderr, status = Open3.capture3(
          { "IOS_NATIVE_P12_PASSWORD" => password },
          openssl, "pkcs12", "-export",
          "-inkey", "/dev/stdin",
          "-in", certificates_path,
          "-out", bundle_path,
          "-passout", "env:IOS_NATIVE_P12_PASSWORD",
          "-keypbe", "PBE-SHA1-3DES",
          "-certpbe", "PBE-SHA1-3DES",
          "-macalg", "sha1",
          stdin_data: private_pem,
          binmode: true
        )
        raise Failure.new("BUNDLE_EXPORT_FAILED") unless status.success?
        unless File.file?(bundle_path) && (File.stat(bundle_path).mode & 0777) == 0600
          raise Failure.new("BUNDLE_EXPORT_FAILED")
        end

        bundle_bytes = File.binread(bundle_path)
        parsed = OpenSSL::PKCS12.new(bundle_bytes, password)
        parsed_leaf = parsed.certificate
        parsed_key = parsed.key
        parsed_ca_certs = parsed.ca_certs || []
        unless parsed_leaf && parsed_key &&
               parsed_leaf.to_der == expected_leaf_der &&
               parsed_leaf.check_private_key(parsed_key) &&
               parsed_key.public_to_der == expected_key_der &&
               parsed_ca_certs.map(&:to_der).sort == expected_ca_ders
          raise Failure.new("BUNDLE_VERIFICATION_FAILED")
        end
      rescue Failure
        raise
      rescue StandardError
        # Suppress subprocess, filesystem, and crypto-library error details.
        raise Failure.new("BUNDLE_EXPORT_FAILED")
      end

      yield bundle_path, password
    ensure
      [private_pem, certificates_pem, bundle_bytes, stdout, stderr, password].each do |value|
        value.clear if value.is_a?(String) && !value.frozen?
      end
      begin
        FileUtils.remove_entry_secure(directory) if directory && File.directory?(directory)
      rescue StandardError
        raise Failure.new("TEMPORARY_CLEANUP_FAILED")
      end
    end
  end

  def self.openssl_binary
    [
      "/opt/homebrew/opt/openssl@3/bin/openssl",
      "/usr/local/opt/openssl@3/bin/openssl",
      *ENV.fetch("PATH", "").split(File::PATH_SEPARATOR).map { |path| File.join(path, "openssl") }
    ].find { |path| File.file?(path) && File.executable?(path) }
  end

  def self.validate_identity(identity)
    key = identity.key if identity.respond_to?(:key)
    leaf = identity.certificate if identity.respond_to?(:certificate)
    ca_certs = identity.ca_certs if identity.respond_to?(:ca_certs)
    ca_certs ||= []

    unless key && leaf.is_a?(OpenSSL::X509::Certificate) &&
           ca_certs.is_a?(Array) &&
           ca_certs.all? { |certificate| certificate.is_a?(OpenSSL::X509::Certificate) }
      raise Failure.new("IDENTITY_INVALID")
    end

    key_public_der = key.public_to_der
    unless leaf.check_private_key(key) && leaf.public_key.public_to_der == key_public_der
      raise Failure.new("IDENTITY_INVALID")
    end

    [
      key,
      leaf,
      ca_certs,
      leaf.to_der,
      key_public_der,
      ca_certs.map(&:to_der).sort
    ]
  rescue Failure
    raise
  rescue StandardError
    raise Failure.new("IDENTITY_INVALID")
  end

  private_class_method :validate_identity
end