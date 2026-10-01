# Never return or log the certificate owner's common name.
module IosSigningIdentity
  def self.label(certificate)
    common_name = certificate.subject.to_a.find { |name, _value, _type| name == "CN" }&.[](1)
    return "iPhone Distribution" if common_name.to_s.start_with?("iPhone Distribution:")
    return "Apple Distribution" if common_name.to_s.start_with?("Apple Distribution:")
    raise ArgumentError, "SIGNING_CERTIFICATE_IDENTITY_TYPE_UNSUPPORTED"
  end
end