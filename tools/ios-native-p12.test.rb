# frozen_string_literal: true

require "fileutils"
require "openssl"
require "open3"
require "securerandom"
require "tmpdir"
require_relative "ios-native-p12"

def assert(condition, label)
  raise "synthetic assertion failed" unless condition
  puts "PASS: #{label}"
end

def synthetic_certificate(key, common_name, serial:, issuer: nil, issuer_key: key, ca: false)
  certificate = OpenSSL::X509::Certificate.new
  certificate.version = 2
  certificate.serial = serial
  certificate.subject = OpenSSL::X509::Name.new([["CN", common_name]])
  certificate.issuer = issuer ? issuer.subject : certificate.subject
  certificate.public_key = key.public_key
  certificate.not_before = Time.now - 60
  certificate.not_after = Time.now + 3600

  extensions = OpenSSL::X509::ExtensionFactory.new
  extensions.subject_certificate = certificate
  extensions.issuer_certificate = issuer || certificate
  certificate.add_extension(extensions.create_extension("basicConstraints", "CA:#{ca}", true))
  certificate.add_extension(
    extensions.create_extension("keyUsage", ca ? "keyCertSign,cRLSign" : "digitalSignature", true)
  )
  certificate.add_extension(extensions.create_extension("subjectKeyIdentifier", "hash"))
  certificate.add_extension(
    extensions.create_extension("authorityKeyIdentifier", "keyid:always,issuer:always")
  ) if issuer
  certificate.add_extension(extensions.create_extension("extendedKeyUsage", "codeSigning")) unless ca
  certificate.sign(issuer_key, OpenSSL::Digest.new("SHA256"))
  certificate
end

def native_import(bundle_path, bundle_password, leaf)
  test_directory = Dir.mktmpdir("ios-native-p12-import-test-")
  File.chmod(0700, test_directory)
  keychain_path = File.join(test_directory, "synthetic.keychain-db")
  keychain_password = SecureRandom.hex(24)
  keychain_created = false

  begin
    stdout, stderr, status = Open3.capture3(
      "security", "create-keychain", "-p", keychain_password, keychain_path
    )
    keychain_created = File.exist?(keychain_path)
    assert(status.success? && keychain_created, "native keychain created")
    stdout.clear
    stderr.clear

    stdout, stderr, status = Open3.capture3(
      "security", "unlock-keychain", "-p", keychain_password, keychain_path
    )
    assert(status.success?, "native keychain unlocked")
    stdout.clear
    stderr.clear

    stdout, stderr, status = Open3.capture3(
      "security", "import", bundle_path,
      "-k", keychain_path,
      "-P", bundle_password,
      "-T", "/usr/bin/codesign"
    )
    assert(status.success?, "native synthetic bundle imported")
    stdout.clear
    stderr.clear

    stdout, stderr, status = Open3.capture3(
      "security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:",
      "-s", "-k", keychain_password, keychain_path
    )
    assert(status.success?, "native private key partition authorization set")
    stdout.clear
    stderr.clear

    certificates, stderr, status = Open3.capture3(
      "security", "find-certificate", "-a", "-p", keychain_path
    )
    parsed_certificates = certificates.scan(
      /-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----/m
    ).map { |pem| OpenSSL::X509::Certificate.new(pem) }
    assert(
      status.success? && parsed_certificates.any? { |certificate| certificate.public_key.to_der == leaf.public_key.to_der },
      "native imported leaf public key verified"
    )
    certificates.clear
    stderr.clear

    keys, stderr, status = Open3.capture3("security", "find-key", "-t", "private", "-s", keychain_path)
    assert(status.success? && !keys.empty?, "native imported RSA private key authorized")
    keys.clear
    stderr.clear
  ensure
    keychain_password.clear
    begin
      if keychain_created
        stdout, stderr, _status = Open3.capture3("security", "delete-keychain", keychain_path)
        stdout.clear
        stderr.clear
      end
    ensure
      FileUtils.remove_entry_secure(test_directory) if File.directory?(test_directory)
    end
  end
