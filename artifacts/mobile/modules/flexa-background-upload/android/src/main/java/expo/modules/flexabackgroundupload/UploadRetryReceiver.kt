package expo.modules.flexabackgroundupload

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Notification action that re-queues a failed upload while the staged file is
 * still on disk. The Boost Video screen can also retry via a fresh begin/start.
 */
class UploadRetryReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ACTION_RETRY) return
    val jobId = intent.getStringExtra(EXTRA_JOB_ID) ?: return
    UploadStore(context.applicationContext).retryFailedFromNotification(jobId)
  }

  companion object {
    const val ACTION_RETRY = "expo.modules.flexabackgroundupload.RETRY_UPLOAD"
    const val EXTRA_JOB_ID = "jobId"
  }
}
