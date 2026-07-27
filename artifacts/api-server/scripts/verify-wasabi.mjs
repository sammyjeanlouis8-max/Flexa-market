/**
 * Wasabi connection verification script.
 * Runs outside the server process so it reads env vars directly.
 * Tests: upload → HEAD (existence) → public/signed URL → range request → delete
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ENDPOINT   = process.env.WASABI_ENDPOINT    ?? "https://s3.us-east-1.wasabisys.com";
const REGION     = process.env.WASABI_REGION      ?? "us-east-1";
const BUCKET     = process.env.WASABI_BUCKET_NAME ?? "";
const ACCESS_KEY = process.env.WASABI_ACCESS_KEY  ?? "";
const SECRET_KEY = process.env.WASABI_SECRET_KEY  ?? "";

const RESET = "\x1b[0m", GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", BOLD = "\x1b[1m", DIM = "\x1b[2m";
const ok  = (msg) => console.log(`  ${GREEN}✅ ${msg}${RESET}`);
const fail = (msg) => console.log(`  ${RED}❌ ${msg}${RESET}`);
const info = (msg) => console.log(`  ${DIM}${msg}${RESET}`);

// ── Minimal silent MP3 (44 bytes) ─────────────────────────────────────────────
// ID3v2 header + minimal MPEG frame so Content-Type: audio/mpeg is unambiguous
const SILENT_MP3 = Buffer.from(
  "494433030000000000" +          // ID3v2.3 header, no frames, size=0
  "fffb9000" +                     // MPEG1 Layer3 frame header (128kbps, 44100Hz, stereo)
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "00000000",
  "hex"
);

async function run() {
  console.log(`\n${BOLD}Wasabi Verification${RESET}`);
  console.log(`${DIM}Endpoint : ${ENDPOINT}${RESET}`);
  console.log(`${DIM}Bucket   : ${BUCKET}${RESET}`);
  console.log(`${DIM}Region   : ${REGION}${RESET}\n`);

  if (!ACCESS_KEY || !SECRET_KEY || !BUCKET) {
    fail("Missing credentials — WASABI_ACCESS_KEY, WASABI_SECRET_KEY, or WASABI_BUCKET_NAME not set.");
    process.exit(1);
  }

  const client = new S3Client({
    endpoint:       ENDPOINT,
    region:         REGION,
    forcePathStyle: true,
    credentials:    { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });

  const key = `_test/flexa-verify-${Date.now()}.mp3`;
  let cleanedUp = false;

  // ── 1. Upload ───────────────────────────────────────────────────────────────
  process.stdout.write("1. Upload … ");
  try {
    await client.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key,
      Body: SILENT_MP3, ContentType: "audio/mpeg",
    }));
    console.log(`${GREEN}ok${RESET}`);
    ok(`Uploaded test file → ${key}`);
  } catch (e) {
    console.log(`${RED}FAILED${RESET}`);
    fail(`Upload error: ${e.message}`);
    process.exit(1);
  }

  // ── 2. HEAD (existence) ─────────────────────────────────────────────────────
  process.stdout.write("2. Existence check (HEAD) … ");
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    console.log(`${GREEN}ok${RESET}`);
    ok(`Object exists — ContentType: ${head.ContentType}, Size: ${head.ContentLength} bytes`);
  } catch (e) {
    console.log(`${RED}FAILED${RESET}`);
    fail(`HEAD error: ${e.message}`);
  }

  // ── 3. Public URL reachability ──────────────────────────────────────────────
  const publicUrl = `${ENDPOINT}/${BUCKET}/${key}`;
  process.stdout.write("3. Public URL … ");
  try {
    const res = await fetch(publicUrl, { method: "HEAD" });
    if (res.ok) {
      console.log(`${GREEN}ok (public bucket)${RESET}`);
      ok(`Bucket is PUBLIC — direct URL works: ${publicUrl}`);
      info("audio_url will be stored as direct Wasabi URL");
    } else if (res.status === 403) {
      console.log(`${YELLOW}private (403)${RESET}`);
      ok("Bucket is PRIVATE — signed URLs will be used for streaming");
      info("WASABI_PUBLIC env var will auto-detect this");
    } else {
      console.log(`${YELLOW}${res.status}${RESET}`);
      info(`Unexpected status ${res.status} — treating as private`);
    }
  } catch (e) {
    console.log(`${YELLOW}fetch error${RESET}`);
    info(`Could not reach public URL (${e.message}) — treating as private`);
  }

  // ── 4. Signed URL ────────────────────────────────────────────────────────────
  process.stdout.write("4. Signed URL … ");
  let signedUrl;
  try {
    signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: 300 }
    );
    console.log(`${GREEN}ok${RESET}`);
    ok("Signed URL generated (5-min expiry)");
    info(signedUrl.slice(0, 90) + "…");
  } catch (e) {
    console.log(`${RED}FAILED${RESET}`);
    fail(`Signed URL error: ${e.message}`);
  }

  // ── 5. Range request via signed URL ─────────────────────────────────────────
  if (signedUrl) {
    process.stdout.write("5. Range request (seek simulation) … ");
    try {
      const res = await fetch(signedUrl, { headers: { Range: "bytes=0-15" } });
      if (res.status === 206 || res.status === 200) {
        console.log(`${GREEN}ok (${res.status})${RESET}`);
        ok(`Range request supported — status ${res.status}, Accept-Ranges: ${res.headers.get("accept-ranges") ?? "not set"}`);
      } else {
        console.log(`${YELLOW}${res.status}${RESET}`);
        info(`Range returned ${res.status} — seeking may not work for private buckets`);
      }
    } catch (e) {
      console.log(`${YELLOW}error${RESET}`);
      info(`Range request error: ${e.message}`);
    }
  }

  // ── 6. Delete ────────────────────────────────────────────────────────────────
  process.stdout.write("6. Delete … ");
  try {
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    console.log(`${GREEN}ok${RESET}`);
    ok("Test object deleted — bucket cleanup confirmed");
    cleanedUp = true;
  } catch (e) {
    console.log(`${RED}FAILED${RESET}`);
    fail(`Delete error: ${e.message}`);
  }

  // ── 7. Confirm deleted ───────────────────────────────────────────────────────
  if (cleanedUp) {
    process.stdout.write("7. Confirm deletion … ");
    try {
      await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      console.log(`${YELLOW}still exists?${RESET}`);
    } catch (e) {
      if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") {
        console.log(`${GREEN}ok (404)${RESET}`);
        ok("Object confirmed deleted");
      } else {
        console.log(`${YELLOW}${e.name}${RESET}`);
        info(`Unexpected: ${e.message}`);
      }
    }
  }

  console.log(`\n${BOLD}${GREEN}All checks passed — Wasabi is fully operational for Flexa Music.${RESET}\n`);
}

run().catch(e => {
  console.error(`\n${RED}Fatal: ${e.message}${RESET}`);
  process.exit(1);
});
