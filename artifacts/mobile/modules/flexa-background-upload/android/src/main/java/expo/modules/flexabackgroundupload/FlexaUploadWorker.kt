package expo.modules.flexabackgroundupload

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import java.io.BufferedInputStream
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL

class FlexaUploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  /** Required for expedited work so the upload notification can appear immediately. */
  override suspend fun getForegroundInfo(): ForegroundInfo = createForegroundInfo()

  override suspend fun doWork(): Result {
    val jobId = inputData.getString("jobId") ?: return Result.failure()
    val store = UploadStore(applicationContext)
    val job = try { store.requireJob(jobId) } catch (_: Exception) { return Result.failure() }
    if (job.state == "cancelled" || job.state == "complete") return Result.success()
    if (job.bytesStaged != job.totalBytes) return fail(store, job, "File staging is incomplete")
    // Promote the FGS as the first action while we may still hold a foreground
    // exemption from the Continue tap / expedited enqueue.
    setForeground(createForegroundInfo())
    val apiBase = job.apiBase.ifBlank { UPLOAD_API_BASE }
    return try {
      while (true) {
        val active = store.activeJob(jobId) ?: return Result.success()
        if (active.bytesSent >= active.totalBytes) break
        // Keep the ongoing notification visible for the whole transfer, including
        // WorkManager retries after a transient network failure.
        setForeground(createForegroundInfo())
        val index = (active.bytesSent / active.chunkSize).toInt()
        val remaining = active.totalBytes - active.bytesSent
        val count = minOf(active.chunkSize, remaining)
        val connection = (URL("$apiBase/chunk/${job.uploadId}/$index").openConnection() as HttpURLConnection).apply {
          requestMethod = "PUT"
          instanceFollowRedirects = false
          connectTimeout = 60_000
          readTimeout = 180_000
          doOutput = true
          setFixedLengthStreamingMode(count.toInt())
          setRequestProperty("Authorization", "Bearer ${store.token(jobId)}")
          setRequestProperty("Content-Type", "application/octet-stream")
        }
        try {
          connection.outputStream.use { output ->
            FileInputStream(store.stageFile(jobId)).use { source ->
              source.channel.position(active.bytesSent)
              BufferedInputStream(source).use { input ->
                val buffer = ByteArray(64 * 1024)
                var left = count
                while (left > 0) {
                  val read = input.read(buffer, 0, minOf(buffer.size.toLong(), left).toInt())
                  if (read <= 0) throw IllegalStateException("Staged file ended unexpectedly")
                  output.write(buffer, 0, read)
                  left -= read
                }
              }
            }
          }
          val code = connection.responseCode
          if (code !in 200..299) {
            if (code == 401 || code == 403) return fail(store, job, "Upload authorization was rejected")
            throw RetryableUploadException("Chunk upload returned HTTP $code")
          }
        } finally {
          connection.disconnect()
        }
        // cancel() may run while a PUT is in flight. This shared-lock update
        // refuses to overwrite cancellation or any other terminal state.
        if (isStopped || store.advanceIfUploading(jobId, count) == null) return Result.success()
      }
      // Finalize on-device so the server assembles the video even if JS is paused
      // after the user presses Home.
      finalizeUpload(store, jobId, job.uploadId, apiBase)
      if (isStopped || !store.completeIfUploading(jobId)) return Result.success()
      store.stageFile(jobId).delete()
      cancelUploadNotification()
      Result.success()
    } catch (error: RetryableUploadException) {
      retryOrFail(store, job, error.message ?: "Network upload failed")
    } catch (error: Exception) {
      retryOrFail(store, job, "Upload failed: ${error.message ?: "unknown error"}")
    }
  }

  private fun finalizeUpload(store: UploadStore, jobId: String, uploadId: String, apiBase: String) {
    val connection = (URL("$apiBase/chunk-finalize/$uploadId").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      instanceFollowRedirects = false
      connectTimeout = 60_000
      readTimeout = 180_000
      doOutput = true
      setRequestProperty("Authorization", "Bearer ${store.token(jobId)}")
      setRequestProperty("Content-Type", "application/json")
      setFixedLengthStreamingMode(2)
    }
    try {
      connection.outputStream.use { it.write("{}".toByteArray()) }
      val code = connection.responseCode
      // 200/202 both mean the server accepted the complete chunk set.
      if (code !in 200..299) {
        if (code == 401 || code == 403) throw IllegalStateException("Upload authorization was rejected")
        throw RetryableUploadException("Chunk finalize returned HTTP $code")
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun retryOrFail(store: UploadStore, job: UploadJob, message: String): Result {
    if (isStopped) return Result.success()
    return when (store.recordFailureIfUploading(job.jobId, message)) {
      UploadStore.FailureDisposition.Retry -> Result.retry()
      UploadStore.FailureDisposition.Failed -> {
        showFailureNotification(job.jobId, message)
        Result.failure()
      }
      UploadStore.FailureDisposition.CancelledOrTerminal -> Result.success()
    }
  }

  private fun fail(store: UploadStore, job: UploadJob, message: String): Result {
    val failed = store.failIfUploading(job.jobId, message)
    if (failed) showFailureNotification(job.jobId, message)
    return if (failed) Result.failure() else Result.success()
  }

  private fun notificationManager(): NotificationManager =
    applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun ensureUploadChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    // New channel id: older installs locked flexa_uploads at IMPORTANCE_LOW, which
    // hides the ongoing upload row from the shade on many OEMs.
    notificationManager().createNotificationChannel(
      NotificationChannel(
        UPLOAD_CHANNEL_ID,
        "Uploads",
        NotificationManager.IMPORTANCE_DEFAULT,
      ),
    )
  }

  private fun createForegroundInfo(): ForegroundInfo {
    ensureUploadChannel()
    val notification = NotificationCompat.Builder(applicationContext, UPLOAD_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle("Uploading to Flexa Market")
      .setContentText("Your upload will continue in the background.")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(
        UPLOAD_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      ForegroundInfo(UPLOAD_NOTIFICATION_ID, notification)
    }
  }

  private fun showFailureNotification(jobId: String, message: String) {
    ensureUploadChannel()
    cancelUploadNotification()
    val launch = applicationContext.packageManager.getLaunchIntentForPackage(applicationContext.packageName)
      ?: Intent().setPackage(applicationContext.packageName)
    val contentIntent = PendingIntent.getActivity(
      applicationContext,
      jobId.hashCode(),
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val retryIntent = Intent(applicationContext, UploadRetryReceiver::class.java).apply {
      action = UploadRetryReceiver.ACTION_RETRY
      putExtra(UploadRetryReceiver.EXTRA_JOB_ID, jobId)
    }
    val retryPending = PendingIntent.getBroadcast(
      applicationContext,
      jobId.hashCode() + 1,
      retryIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(applicationContext, UPLOAD_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_notify_error)
      .setContentTitle("Upload failed")
      .setContentText(message)
      .setStyle(NotificationCompat.BigTextStyle().bigText(message))
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .addAction(0, "Retry", retryPending)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()
    notificationManager().notify(FAILURE_NOTIFICATION_ID_BASE + (jobId.hashCode() and 0xffff), notification)
  }

  private fun cancelUploadNotification() {
    notificationManager().cancel(UPLOAD_NOTIFICATION_ID)
  }

  companion object {
    // Bump channel id when importance must change (Android freezes channel settings).
    const val UPLOAD_CHANNEL_ID = "flexa_uploads_v2"
    const val UPLOAD_NOTIFICATION_ID = 0xF1E0
    private const val FAILURE_NOTIFICATION_ID_BASE = 0xF2E0
  }
}

private class RetryableUploadException(message: String) : Exception(message)
