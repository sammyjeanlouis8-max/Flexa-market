/**
 * Auth brand globe — clean WebGL 3D sphere of international flags.
 * One full Y-axis revolution every 12s. No rings, flares, halos, or glow.
 * Transparent canvas; pauses when tab is hidden / reduced-motion.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const REVOLUTION_MS = 12_000;
const FLAG_TEX_URLS = ["/auth-globe-flags.jpg"] as const;
const SEG_X = 64;
const SEG_Y = 36;
const TEX_W = 2048;
const TEX_H = 1024;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/** Upload-ready power-of-two canvas (WebGL1 needs POT for REPEAT wrap). */
function toPowerOfTwoAtlas(source: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Soft mid-tone fill — never pure black (avoids pole/seam pin dots).
  ctx.fillStyle = "#2a4a7a";
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.drawImage(source, 0, 0, TEX_W, TEX_H);
  // Heal dark pole bands in the photo atlas — UV spheres sample v≈0/1 into a
  // single texel, which otherwise shows as a black pin at the south/north pole.
  healAtlasPoles(ctx, TEX_W, TEX_H);
  return canvas;
}

/** Replace near-black pole strips with stretched mid-latitude flag rows. */
function healAtlasPoles(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const band = Math.max(8, Math.round(h * 0.04));
  // Copy a healthy row just inside the dark strip across the pole caps.
  const topSrc = ctx.getImageData(0, band, w, 1);
  const botSrc = ctx.getImageData(0, h - band - 1, w, 1);
  for (let y = 0; y < band; y++) {
    ctx.putImageData(topSrc, 0, y);
    ctx.putImageData(botSrc, 0, h - 1 - y);
  }
}

async function loadFlagAtlas(): Promise<HTMLCanvasElement> {
  for (const url of FLAG_TEX_URLS) {
    try {
      const img = await loadImage(url);
      return toPowerOfTwoAtlas(img);
    } catch {
      /* try next */
    }
  }
  return toPowerOfTwoAtlas(buildFallbackAtlas());
}

