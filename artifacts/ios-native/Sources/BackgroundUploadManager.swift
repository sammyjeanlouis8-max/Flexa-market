import Foundation
import Security

/// Durable URLSession upload transport for the standalone shell. Job metadata is
/// kept in Application Support; bearer tokens are kept only in the Keychain.
final class BackgroundUploadManager: NSObject {
    static let shared = BackgroundUploadManager()

    private static let apiBase = "https://flexamarket.com/api/storage/uploads"
    private static let chunkSize = 8_388_608
    private static let maximumRetries = 5
    private let queue = DispatchQueue(label: "com.flexamarket.background-uploads")
    private let fileManager = FileManager.default
    private var jobs: [String: Job] = [:]
    private var backgroundEventsCompletion: (() -> Void)?
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(
            withIdentifier: "com.flexamarket.mobile.background-uploads-v1"
        )
        configuration.isDiscretionary = false
        configuration.sessionSendsLaunchEvents = true
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForRequest = 90
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    private override init() {
        super.init()
        try? fileManager.createDirectory(at: uploadDirectory, withIntermediateDirectories: true)
        loadJobs()
        queue.async { [weak self] in
            self?.purgeExpiredStaging()
            self?.restorePendingUploads()
        }
    }

    // MARK: WebView bridge

    func handle(_ payload: [String: Any]) throws -> [String: Any] {
        try queue.sync {
            purgeExpiredStaging()
            guard payload["type"] as? String == "flexa-upload",
                  let requestId = payload["requestId"] as? String, !requestId.isEmpty, requestId.count <= 128,
                  let action = payload["action"] as? String,
                  let jobId = payload["jobId"] as? String else {
                throw UploadError.invalid("Invalid upload bridge message")
            }
            try validateUUID(jobId, name: "job id")
            switch action {
            case "begin": return try begin(jobId: jobId, payload: payload)
            case "append": return try append(jobId: jobId, payload: payload)
            case "start": return try start(jobId: jobId)
            case "status": return try status(jobId: jobId)
            case "cancel": return try cancel(jobId: jobId)
            default: throw UploadError.invalid("Unsupported upload action")
            }
        }
    }

    private func begin(jobId: String, payload: [String: Any]) throws -> [String: Any] {
        let fileName = try requiredString(payload["fileName"], name: "file name", max: 512)
        let contentType = try requiredString(payload["contentType"], name: "content type", max: 128)
        let uploadId = try requiredString(payload["uploadId"], name: "upload id", max: 128)
        try validateUUID(uploadId, name: "upload id")
        let apiBase = try requiredString(payload["apiBase"], name: "API URL", max: 256)
        guard apiBase == Self.apiBase else { throw UploadError.invalid("Untrusted upload API URL") }
        let token = try requiredString(payload["token"], name: "token", max: 8192)
        let totalBytes = try requiredInt(payload["totalBytes"], name: "total bytes")
        let chunkSize = try requiredInt(payload["chunkSize"], name: "chunk size")
        let totalChunks = try requiredInt(payload["totalChunks"], name: "total chunks")
        guard totalBytes > 0, chunkSize == Self.chunkSize, totalChunks >= 1,
              totalChunks == ((totalBytes - 1) / chunkSize) + 1 else {
            throw UploadError.invalid("Invalid upload dimensions")
        }
        if var existing = jobs[jobId] {
            guard existing.fileName == fileName,
                  existing.contentType == contentType,
                  existing.uploadId == uploadId,
                  existing.totalBytes == totalBytes,
                  existing.chunkSize == chunkSize,
                  existing.totalChunks == totalChunks else {
                throw UploadError.invalid("Upload metadata does not match the persisted job")
            }
            // SecItemUpdate retains the previous Keychain item if the replacement
            // fails, while a successful resume always refreshes the bearer token.
            try saveToken(token, jobId: jobId)
            repairStagingMetadata(&existing)
            return existing.status(includeStaged: true)
        }
        let job = Job(jobId: jobId, fileName: fileName, totalBytes: totalBytes,
                      contentType: contentType, uploadId: uploadId, chunkSize: chunkSize,
                      totalChunks: totalChunks)
        try saveToken(token, jobId: jobId)
        jobs[jobId] = job
        saveJobs()
        return job.status(includeStaged: true)
    }

