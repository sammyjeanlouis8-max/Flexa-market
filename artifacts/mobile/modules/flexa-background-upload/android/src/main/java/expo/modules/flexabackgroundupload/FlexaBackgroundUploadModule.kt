package expo.modules.flexabackgroundupload

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Small native boundary for the WebView bridge. Files, jobs and bearer tokens
 * never pass back to JavaScript after this call.
 */
class FlexaBackgroundUploadModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FlexaBackgroundUpload")

    AsyncFunction("handle") { message: Map<String, Any?> ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Flexa upload module has no React context")
      UploadStore(context.applicationContext).handle(message)
    }
  }
}