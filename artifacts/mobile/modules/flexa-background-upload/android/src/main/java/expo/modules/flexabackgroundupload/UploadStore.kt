package expo.modules.flexabackgroundupload

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.io.File
import java.io.RandomAccessFile
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

internal const val UPLOAD_API_BASE = "https://flexamarket.com/api/storage/uploads"
internal const val UPLOAD_CHUNK_BYTES = 8_388_608L
private const val MAX_STAGE_MESSAGE_BYTES = 1_500_000
private const val MAX_STAGING_AGE_MS = 24 * 60 * 60 * 1000L

internal data class UploadJob(
  val jobId: String,
  val fileName: String,
  val totalBytes: Long,
  val contentType: String,
  val uploadId: String,
  val chunkSize: Long,
  val totalChunks: Int,
  var bytesStaged: Long = 0,
  var bytesSent: Long = 0,
  var state: String = "staging",
  var error: String? = null,
  var retries: Int = 0,
  val createdAt: Long = System.currentTimeMillis(),
) {
  fun status(): Map<String, Any?> = mapOf(
    "state" to state,
    "bytesSent" to bytesSent,
    "totalBytes" to totalBytes,
    "error" to error,
  ).filterValues { it != null }
}

/**
 * The metadata preference contains no bearer material. Each token is encrypted with
 * an AndroidKeyStore AES-GCM key before it is written to its separate preference.
 */
internal class UploadStore(private val context: Context) {
  companion object {
    /** Shared by bridge and Worker instances so cancel wins over stale writes. */
    internal val mutationLock = Any()
  }

  private val jobs: SharedPreferences = context.getSharedPreferences("flexa_upload_jobs_v1", Context.MODE_PRIVATE)
  private val tokens: SharedPreferences = context.getSharedPreferences("flexa_upload_tokens_v1", Context.MODE_PRIVATE)
  private val directory = File(context.filesDir, "flexa-uploads").also { it.mkdirs() }

  fun handle(message: Map<String, Any?>): Map<String, Any?> {
    synchronized(mutationLock) {
      purgeExpiredStaging()
      require(message["type"] == "flexa-upload") { "Invalid upload bridge message" }
      boundedString(message["requestId"], "request id", 128)
      val action = message["action"] as? String ?: throw IllegalArgumentException("Missing upload action")
      val jobId = message["jobId"] as? String ?: throw IllegalArgumentException("Missing job id")
      requireUuid(jobId, "job id")
      return when (action) {
        "begin" -> begin(jobId, message)
        "append" -> append(jobId, message)
        "start" -> start(jobId)
        "status" -> status(jobId)
        "cancel" -> cancel(jobId)
        else -> throw IllegalArgumentException("Unsupported upload action")
      }
    }
  }

  private fun begin(jobId: String, message: Map<String, Any?>): Map<String, Any?> {
    val fileName = boundedString(message["fileName"], "file name", 512)
    val contentType = boundedString(message["contentType"], "content type", 128)
    val uploadId = boundedString(message["uploadId"], "upload id", 128).also { requireUuid(it, "upload id") }
    val apiBase = boundedString(message["apiBase"], "API URL", 256)
    require(apiBase == UPLOAD_API_BASE) { "Untrusted upload API URL" }
    val token = boundedString(message["token"], "token", 8192)
    val totalBytes = number(message["totalBytes"], "total bytes")
    val chunkSize = number(message["chunkSize"], "chunk size")
    val totalChunksLong = number(message["totalChunks"], "total chunks")
    require(totalChunksLong <= Int.MAX_VALUE) { "Invalid chunk count" }
    val totalChunks = totalChunksLong.toInt()
    require(totalBytes > 0 && chunkSize == UPLOAD_CHUNK_BYTES && totalChunks >= 1) { "Invalid upload dimensions" }
    require(totalChunks.toLong() == ((totalBytes - 1) / chunkSize) + 1) { "Invalid chunk count" }
    val existing = read(jobId)
    if (existing != null) {
      require(
        existing.fileName == fileName &&
          existing.contentType == contentType &&
          existing.uploadId == uploadId &&
          existing.totalBytes == totalBytes &&
          existing.chunkSize == chunkSize &&
          existing.totalChunks == totalChunks,
      ) { "Upload metadata does not match the persisted job" }
      // commit() atomically replaces only this job's ciphertext after a fresh
      // Keystore encryption succeeds, so a resumed login cannot use an old token.
      saveToken(jobId, token)
      repairStagingMetadata(existing)
      return existing.status() + mapOf("bytesStaged" to existing.bytesStaged)
    }
    val job = UploadJob(jobId, fileName, totalBytes, contentType, uploadId, chunkSize, totalChunks)
    save(job)
    saveToken(jobId, token)
    return job.status() + mapOf("bytesStaged" to 0L)
  }