    private func append(jobId: String, payload: [String: Any]) throws -> [String: Any] {
        guard var job = jobs[jobId] else { throw UploadError.invalid("Unknown upload job") }
        guard job.state == .staging else { throw UploadError.invalid("Upload is no longer accepting file data") }
        let offset = try requiredInt(payload["offset"], name: "offset")
        guard let base64 = payload["data"] as? String, !base64.isEmpty, base64.utf8.count <= 1_500_000,
              let data = Data(base64Encoded: base64, options: []) else {
            throw UploadError.invalid("Invalid base64 file data")
        }
        guard offset >= 0, offset + data.count <= job.totalBytes else {
            throw UploadError.invalid("File data is outside upload bounds")
        }
        let file = stageFile(jobId)
        if offset == job.bytesStaged {
            if !fileManager.fileExists(atPath: file.path) {
                fileManager.createFile(atPath: file.path, contents: nil)
            }
            let handle = try FileHandle(forWritingTo: file)
            defer { try? handle.close() }
            try handle.seek(toOffset: UInt64(offset))
            try handle.write(contentsOf: data)
            job.bytesStaged += data.count
            jobs[jobId] = job
            saveJobs()
        } else if offset < job.bytesStaged, offset + data.count <= job.bytesStaged {
            let handle = try FileHandle(forReadingFrom: file)
            defer { try? handle.close() }
            try handle.seek(toOffset: UInt64(offset))
            let stored = try handle.read(upToCount: data.count) ?? Data()
            guard stored == data else {
                throw UploadError.invalid("Conflicting duplicate file data")
            }
        } else {
            throw UploadError.invalid("File data must be appended in order")
        }
        return job.status(includeStaged: true)
    }

    private func start(jobId: String) throws -> [String: Any] {
        guard var job = jobs[jobId] else { throw UploadError.invalid("Unknown upload job") }
        guard job.bytesStaged == job.totalBytes else { throw UploadError.invalid("File staging is incomplete") }
        if job.state == .complete { return job.status(includeStaged: false) }
        guard job.state != .cancelled else { throw UploadError.invalid("Cancelled uploads cannot be restarted") }
        // The background session already has an active/scheduled task. Do not
        // create a second task for a repeated web `start` request.
        if job.state == .uploading { return job.status(includeStaged: false) }
        job.state = .uploading
        job.error = nil
        job.retries = 0
        jobs[jobId] = job
        saveJobs()
        enqueueNextChunk(jobId: jobId)
        return job.status(includeStaged: false)
    }

    private func status(jobId: String) throws -> [String: Any] {
        guard let job = jobs[jobId] else { throw UploadError.invalid("Unknown upload job") }
        return job.status(includeStaged: false)
    }

    private func cancel(jobId: String) throws -> [String: Any] {
        guard var job = jobs[jobId] else { throw UploadError.invalid("Unknown upload job") }
        session.getAllTasks { tasks in
            tasks.filter { $0.taskDescription?.hasPrefix("\(jobId)|") == true }.forEach { $0.cancel() }
        }
        try? fileManager.removeItem(at: stageFile(jobId))
        try? removeToken(jobId: jobId)
        job.state = .cancelled
        job.error = nil
        jobs[jobId] = job
        saveJobs()
        return job.status(includeStaged: false)
    }

    // MARK: URLSession scheduling

    private func restorePendingUploads() {
        session.getAllTasks { [weak self] tasks in
            guard let self else { return }
            self.queue.async {
                let active = Set(tasks.compactMap { $0.taskDescription?.split(separator: "|").first.map(String.init) })
                for job in self.jobs.values where job.state == .uploading && !active.contains(job.jobId) {
                    self.enqueueNextChunk(jobId: job.jobId)
                }
            }
        }
    }

