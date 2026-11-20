/**
 * Local/EAS release builds can OOM during lintVitalAnalyzeRelease.
 * Disable vital lint analysis so signed AAB generation can finish.
 */
const { withAppBuildGradle, withGradleProperties } = require("expo/config-plugins");

function withDisableVitalLint(config) {
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const set = (key, value) => {
      const i = props.findIndex((p) => p.type === "property" && p.key === key);
      if (i >= 0) props[i].value = value;
      else props.push({ type: "property", key, value });
    };
    set("android.lint.checkReleaseBuilds", "false");
    set("org.gradle.jvmargs", "-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dkotlin.daemon.jvm.options=-Xmx2048m");
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("lintVitalAnalyzeRelease")) {
      cfg.modResults.contents += `

android {
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
}
`;
    }
    return cfg;
  });

  return config;
}

module.exports = withDisableVitalLint;