  private fun append(jobId: String, message: Map<String, Any?>): Map<String, Any?> {
    val job = requireJob(jobId)
    require(job.state == "staging") { "Upload is no longer accepting file data" }
    val offset = number(message["offset"], "offset")
    val encoded = boundedString(message["data"], "file data", MAX_STAGE_MESSAGE_BYTES)
    val bytes = try {
      Base64.decode(encoded, Base64.NO_WRAP)
    } catch (_: IllegalArgumentException) {
      throw IllegalArgumentException("Invalid base64 file data")
    }
    require(offset >= 0 && offset + bytes.size <= job.totalBytes) { "File data is outside upload bounds" }
    val stage = stageFile(jobId)
    when {
      offset == job.bytesStaged -> {
        RandomAccessFile(stage, "rw").use { it.seek(offset); it.write(bytes) }
        job.bytesStaged += bytes.size
        save(job)
      }
      offset < job.bytesStaged && offset + bytes.size <= job.bytesStaged -> {
        val previous = ByteArray(bytes.size)
        RandomAccessFile(stage, "r").use { it.seek(offset); it.readFully(previous) }
        require(previous.contentEquals(bytes)) { "Conflicting duplicate file data" }
      }
      else -> throw IllegalArgumentException("File data must be appended in order")
    }
    return job.status() + mapOf("bytesStaged" to job.bytesStaged)
  }

  private fun start(jobId: String): Map<String, Any?> {
    val job = requireJob(jobId)
    require(job.bytesStaged == job.totalBytes) { "File staging is incomplete" }
    if (job.state == "complete") return job.status()
    require(job.state != "cancelled") { "Cancelled uploads cannot be restarted" }
    // WorkManager already owns an uploading job. REPLACE here would cancel a
    // durable transfer and may cause needless duplicate traffic.
    if (job.state == "uploading") return job.status()
    job.state = "uploading"
    job.error = null
    job.retries = 0
    save(job)
    val request = OneTimeWorkRequestBuilder<FlexaUploadWorker>()
      .setInputData(Data.Builder().putString("jobId", jobId).build())
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .addTag("flexa-upload-$jobId")
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork("flexa-upload-$jobId", ExistingWorkPolicy.REPLACE, request)
    return job.status() + mapOf("bytesStaged" to job.bytesStaged)
  }

  private fun status(jobId: String): Map<String, Any?> {
    val job = requireJob(jobId)
    return job.status()
  }

  private fun cancel(jobId: String): Map<String, Any?> {
    val job = requireJob(jobId)
    WorkManager.getInstance(context).cancelUniqueWork("flexa-upload-$jobId")
    stageFile(jobId).delete()
    deleteToken(jobId)
    job.state = "cancelled"
    job.error = null
    save(job)
    return job.status()
  }

  internal fun requireJob(jobId: String) = read(jobId) ?: throw IllegalArgumentException("Unknown upload job")
  /** Returns null for cancelled/failed/completed jobs without exposing a stale mutable job. */
  internal fun activeJob(jobId: String): UploadJob? = synchronized(mutationLock) {
    read(jobId)?.takeIf { it.state == "uploading" }
  }

  /** Atomically persists progress only while the job remains uploading. */
  internal fun advanceIfUploading(jobId: String, bytes: Long): UploadJob? = synchronized(mutationLock) {
    val job = read(jobId)?.takeIf { it.state == "uploading" } ?: return@synchronized null
    job.bytesSent += bytes
    job.retries = 0
    job.error = null
    save(job)
    job
  }

  internal fun completeIfUploading(jobId: String): Boolean = synchronized(mutationLock) {
    val job = read(jobId)?.takeIf { it.state == "uploading" } ?: return@synchronized false
    job.state = "complete"
    job.error = null
    save(job)
    true
  }

  /**
   * Retry accounting is deliberately job-local and resets only after a
   * confirmed chunk. WorkManager runAttemptCount spans worker executions and
   * must not turn five fresh chunk attempts into an early terminal failure.
   */
  internal fun recordFailureIfUploading(jobId: String, message: String): FailureDisposition =
    synchronized(mutationLock) {
      val job = read(jobId)?.takeIf { it.state == "uploading" }
        ?: return@synchronized FailureDisposition.CancelledOrTerminal
      job.retries += 1
      job.error = message
      if (job.retries >= 5) {
        job.state = "failed"
        save(job)
        FailureDisposition.Failed
      } else {
        save(job)
        FailureDisposition.Retry
      }
    }

