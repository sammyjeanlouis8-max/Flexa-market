/**
 * DriverSelfieMobile — Standalone selfie page opened via QR code on mobile.
 * No auth / no layout. Uses session token from URL for API auth.
 * URL: /driver-selfie?sid=SESSION_ID&st=SESSION_TOKEN
 */
import { useState, useRef, useEffect } from "react";
import { Camera, Loader2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Same strategies as ApplyForDriver SelfieStep
const STRATEGIES: MediaStreamConstraints[] = [
  { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } },
  { video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } },
  { video: { facingMode: "user" } },
  { video: { facingMode: { ideal: "user" } } },
  { video: true },
];
const TIMEOUT_MS = 4000;

function acquireStream(c: MediaStreamConstraints): Promise<MediaStream> {
  return Promise.race([
    navigator.mediaDevices.getUserMedia(c),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new DOMException("Timeout", "TimeoutError")), TIMEOUT_MS)
    ),
  ]);
}

type Phase = "idle" | "requesting" | "live" | "capturing" | "uploading" | "done" | "error" | "perm_denied" | "expired";

export default function DriverSelfieMobile() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid") ?? "";
  const st  = params.get("st")  ?? "";

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const mountedRef  = useRef(true);

  const [phase, setPhase]     = useState<Phase>("idle");
  const [errMsg, setErrMsg]   = useState("");

  useEffect(() => () => { mountedRef.current = false; stopStream(); }, []);

  // Validate params on mount
  useEffect(() => {
    if (!sid || !st) { setPhase("error"); setErrMsg("Lyen an pa valid. Skan QR code a ankò."); }
  }, [sid, st]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    try { if (videoRef.current) videoRef.current.srcObject = null; } catch { /* ignore */ }
  };

  // Start camera directly in async handler (iOS user-gesture fix)
  const startCamera = async () => {
    stopStream();
    setPhase("requesting");

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("error"); setErrMsg("Navigatè ou pa sipòte kamera."); return;
    }

    let stream: MediaStream | null = null;
    for (let i = 0; i < STRATEGIES.length; i++) {
      if (!mountedRef.current) return;
      try {
        stream = await acquireStream(STRATEGIES[i]!);
        if (stream) break;
      } catch (err) {
        const e = err as { name?: string };
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          if (mountedRef.current) setPhase("perm_denied");
          return;
        }
      }
    }

    if (!mountedRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
    if (!stream) { setPhase("error"); setErrMsg("Kamera a pa vle ouvri. Reasèye."); return; }

    streamRef.current = stream;
    setPhase("live");
  };

  // Attach stream when phase = "live"
  useEffect(() => {
    if (phase !== "live") return;
    const vid = videoRef.current;
    if (!vid || !streamRef.current) return;
    vid.srcObject = streamRef.current;
    vid.play().catch(() => {});
  }, [phase]);

  // Capture & upload
  const capture = async () => {
    const vid = videoRef.current;
    const cv  = canvasRef.current;
    if (!vid || !cv) return;

    setPhase("capturing");

    const w = Math.max(vid.videoWidth || 0, 640);
    const h = Math.max(vid.videoHeight || 0, 480);
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(vid, 0, 0);
    stopStream();

    cv.toBlob(async blob => {
      if (!blob || !mountedRef.current) return;
      setPhase("uploading");
      try {
        const fd = new FormData();
        fd.append("file", blob, "selfie.jpg");
        fd.append("st", st);
        const res = await fetch(`/api/driver/selfie-session/${sid}/complete`, {
          method: "POST",
          body: fd,
        });
        const d = await res.json() as { ok?: boolean; error?: string };
        if (!mountedRef.current) return;
        if (res.status === 410) { setPhase("expired"); return; }
        if (!res.ok || !d.ok) { setPhase("error"); setErrMsg(d.error ?? "Upload echwe."); return; }
        setPhase("done");
      } catch {
        if (mountedRef.current) { setPhase("error"); setErrMsg("Koneksyon echwe. Reasèye."); }
      }
    }, "image/jpeg", 0.9);
  };

  const isLive = phase === "live";

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col items-center justify-center px-6 py-8 gap-6">

      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center text-white font-black text-sm">F</div>
        <span className="text-white font-black">FLEXA MARKET</span>
      </div>

      {/* ── DONE ── */}
      {phase === "done" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="h-12 w-12 text-green-400" />
          </div>
          <h2 className="text-white font-black text-xl">Selfie resevwa!</h2>
          <p className="text-gray-400 text-sm max-w-xs">
            Retounen sou òdinatè ou a — aplikasyon an ap kontinye otomatikman.
          </p>
          <div className="mt-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold">
            Ou ka fèmen paj sa a
          </div>
        </div>
      )}

      {/* ── EXPIRED ── */}
      {phase === "expired" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-16 w-16 text-yellow-400" />
          <h2 className="text-white font-black text-xl">Sesyon ekspire</h2>
          <p className="text-gray-400 text-sm">QR code a ekspire. Retounen sou òdinatè a epi jeneréen youn.</p>
        </div>
      )}

      {/* ── PERM DENIED ── */}
      {phase === "perm_denied" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-16 w-16 text-red-400" />
          <h2 className="text-white font-black text-xl">Pèmisyon refize</h2>
          <p className="text-gray-400 text-sm">Al nan Paramèt → Safari/Chrome → aktive pèmisyon kamera.</p>
          <button onClick={startCamera}
            className="mt-2 w-full h-12 rounded-2xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" /> Reasèye
          </button>
        </div>
      )}

      {/* ── ERROR ── */}
      {phase === "error" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-16 w-16 text-red-400" />
          <h2 className="text-white font-black text-xl">Erè</h2>
          <p className="text-gray-400 text-sm">{errMsg}</p>
          {sid && st && (
            <button onClick={startCamera}
              className="w-full h-12 rounded-2xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4" /> Reasèye
            </button>
          )}
        </div>
      )}

      {/* ── IDLE / REQUESTING / CAPTURING / UPLOADING / LIVE ── */}
      {(phase === "idle" || phase === "requesting" || phase === "live" || phase === "capturing" || phase === "uploading") && (
        <>
          <div className="text-center">
            <h2 className="text-white font-black text-xl">Pran selfie ou</h2>
            <p className="text-gray-400 text-sm mt-1">Mete figi ou nan mitan kamera a epi pran foto</p>
          </div>

          {/* Camera circle */}
          <div className="relative w-72 h-72">
            <div className={cn(
              "absolute inset-0 rounded-full border-4 transition-colors duration-500",
              isLive ? "border-green-400 shadow-[0_0_24px_rgba(74,222,128,0.4)]" : "border-blue-500/50"
            )} />
            <div className="absolute inset-0 rounded-full overflow-hidden bg-[#1a3a5c]/60">
              {/* Loading overlay */}
              {(phase === "requesting") && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                  <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
                  <span className="text-blue-300 text-xs">Ap ouvri kamera…</span>
                </div>
              )}
              {(phase === "capturing" || phase === "uploading") && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 bg-[#0d1b2a]/70">
                  <Loader2 className="h-10 w-10 text-green-400 animate-spin" />
                  <span className="text-green-300 text-xs">
                    {phase === "uploading" ? "Ap telechaje…" : "Ap pran foto…"}
                  </span>
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay muted playsInline
                className={cn("w-full h-full object-cover scale-x-[-1]", !isLive && "opacity-0")}
              />
            </div>
            {/* Face guide overlay on idle */}
            {phase === "idle" && (
              <div className="absolute inset-0 rounded-full flex items-center justify-center">
                <Camera className="h-16 w-16 text-blue-400 opacity-40" />
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="w-full max-w-xs space-y-3">
            {/* Open camera button */}
            {phase === "idle" && (
              <button onClick={startCamera}
                className="w-full h-14 rounded-2xl bg-blue-600 text-white font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 active:scale-[0.98]">
                <Camera className="h-5 w-5" />
                Ouvri Kamera
              </button>
            )}

            {/* Capture button */}
            {isLive && (
              <button onClick={capture}
                className="w-full h-14 rounded-2xl bg-green-500 text-white font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-green-500/30 active:scale-[0.98]">
                <Camera className="h-5 w-5" />
                Pran Selfie
              </button>
            )}

            {/* Requesting / uploading — disabled placeholder */}
            {(phase === "requesting" || phase === "capturing" || phase === "uploading") && (
              <div className="w-full h-14 rounded-2xl bg-blue-600/40 text-white/50 font-black text-base flex items-center justify-center gap-2 cursor-not-allowed">
                <Loader2 className="h-5 w-5 animate-spin" />
                {phase === "uploading" ? "Ap telechaje…" : "Ap tann…"}
              </div>
            )}
          </div>

          {/* Security note */}
          <p className="text-gray-500 text-xs text-center">
            🔒 Foto a pral sèlman itilize pou verifye idantite chofè a
          </p>
        </>
      )}
    </div>
  );
}