    private func enqueueNextChunk(jobId: String, earliestBeginDate: Date? = nil) {
        guard let job = jobs[jobId], job.state == .uploading else { return }
        guard job.bytesSent < job.totalBytes else {
            complete(jobId: jobId)
            return
        }
        do {
            let token = try readToken(jobId: jobId)
            let index = job.bytesSent / job.chunkSize
            let bytes = min(job.chunkSize, job.totalBytes - job.bytesSent)
            let chunk = chunkFile(jobId: jobId, index: index)
            let source = try FileHandle(forReadingFrom: stageFile(jobId))
            defer { try? source.close() }
            try source.seek(toOffset: UInt64(job.bytesSent))
            let content = try source.read(upToCount: bytes) ?? Data()
            guard content.count == bytes else { throw UploadError.invalid("Staged file ended unexpectedly") }
            try content.write(to: chunk, options: .atomic)
            guard let url = URL(string: "\(Self.apiBase)/chunk/\(job.uploadId)/\(index)") else {
                throw UploadError.invalid("Invalid upload endpoint")
            }
            var request = URLRequest(url: url)
            request.httpMethod = "PUT"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
            let task = session.uploadTask(with: request, fromFile: chunk)
            task.taskDescription = "\(jobId)|\(index)"
            task.earliestBeginDate = earliestBeginDate
            task.resume()
        } catch {
            retry(jobId: jobId, error: error.localizedDescription)
        }
    }

    private func succeedChunk(jobId: String, index: Int) {
        guard var job = jobs[jobId], job.state == .uploading,
              index == job.bytesSent / job.chunkSize else { return }
        job.bytesSent += min(job.chunkSize, job.totalBytes - job.bytesSent)
        job.retries = 0
        job.error = nil
        jobs[jobId] = job
        try? fileManager.removeItem(at: chunkFile(jobId: jobId, index: index))
        saveJobs()
        enqueueNextChunk(jobId: jobId)
    }

    private func retry(jobId: String, error: String) {
        guard var job = jobs[jobId], job.state == .uploading else { return }
        job.retries += 1
        job.error = error
        if job.retries >= Self.maximumRetries {
            job.state = .failed
            jobs[jobId] = job
            saveJobs()
            return
        }
        jobs[jobId] = job
        saveJobs()
        // A background URLSession task is system scheduled and survives
        // suspension/termination. Never use an in-process Timer for retry.
        let delay = pow(2.0, Double(job.retries - 1)) * 15
        enqueueNextChunk(jobId: jobId, earliestBeginDate: Date().addingTimeInterval(delay))
    }

    private func complete(jobId: String) {
        guard var job = jobs[jobId], job.state == .uploading else { return }
        job.state = .complete
        job.error = nil
        jobs[jobId] = job
        try? fileManager.removeItem(at: stageFile(jobId))
        try? removeToken(jobId: jobId)
        for index in 0..<job.totalChunks { try? fileManager.removeItem(at: chunkFile(jobId: jobId, index: index)) }
        saveJobs()
    }

    /// Do not report bytes that no longer exist after OS storage eviction. If a
    /// confirmed local offset cannot be reconstructed, restart at chunk zero;
    /// chunk PUTs are content-idempotent on the configured server.
    private func repairStagingMetadata(_ job: inout Job) {
        guard job.state != .complete, job.state != .cancelled else { return }
        let url = stageFile(job.jobId)
        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        let available = min(values?.fileSize ?? 0, job.totalBytes)
        guard available < job.bytesStaged else { return }
        job.bytesStaged = available
        if available < job.bytesSent { job.bytesSent = 0 }
        jobs[job.jobId] = job
        saveJobs()
    }

    // MARK: Persistence and Keychain

