package expo.modules.flexabackgroundupload

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
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
  override suspend fun doWork(): Result {
    val jobId = inputData.getString("jobId") ?: return Result.failure()
    val store = UploadStore(applicationContext)
    val job = try { store.requireJob(jobId) } catch (_: Exception) { return Result.failure() }
    if (job.state == "cancelled" || job.state == "complete") return Result.success()
    if (job.bytesStaged != job.totalBytes) return fail(store, job, "File staging is incomplete")
    setForeground(createForegroundInfo())
    return try {
      while (true) {
        val active = store.activeJob(jobId) ?: return Result.success()
        if (active.bytesSent >= active.totalBytes) break
        val index = (active.bytesSent / active.chunkSize).toInt()
        val remaining = active.totalBytes - active.bytesSent
        val count = minOf(active.chunkSize, remaining)
        val connection = (URL("$UPLOAD_API_BASE/chunk/${job.uploadId}/$index").openConnection() as HttpURLConnection).apply {
          requestMethod = "PUT"
          instanceFollowRedirects = false
          connectTimeout = 30_000
          readTimeout = 60_000
          doOutput = true
          fixedLengthStreamingMode(count)
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
      if (isStopped || !store.completeIfUploading(jobId)) return Result.success()
      store.stageFile(jobId).delete()
      Result.success()
    } catch (error: RetryableUploadException) {
      retryOrFail(store, job, error.message ?: "Network upload failed")
    } catch (error: Exception) {
      retryOrFail(store, job, "Upload failed: ${error.message ?: "unknown error"}")
    }
  }

  private fun retryOrFail(store: UploadStore, job: UploadJob, message: String): Result {
    if (isStopped) return Result.success()
    return when (store.recordFailureIfUploading(job.jobId, message)) {
      UploadStore.FailureDisposition.Retry -> Result.retry()
      UploadStore.FailureDisposition.Failed -> Result.failure()
      UploadStore.FailureDisposition.CancelledOrTerminal -> Result.success()
    }
  }

  private fun fail(store: UploadStore, job: UploadJob, message: String): Result {
    return if (store.failIfUploading(job.jobId, message)) Result.failure() else Result.success()
  }

  private fun createForegroundInfo(): ForegroundInfo {
    val channelId = "flexa_uploads"
    val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(channelId, "Uploads", NotificationManager.IMPORTANCE_LOW),
      )
    }
    val notification = NotificationCompat.Builder(applicationContext, channelId)
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle("Uploading to Flexa Market")
      .setContentText("Your upload will continue in the background.")
      .setOngoing(true)
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(
        0xF1E0,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      ForegroundInfo(0xF1E0, notification)
    }
  }
}

private class RetryableUploadException(message: String) : Exception(message)