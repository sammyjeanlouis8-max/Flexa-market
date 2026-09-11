import assert from "node:assert/strict";
import test from "node:test";
import { parseFlexaUploadMessage } from "../native/backgroundUploadProtocol.ts";

const jobId = "2dd8b1bf-06ec-4c4a-8f63-464ccd49b37d";

test("accepts only the versioned background upload command envelope", () => {
  const parsed = parseFlexaUploadMessage(JSON.stringify({
    type: "flexa-upload",
    requestId: "request-1",
    action: "status",
    jobId,
  }));
  assert.equal(parsed?.action, "status");
  assert.equal(parsed?.jobId, jobId);
});

test("rejects non-bridge and malformed messages before native dispatch", () => {
  assert.equal(parseFlexaUploadMessage("{"), null);
  assert.equal(parseFlexaUploadMessage(JSON.stringify({ type: "AUTH_TOKEN", token: "x" })), null);
  assert.equal(parseFlexaUploadMessage(JSON.stringify({
    type: "flexa-upload", requestId: "", action: "deleteEverything", jobId,
  })), null);
});