/** Procedural flag mosaic fallback if the photo texture fails. */
function buildFallbackAtlas(): HTMLCanvasElement {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2a4a7a";
  ctx.fillRect(0, 0, W, H);

  const emoji = [
    "🇭🇹", "🇺🇸", "🇨🇦", "🇧🇷", "🇲🇽", "🇬🇧", "🇫🇷", "🇩🇪",
    "🇮🇹", "🇪🇸", "🇯🇵", "🇨🇳", "🇮🇳", "🇦🇺", "🇯🇲", "🇩🇴",
    "🇨🇱", "🇨🇴", "🇦🇷", "🇵🇪", "🇰🇷", "🇳🇱", "🇧🇪", "🇵🇹",
    "🇸🇪", "🇳🇴", "🇨🇭", "🇦🇪", "🇿🇦", "🇰🇪", "🇬🇭", "🇵🇭",
  ];
  const cols = 16;
  const rows = 8;
  const tw = W / cols;
  const th = H / rows;
  const geom: Array<[string, string, string?]> = [
    ["#00209F", "#D21034"], ["#B22234", "#FFFFFF"], ["#012169", "#C8102E"],
    ["#AA151B", "#F1BF00"], ["#002395", "#FFFFFF", "#ED2939"], ["#009C3B", "#FFDF00"],
    ["#CE1126", "#FFFFFF"], ["#000000", "#DD0000", "#FFCE00"], ["#009246", "#FFFFFF", "#CE2B37"],
    ["#BC002D", "#FFFFFF"], ["#DE2910", "#FFDE00"], ["#006847", "#FFFFFF", "#CE1126"],
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * tw;
      const y = r * th;
      const i = r * cols + c;
      ctx.fillStyle = "#1e3a5f";
      ctx.fillRect(x, y, tw, th);
      const g = geom[i % geom.length];
      const band = th / g.length;
      g.forEach((col, bi) => {
        ctx.fillStyle = col!;
        ctx.fillRect(x + 1, y + bi * band + 1, tw - 2, band);
      });
      ctx.font = `${Math.floor(th * 0.62)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji[i % emoji.length], x + tw / 2, y + th / 2 + 1);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
    }
  }
  return canvas;
}

/**
 * UV sphere with real polar caps (single apex + ring). Degenerate lat-long
 * poles leave a 1px hole that reads as a black pin against the navy panel.
 */
function buildSphereMesh() {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const push = (px: number, py: number, pz: number, u: number, v: number) => {
    positions.push(px, py, pz);
    normals.push(px, py, pz);
    uvs.push(u, v);
  };

  // North pole apex — one vertex, colorful UV (not atlas edge).
  const northIdx = 0;
  push(0, 1, 0, 0.5, 0.04);

  // Latitude rings between poles (exclusive).
  const ringStart: number[] = [];
  for (let y = 1; y < SEG_Y; y++) {
    ringStart.push(positions.length / 3);
    const v = y / SEG_Y;
    const theta = v * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const vv = 0.04 + v * 0.92;
    for (let x = 0; x <= SEG_X; x++) {
      const u = x / SEG_X;
      const phi = u * Math.PI * 2;
      push(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi), 1 - u, vv);
    }
  }

  // South pole apex.
  const southIdx = positions.length / 3;
  push(0, -1, 0, 0.5, 0.96);

  // North cap fan: apex → first ring.
  {
    const rs = ringStart[0];
    for (let x = 0; x < SEG_X; x++) {
      indices.push(northIdx, rs + x, rs + x + 1);
    }
  }

  // Quad strips between rings.
  for (let r = 0; r < ringStart.length - 1; r++) {
    const a0 = ringStart[r];
    const b0 = ringStart[r + 1];
    for (let x = 0; x < SEG_X; x++) {
      const a = a0 + x;
      const b = b0 + x;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  // South cap fan: last ring → apex.
  {
    const rs = ringStart[ringStart.length - 1];
    for (let x = 0; x < SEG_X; x++) {
      indices.push(rs + x, southIdx, rs + x + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}

function mulMat4(a: Float32Array, b: Float32Array, out: Float32Array) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
}
function perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
}
function lookAt(out: Float32Array, eye: number[], center: number[], up: number[]) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  const z0 = zx / len, z1 = zy / len, z2 = zz / len;
  let xx = up[1] * z2 - up[2] * z1, xy = up[2] * z0 - up[0] * z2, xz = up[0] * z1 - up[1] * z0;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const y0 = z1 * xz - z2 * xy, y1 = z2 * xx - z0 * xz, y2 = z0 * xy - z1 * xx;
  out[0] = xx; out[1] = y0; out[2] = z0; out[3] = 0;
  out[4] = xy; out[5] = y1; out[6] = z1; out[7] = 0;
  out[8] = xz; out[9] = y2; out[10] = z2; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
}
function identity(out: Float32Array) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
}
function rotateY(out: Float32Array, rad: number) {
  identity(out);
  const c = Math.cos(rad), s = Math.sin(rad);
  out[0] = c; out[2] = -s; out[8] = s; out[10] = c;
}
function rotateX(out: Float32Array, rad: number) {
  identity(out);
  const c = Math.cos(rad), s = Math.sin(rad);
  out[5] = c; out[6] = s; out[9] = -s; out[10] = c;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(info || "shader compile failed");
  }
  return sh;
}
function linkProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || "program link failed");
  }
  return p;
}

const GLOBE_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec2 aUv;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vNorm;
varying vec2 vUv;
void main() {
  vNorm = mat3(uModel) * aNorm;
  vUv = aUv;
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

/** Clean flag lighting — no specular hotspot, no cyan/orange rim glow. */
const GLOBE_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uLight;
varying vec3 vNorm;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vNorm);
  float diff = max(dot(n, normalize(uLight)), 0.0);
  // Soft wrap lighting keeps the front even — no black center pin.
  float wrap = diff * 0.55 + 0.45;
  vec3 tex = texture2D(uTex, vUv).rgb;
  vec3 col = tex * wrap;
  gl_FragColor = vec4(col, 1.0);
}
`;

type MeshBuf = {
  pos: WebGLBuffer;
  norm: WebGLBuffer;
  uv?: WebGLBuffer;
  idx: WebGLBuffer;
  count: number;
};

function uploadMesh(
  gl: WebGLRenderingContext,
  mesh: { positions: Float32Array; normals: Float32Array; uvs?: Float32Array; indices: Uint16Array },
): MeshBuf {
  const pos = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  const norm = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, norm);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  let uv: WebGLBuffer | undefined;
  if (mesh.uvs) {
    uv = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, uv);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
  }
  const idx = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  return { pos, norm, uv, idx, count: mesh.indices.length };
}