  /** Used for non-retryable validation and authorization failures. */
  internal fun failIfUploading(jobId: String, message: String): Boolean = synchronized(mutationLock) {
    val job = read(jobId)?.takeIf { it.state == "uploading" } ?: return@synchronized false
    job.state = "failed"
    job.error = message
    save(job)
    true
  }

  internal enum class FailureDisposition { Retry, Failed, CancelledOrTerminal }
  internal fun stageFile(jobId: String) = File(directory, "$jobId.part")
  internal fun token(jobId: String) = readToken(jobId) ?: throw IllegalStateException("Upload credentials are unavailable")
  internal fun save(job: UploadJob) {
    jobs.edit().putString(job.jobId, JSONObject().apply {
      put("jobId", job.jobId); put("fileName", job.fileName); put("totalBytes", job.totalBytes)
      put("contentType", job.contentType); put("uploadId", job.uploadId); put("chunkSize", job.chunkSize)
      put("totalChunks", job.totalChunks); put("bytesStaged", job.bytesStaged); put("bytesSent", job.bytesSent)
      put("state", job.state); put("error", job.error); put("retries", job.retries); put("createdAt", job.createdAt)
    }.toString()).commit()
  }

  /**
   * Metadata is committed after each append, but storage can still be evicted
   * independently. Never claim more staged bytes than are present on disk.
   * If the source was truncated before a confirmed byte, restart from chunk 0;
   * the server's duplicate-chunk contract makes that safe.
   */
  private fun repairStagingMetadata(job: UploadJob) {
    if (job.state == "complete" || job.state == "cancelled") return
    val available = if (stageFile(job.jobId).isFile) {
      minOf(stageFile(job.jobId).length(), job.totalBytes)
    } else 0L
    if (available < job.bytesStaged) {
      job.bytesStaged = available
      if (available < job.bytesSent) job.bytesSent = 0
      save(job)
    }
  }

  private fun read(jobId: String): UploadJob? = jobs.getString(jobId, null)?.let {
    val value = JSONObject(it)
    UploadJob(value.getString("jobId"), value.getString("fileName"), value.getLong("totalBytes"),
      value.getString("contentType"), value.getString("uploadId"), value.getLong("chunkSize"),
      value.getInt("totalChunks"), value.getLong("bytesStaged"), value.getLong("bytesSent"),
      value.getString("state"), value.optString("error").ifBlank { null }, value.optInt("retries"),
      value.getLong("createdAt"))
  }

  private fun purgeExpiredStaging() {
    val now = System.currentTimeMillis()
    jobs.all.forEach { (id, _) ->
      val job = try { read(id) } catch (_: Exception) { null } ?: return@forEach
      if (job.state == "staging" && now - job.createdAt > MAX_STAGING_AGE_MS) {
        stageFile(job.jobId).delete()
        deleteToken(job.jobId)
        jobs.edit().remove(job.jobId).commit()
      }
    }
  }

  private fun saveToken(jobId: String, token: String) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, keystoreKey())
    val encrypted = Base64.encodeToString(cipher.iv + cipher.doFinal(token.toByteArray(StandardCharsets.UTF_8)), Base64.NO_WRAP)
    check(tokens.edit().putString(jobId, encrypted).commit()) { "Unable to securely store upload credentials" }
  }

  private fun readToken(jobId: String): String? = tokens.getString(jobId, null)?.let { stored ->
    val packed = Base64.decode(stored, Base64.NO_WRAP)
    require(packed.size > 12) { "Stored upload credentials are invalid" }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, keystoreKey(), GCMParameterSpec(128, packed.copyOfRange(0, 12)))
    String(cipher.doFinal(packed.copyOfRange(12, packed.size)), StandardCharsets.UTF_8)
  }

  private fun deleteToken(jobId: String) { tokens.edit().remove(jobId).commit() }
  private fun keystoreKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("flexa_upload_token_v1", null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("flexa_upload_token_v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }

  private fun boundedString(value: Any?, field: String, max: Int): String {
    require(value is String && value.isNotBlank() && value.length <= max) { "Invalid $field" }
    return value
  }
  private fun number(value: Any?, field: String): Long {
    val raw = (value as? Number)?.toDouble() ?: throw IllegalArgumentException("Invalid $field")
    require(raw.isFinite() && raw == kotlin.math.floor(raw) &&
      raw >= Long.MIN_VALUE.toDouble() && raw <= Long.MAX_VALUE.toDouble()) { "Invalid $field" }
    return raw.toLong()
  }
  private fun requireUuid(value: String, field: String) { try { UUID.fromString(value) } catch (_: IllegalArgumentException) { throw IllegalArgumentException("Invalid $field") } }
}