    private var uploadDirectory: URL {
        let support = try! fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                           appropriateFor: nil, create: true)
        return support.appendingPathComponent("flexa-background-uploads", isDirectory: true)
    }
    private var jobsFile: URL { uploadDirectory.appendingPathComponent("jobs.json") }
    private func stageFile(_ jobId: String) -> URL { uploadDirectory.appendingPathComponent("\(jobId).part") }
    private func chunkFile(jobId: String, index: Int) -> URL {
        uploadDirectory.appendingPathComponent("\(jobId).\(index).chunk")
    }
    private func loadJobs() {
        guard let data = try? Data(contentsOf: jobsFile),
              let decoded = try? JSONDecoder().decode([String: Job].self, from: data) else { return }
        jobs = decoded
    }
    private func saveJobs() {
        guard let data = try? JSONEncoder().encode(jobs) else { return }
        try? data.write(to: jobsFile, options: .atomic)
    }
    private func purgeExpiredStaging() {
        let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
        let expired = jobs.values.filter { $0.state == .staging && $0.createdAt < cutoff }
        for job in expired {
            try? fileManager.removeItem(at: stageFile(job.jobId))
            try? removeToken(jobId: job.jobId)
            jobs.removeValue(forKey: job.jobId)
        }
        saveJobs()
    }
    private func saveToken(_ token: String, jobId: String) throws {
        let data = Data(token.utf8)
        let existingQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.flexamarket.background-upload-token-v1",
            kSecAttrAccount as String: jobId,
        ]
        let updateStatus = SecItemUpdate(existingQuery as CFDictionary,
                                         [kSecValueData as String: data] as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw UploadError.invalid("Unable to securely store upload credentials")
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.flexamarket.background-upload-token-v1",
            kSecAttrAccount as String: jobId,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
            throw UploadError.invalid("Unable to securely store upload credentials")
        }
    }
    private func readToken(jobId: String) throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.flexamarket.background-upload-token-v1",
            kSecAttrAccount as String: jobId,
            kSecReturnData as String: true,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data, let token = String(data: data, encoding: .utf8) else {
            throw UploadError.invalid("Upload credentials are unavailable")
        }
        return token
    }
    private func removeToken(jobId: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.flexamarket.background-upload-token-v1",
            kSecAttrAccount as String: jobId,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func requiredString(_ value: Any?, name: String, max: Int) throws -> String {
        guard let string = value as? String, !string.isEmpty, string.count <= max else {
            throw UploadError.invalid("Invalid \(name)")
        }
        return string
    }
    private func requiredInt(_ value: Any?, name: String) throws -> Int {
        guard let number = value as? NSNumber else { throw UploadError.invalid("Invalid \(name)") }
        let value = number.doubleValue
        guard value.isFinite, value.rounded(.towardZero) == value,
              value >= Double(Int.min), value <= Double(Int.max) else {
            throw UploadError.invalid("Invalid \(name)")
        }
        return Int(value)
    }
    private func validateUUID(_ value: String, name: String) throws {
        guard UUID(uuidString: value) != nil else { throw UploadError.invalid("Invalid \(name)") }
    }

    private enum UploadError: LocalizedError {
        case invalid(String)
        var errorDescription: String? { if case let .invalid(message) = self { return message }; return "Upload error" }
    }

    private enum State: String, Codable { case staging, uploading, complete, failed, cancelled }
    private struct Job: Codable {
        let jobId: String
        let fileName: String
        let totalBytes: Int
        let contentType: String
        let uploadId: String
        let chunkSize: Int
        let totalChunks: Int
        var bytesStaged = 0
        var bytesSent = 0
        var state: State = .staging
        var error: String?
        var retries = 0
        let createdAt = Date()
        func status(includeStaged: Bool) -> [String: Any] {
            var result: [String: Any] = ["state": state.rawValue, "bytesSent": bytesSent, "totalBytes": totalBytes]
            if includeStaged { result["bytesStaged"] = bytesStaged }
            if let error { result["error"] = error }
            return result
        }
    }
}

extension BackgroundUploadManager: URLSessionTaskDelegate, URLSessionDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    didCompleteWithError error: Error?) {
        guard let description = task.taskDescription?.split(separator: "|"),
              description.count == 2, let index = Int(description[1]) else { return }
        let jobId = String(description[0])
        queue.async { [weak self] in
            guard let self else { return }
            let status = (task.response as? HTTPURLResponse)?.statusCode
            if error == nil, let status, (200...299).contains(status) {
                self.succeedChunk(jobId: jobId, index: index)
            } else if status == 401 || status == 403 {
                guard var job = self.jobs[jobId] else { return }
                job.state = .failed
                job.error = "Upload authorization was rejected"
                self.jobs[jobId] = job
                self.saveJobs()
            } else {
                self.retry(jobId: jobId, error: error?.localizedDescription ?? "Chunk upload returned HTTP \(status ?? 0)")
            }
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        guard let url = request.url,
              url.scheme == "https",
              url.host == "flexamarket.com",
              url.path.hasPrefix("/api/storage/uploads/chunk/") else {
            completionHandler(nil)
            return
        }
        completionHandler(request)
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async { [weak self] in
            self?.backgroundEventsCompletion?()
            self?.backgroundEventsCompletion = nil
        }
    }

    func setBackgroundEventsCompletion(_ completion: @escaping () -> Void) {
        backgroundEventsCompletion = completion
    }
}