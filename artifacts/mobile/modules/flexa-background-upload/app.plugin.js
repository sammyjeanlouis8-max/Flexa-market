// `expo/config-plugins` is Expo's supported public re-export and is available
// to local modules without adding a second direct dependency.
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Kept local to the Expo app so prebuild/release builds always carry the
 * Android 14 foreground data-sync declarations required by the WorkManager
 * worker. The module manifest supplies the library portion; this protects the
 * host application's merged manifest as well.
 */
function withFlexaUploadNetworkSecurity(config) {
  return withDangerousMod(config, [
    "android",
    async (configured) => {
      const resXml = path.join(
        configured.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      fs.mkdirSync(resXml, { recursive: true });
      fs.writeFileSync(
        path.join(resXml, "flexa_upload_network_security.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Production uploads use HTTPS. Cleartext is limited to emulator loopback
       hosts used by the Boost Video upload mock during QA. -->
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`,
      );
      return configured;
    },
  ]);
}

function withFlexaBackgroundUploadManifest(config) {
  return withAndroidManifest(config, (configured) => {
    const manifest = configured.modResults.manifest;
    const permissions = manifest["uses-permission"] || [];
    const required = [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
      "android.permission.WAKE_LOCK",
    ];
    for (const name of required) {
      if (!permissions.some((permission) => permission.$?.["android:name"] === name)) {
        permissions.push({ $: { "android:name": name } });
      }
    }
    manifest["uses-permission"] = permissions;

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(configured.modResults);
    app.$["android:networkSecurityConfig"] = "@xml/flexa_upload_network_security";

    const receivers = app.receiver || [];
    const receiverName = "expo.modules.flexabackgroundupload.UploadRetryReceiver";
    if (!receivers.some((receiver) => receiver.$?.["android:name"] === receiverName)) {
      receivers.push({
        $: {
          "android:name": receiverName,
          "android:exported": "false",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "expo.modules.flexabackgroundupload.RETRY_UPLOAD",
                },
              },
            ],
          },
        ],
      });
      app.receiver = receivers;
    }

    return configured;
  });
}

module.exports = function withFlexaBackgroundUpload(config) {
  return withFlexaBackgroundUploadManifest(withFlexaUploadNetworkSecurity(config));
};
