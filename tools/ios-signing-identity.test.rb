require "openssl"
require_relative "ios-signing-identity"
def synthetic_certificate(name)
  certificate = OpenSSL::X509::Certificate.new
  certificate.subject = OpenSSL::X509::Name.new([["CN", name]])
  certificate
end
raise "Synthetic Apple identity label failed" unless IosSigningIdentity.label(synthetic_certificate("Apple Distribution: Synthetic")) == "Apple Distribution"
raise "Synthetic legacy identity label failed" unless IosSigningIdentity.label(synthetic_certificate("iPhone Distribution: Synthetic")) == "iPhone Distribution"
blocked = false
begin
  IosSigningIdentity.label(synthetic_certificate("Apple Development: Synthetic"))
rescue ArgumentError
  blocked = true
end
raise "Synthetic development identity must be rejected" unless blocked
puts "Synthetic signing identity label tests passed; no owner names or credentials printed."