async function createRenderer(canvas: HTMLCanvasElement) {
  // premultipliedAlpha:false avoids dark fringe / center artifacts on iOS WKWebView.
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const globeProg = linkProgram(gl, GLOBE_VS, GLOBE_FS);
  const sphere = uploadMesh(gl, buildSphereMesh());
  const texSource = await loadFlagAtlas();

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texSource);
  if (gl.getError() !== gl.NO_ERROR) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, toPowerOfTwoAtlas(buildFallbackAtlas()));
  }

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.colorMask(true, true, true, true);

  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const model = new Float32Array(16);
  const mvp = new Float32Array(16);
  const tmp = new Float32Array(16);
  const tilt = new Float32Array(16);
  const spin = new Float32Array(16);

  // Sphere only — framed to fill the canvas without decorative rings.
  lookAt(view, [0, 0.02, 2.85], [0, 0, 0], [0, 1, 0]);

  const aPosG = gl.getAttribLocation(globeProg, "aPos");
  const aNormG = gl.getAttribLocation(globeProg, "aNorm");
  const aUvG = gl.getAttribLocation(globeProg, "aUv");
  const uMVPG = gl.getUniformLocation(globeProg, "uMVP");
  const uModelG = gl.getUniformLocation(globeProg, "uModel");
  const uTex = gl.getUniformLocation(globeProg, "uTex");
  const uLight = gl.getUniformLocation(globeProg, "uLight");

  function resize(cssW: number, cssH: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, w, h);
    perspective(proj, (38 * Math.PI) / 180, w / h, 0.1, 20);
  }

  function render(angleRad: number) {
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

    rotateX(tilt, -0.18);
    rotateY(spin, angleRad);
    mulMat4(tilt, spin, model);
    mulMat4(view, model, tmp);
    mulMat4(proj, tmp, mvp);

    gl!.useProgram(globeProg);
    gl!.uniformMatrix4fv(uMVPG, false, mvp);
    gl!.uniformMatrix4fv(uModelG, false, model);
    // Soft key light — no specular hotspot / black pin.
    gl!.uniform3f(uLight, 0.35, 0.55, 1.0);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.uniform1i(uTex, 0);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, sphere.pos);
    gl!.enableVertexAttribArray(aPosG);
    gl!.vertexAttribPointer(aPosG, 3, gl!.FLOAT, false, 0, 0);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, sphere.norm);
    gl!.enableVertexAttribArray(aNormG);
    gl!.vertexAttribPointer(aNormG, 3, gl!.FLOAT, false, 0, 0);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, sphere.uv!);
    gl!.enableVertexAttribArray(aUvG);
    gl!.vertexAttribPointer(aUvG, 2, gl!.FLOAT, false, 0, 0);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, sphere.idx);
    gl!.drawElements(gl!.TRIANGLES, sphere.count, gl!.UNSIGNED_SHORT, 0);
  }

  function destroy() {
    gl.deleteTexture(tex);
    gl.deleteBuffer(sphere.pos);
    gl.deleteBuffer(sphere.norm);
    if (sphere.uv) gl.deleteBuffer(sphere.uv);
    gl.deleteBuffer(sphere.idx);
    gl.deleteProgram(globeProg);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { resize, render, destroy };
}

export default function AuthGlobe({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let cancelled = false;
    let renderer: Awaited<ReturnType<typeof createRenderer>> = null;
    let raf = 0;
    let start = performance.now();
    let reduced = prefersReducedMotion();
    let visible = document.visibilityState !== "hidden";
    let inView = true;

    const applySize = () => {
      if (!renderer) return;
      const rect = wrap.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height, 1);
      renderer.resize(size, size);
    };

    const shouldAnimate = () => !cancelled && !!renderer && !reduced && visible && inView;

    const loop = (now: number) => {
      if (!shouldAnimate() || !renderer) return;
      const angle = ((now - start) / REVOLUTION_MS) * Math.PI * 2;
      renderer.render(angle);
      raf = requestAnimationFrame(loop);
    };

    const kick = () => {
      cancelAnimationFrame(raf);
      if (!renderer) return;
      if (reduced) {
        renderer.render(0.4);
        return;
      }
      if (shouldAnimate()) {
        start = performance.now() - ((performance.now() - start) % REVOLUTION_MS);
        raf = requestAnimationFrame(loop);
      }
    };

    const ro = new ResizeObserver(() => {
      applySize();
      if (reduced && renderer) renderer.render(0.4);
    });
    ro.observe(wrap);

    const onVis = () => {
      visible = document.visibilityState !== "hidden";
      kick();
    };
    document.addEventListener("visibilitychange", onVis);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => {
      reduced = mq.matches;
      kick();
    };
    mq.addEventListener?.("change", onMq);

    // Pause off-screen to save battery (Login ↔ Sign Up still keep it alive).
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          inView = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0);
          kick();
        },
        { threshold: 0.05 },
      );
      io.observe(wrap);
    }

    void (async () => {
      try {
        renderer = await createRenderer(canvas);
      } catch {
        renderer = null;
      }
      if (cancelled || !renderer) return;
      applySize();
      kick();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      mq.removeEventListener?.("change", onMq);
      renderer?.destroy();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn("auth-globe-canvas relative", className)}
      aria-hidden
      style={{ background: "transparent" }}
    >
      <canvas
        ref={canvasRef}
        className="relative z-[1] block h-full w-full"
        style={{ width: "100%", height: "100%", background: "transparent" }}
      />
    </div>
  );
}