end

if ARGV.include?("--native-import") && RUBY_PLATFORM !~ /darwin/
  puts "FAIL: native import requires macOS"
  exit 1
end

begin
root_key = OpenSSL::PKey::RSA.new(2048)
intermediate_key = OpenSSL::PKey::RSA.new(2048)
leaf_key = OpenSSL::PKey::RSA.new(2048)
root = synthetic_certificate(root_key, "Synthetic Root", serial: 1, ca: true)
intermediate = synthetic_certificate(
  intermediate_key, "Synthetic Intermediate", serial: 2, issuer: root, issuer_key: root_key, ca: true
)
leaf = synthetic_certificate(
  leaf_key, "Synthetic Leaf", serial: 3, issuer: intermediate, issuer_key: intermediate_key
)
identity = Struct.new(:key, :certificate, :ca_certs).new(leaf_key, leaf, [intermediate, root])
native_import_requested = ARGV.include?("--native-import")

normal_path = nil
normal_directory = nil
normal_password = nil
IosNativeP12.with_import_bundle(identity) do |path, password|
  normal_path = path
  normal_directory = File.dirname(path)
  normal_password = password

  assert((File.stat(normal_directory).mode & 0777) == 0700, "temporary directory permissions")
  files = Dir.children(normal_directory).map { |name| File.join(normal_directory, name) }
  assert(
    files.length == 2 && files.all? { |file| File.file?(file) && (File.stat(file).mode & 0777) == 0600 },
    "certificate chain and bundle file permissions"
  )
  assert(File.basename(path) == "identity.p12", "canonical PKCS12 bundle path")

  exported_bytes = File.binread(path)
  exported_identity = OpenSSL::PKCS12.new(exported_bytes, password)
  assert(
    exported_identity.certificate.to_der == leaf.to_der &&
      exported_identity.key.public_to_der == leaf_key.public_to_der &&
      exported_identity.ca_certs.map(&:to_der).sort == [intermediate.to_der, root.to_der].sort,
    "PKCS12 leaf, private key, and CA chain round trip"
  )

  info_stdout = nil
  info_stderr = nil
  info_stdout, info_stderr, info_status = Open3.capture3(
    { "IOS_NATIVE_TEST_PASSWORD" => password },
    IosNativeP12.openssl_binary, "pkcs12", "-info", "-noout",
    "-in", path, "-passin", "env:IOS_NATIVE_TEST_PASSWORD"
  )
  info = "#{info_stdout}\n#{info_stderr}"
  assert(
    info_status.success? && info.match?(/MAC:\s*sha1/i) &&
      info.scan(/3-KeyTripleDES-CBC/i).length >= 2,
    "PKCS12 SHA1 MAC and TripleDES encryption algorithms"
  )
  info_stdout.clear
  info_stderr.clear
  info.clear
  exported_bytes.clear

  native_import(path, password, leaf) if native_import_requested
end
assert(!File.exist?(normal_path) && !File.exist?(normal_directory), "temporary files removed after success")
assert(normal_password.empty?, "temporary import password cleared after success")

failure_path = nil
failure_directory = nil
failure_password = nil
block_failed = false
begin
  IosNativeP12.with_import_bundle(identity) do |path, password|
    failure_path = path
    failure_directory = File.dirname(path)
    failure_password = password
    raise "synthetic block failure"
  end
rescue RuntimeError => error
  block_failed = error.message == "synthetic block failure"
end
assert(block_failed, "block failure propagated")
assert(
  !File.exist?(failure_path) && !File.exist?(failure_directory),
  "temporary files removed after block failure"
)
assert(failure_password.empty?, "temporary import password cleared after block failure")

puts "PASS: synthetic native PKCS12 tests complete"
rescue StandardError
  puts "FAIL: synthetic native PKCS12 tests"
  exit 1