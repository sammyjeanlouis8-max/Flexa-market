/**
 * Real WebGL 3D auth globe: flag mosaic sphere + glowing orbital rings.
 * Spins once every 18s around the vertical axis. Respects reduced-motion.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const REVOLUTION_MS = 18_000;
const ATLAS_W = 1024;
const ATLAS_H = 512;
const SEG_X = 48;
const SEG_Y = 28;

type FlagSpec = { bg: string[]; stripe?: "h" | "v" | "d"; emblem?: string };

/** Compact palette of recognizable national flags for the sphere atlas. */
const FLAGS: FlagSpec[] = [
  { bg: ["#00209F", "#D21034"], stripe: "h", emblem: "⬜" }, // Haiti
  { bg: ["#B22234", "#FFFFFF"], stripe: "h", emblem: "🔵" }, // USA-ish
  { bg: ["#012169", "#C8102E", "#FFFFFF"], stripe: "d" }, // UK-ish
  { bg: ["#AA151B", "#F1BF00"], stripe: "h" }, // Spain
  { bg: ["#002395", "#FFFFFF", "#ED2939"], stripe: "v" }, // France
  { bg: ["#009C3B", "#FFDF00", "#002776"], stripe: "v" }, // Brazil
  { bg: ["#FF0000", "#FFFFFF"], stripe: "h", emblem: "🍁" }, // Canada
  { bg: ["#CE1126", "#002D62"], stripe: "h" }, // Dominican Republic
  { bg: ["#000000", "#DD0000", "#FFCE00"], stripe: "h" }, // Germany
  { bg: ["#009246", "#FFFFFF", "#CE2B37"], stripe: "v" }, // Italy
  { bg: ["#BC002D", "#FFFFFF"], stripe: "h", emblem: "⚪" }, // Japan
  { bg: ["#DE2910", "#FFDE00"], stripe: "h", emblem: "⭐" }, // China
  { bg: ["#00247D", "#FFFFFF", "#CF142B"], stripe: "h" }, // Netherlands-ish / UK alt
  { bg: ["#006847", "#FFFFFF", "#CE1126"], stripe: "v" }, // Mexico
  { bg: ["#002B7F", "#FCD116", "#CE1126"], stripe: "h" }, // Colombia / Ecuador-ish
  { bg: ["#AE1C28", "#21468B", "#FFFFFF"], stripe: "h" }, // Netherlands
  { bg: ["#000000", "#FF1000", "#008751"], stripe: "v" }, // Afro-Caribbean
  { bg: ["#CE1126", "#FCD116", "#00209F"], stripe: "v" }, // Chad / Romania-ish
  { bg: ["#FF9933", "#FFFFFF", "#138808"], stripe: "h", emblem: "🔵" }, // India
  { bg: ["#00209F", "#FFFFFF", "#D21034"], stripe: "h" }, // Russia-ish / Serbia
  { bg: ["#012169", "#FFFFFF", "#C8102E"], stripe: "v" }, // France alt
  { bg: ["#FFCD00", "#000000", "#FF0000"], stripe: "h" }, // Belgium / Germany alt
  { bg: ["#006600", "#FFD100", "#000000"], stripe: "h" }, // Jamaica
  { bg: ["#CE1126", "#00247D"], stripe: "h", emblem: "⭐" }, // Cuba-ish
  { bg: ["#009639", "#FED100", "#002395"], stripe: "h" }, // Gabon / Caribbean
  { bg: ["#FCD116", "#008751", "#E2231A"], stripe: "h" }, // Ghana
  { bg: ["#000000", "#FF0000", "#008000", "#FFFFFF"], stripe: "h" }, // Kenya-ish
  { bg: ["#002395", "#FFFFFF", "#ED2939"], stripe: "h" }, // Thailand-ish
  { bg: ["#C8102E", "#012169"], stripe: "h", emblem: "⬜" }, // Cambodia-ish / Chile
  { bg: ["#D52B1E", "#0039A6", "#FFFFFF"], stripe: "h" }, // Armenia-ish
  { bg: ["#FF0000", "#FFFFFF", "#0000FF"], stripe: "h" }, // Netherlands alt
  { bg: ["#006847", "#CE1126", "#FFFFFF"], stripe: "h" }, // Iran-ish / Mexico alt
];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function paintFlag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, flag: FlagSpec) {
  const pad = Math.max(1, Math.floor(Math.min(w, h) * 0.04));
  const fx = x + pad;
  const fy = y + pad;
  const fw = w - pad * 2;
  const fh = h - pad * 2;
  ctx.fillStyle = "#0a1628";
  ctx.fillRect(x, y, w, h);

  const colors = flag.bg;
  if (!flag.stripe || colors.length === 1) {
    ctx.fillStyle = colors[0];
    ctx.fillRect(fx, fy, fw, fh);
  } else if (flag.stripe === "h") {
    const band = fh / colors.length;
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(fx, fy + i * band, fw, band + 0.5);
    });
  } else if (flag.stripe === "v") {
    const band = fw / colors.length;
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(fx + i * band, fy, band + 0.5, fh);
    });
  } else {
    ctx.fillStyle = colors[0];
    ctx.fillRect(fx, fy, fw, fh);
    if (colors[1]) {
      ctx.fillStyle = colors[1];
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + fw, fy);
      ctx.lineTo(fx, fy + fh);
      ctx.closePath();
      ctx.fill();
    }
    if (colors[2]) {
      ctx.fillStyle = colors[2];
      ctx.beginPath();
      ctx.moveTo(fx + fw, fy);
      ctx.lineTo(fx + fw, fy + fh);
      ctx.lineTo(fx, fy + fh);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Soft inset border so tiles read as distinct flags while spinning.
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(1, pad * 0.6);
  ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
}

function buildFlagAtlas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0b1b3a";
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  const cols = 16;
  const rows = 8;
  const tw = ATLAS_W / cols;
  const th = ATLAS_H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const flag = FLAGS[(r * cols + c) % FLAGS.length];
      paintFlag(ctx, c * tw, r * th, tw, th, flag);
    }
  }

  // Subtle vignette so poles don't look flat-white.
  const vig = ctx.createRadialGradient(ATLAS_W / 2, ATLAS_H / 2, ATLAS_H * 0.2, ATLAS_W / 2, ATLAS_H / 2, ATLAS_W * 0.7);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(5,12,28,0.28)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);
  return canvas;
}

function buildSphereMesh() {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= SEG_Y; y++) {
    const v = y / SEG_Y;
    const theta = v * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let x = 0; x <= SEG_X; x++) {
      const u = x / SEG_X;
      const phi = u * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const px = sinT * cosP;
      const py = cosT;
      const pz = sinT * sinP;
      positions.push(px, py, pz);
      normals.push(px, py, pz);
      uvs.push(1 - u, v);
    }
  }

  for (let y = 0; y < SEG_Y; y++) {
    for (let x = 0; x < SEG_X; x++) {
      const a = y * (SEG_X + 1) + x;
      const b = a + SEG_X + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}

/** Thin torus ring in the XZ plane (tilted later via model matrix). */
function buildRingMesh(tubeR = 0.018, majorR = 1.08, seg = 96, tubeSeg = 10) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= tubeSeg; j++) {
      const v = (j / tubeSeg) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const x = (majorR + tubeR * cv) * cu;
      const y = tubeR * sv;
      const z = (majorR + tubeR * cv) * su;
      positions.push(x, y, z);
      const nx = cv * cu;
      const ny = sv;
      const nz = cv * su;
      normals.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < tubeSeg; j++) {
      const a = i * (tubeSeg + 1) + j;
      const b = a + tubeSeg + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
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
  const zx = eye[0] - center[0];
  const zy = eye[1] - center[1];
  const zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  const z0 = zx / len, z1 = zy / len, z2 = zz / len;
  let xx = up[1] * z2 - up[2] * z1;
  let xy = up[2] * z0 - up[0] * z2;
  let xz = up[0] * z1 - up[1] * z0;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const y0 = z1 * xz - z2 * xy;
  const y1 = z2 * xx - z0 * xz;
  const y2 = z0 * xy - z1 * xx;
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
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  out[0] = c; out[2] = -s;
  out[8] = s; out[10] = c;
}

function rotateX(out: Float32Array, rad: number) {
  identity(out);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  out[5] = c; out[6] = s;
  out[9] = -s; out[10] = c;
}

function rotateZ(out: Float32Array, rad: number) {
  identity(out);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  out[0] = c; out[1] = s;
  out[4] = -s; out[5] = c;
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

function program(gl: WebGLRenderingContext, vs: string, fs: string) {
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
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNorm = mat3(uModel) * aNorm;
  vUv = aUv;
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

const GLOBE_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uLight;
varying vec3 vNorm;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNorm);
  float diff = max(dot(n, normalize(uLight)), 0.0);
  float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.15, 1.0)), 0.0), 2.2);
  vec4 tex = texture2D(uTex, vUv);
  vec3 col = tex.rgb * (0.42 + 0.58 * diff);
  col += vec3(0.35, 0.7, 1.0) * rim * 0.35;
  col += vec3(1.0, 0.55, 0.2) * rim * 0.12;
  // Soft limb darkening so the sphere reads as 3D.
  float limb = smoothstep(-0.2, 0.85, n.z);
  col *= 0.55 + 0.45 * limb;
  gl_FragColor = vec4(col, 1.0);
}
`;

const RING_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vNorm;
void main() {
  vNorm = mat3(uModel) * aNorm;
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

const RING_FS = `
precision mediump float;
uniform vec3 uColor;
varying vec3 vNorm;
void main() {
  vec3 n = normalize(vNorm);
  float fres = pow(1.0 - abs(n.z), 1.4);
  float core = 0.55 + 0.45 * fres;
  gl_FragColor = vec4(uColor * core, 0.92);
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

function createRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const globeProg = program(gl, GLOBE_VS, GLOBE_FS);
  const ringProg = program(gl, RING_VS, RING_FS);
  const sphere = uploadMesh(gl, buildSphereMesh());
  const ring = uploadMesh(gl, buildRingMesh(0.028, 1.14));
  const ringGlow = uploadMesh(gl, buildRingMesh(0.07, 1.14));

  const atlas = buildFlagAtlas();
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const model = new Float32Array(16);
  const mvp = new Float32Array(16);
  const tmp = new Float32Array(16);
  const tilt = new Float32Array(16);
  const spin = new Float32Array(16);
  const ringModel = new Float32Array(16);
  const rx = new Float32Array(16);
  const rz = new Float32Array(16);

  // Camera far enough that tilted rings (majorR ~1.12) stay fully in frame.
  lookAt(view, [0, 0.08, 3.15], [0, 0, 0], [0, 1, 0]);

  const aPosG = gl.getAttribLocation(globeProg, "aPos");
  const aNormG = gl.getAttribLocation(globeProg, "aNorm");
  const aUvG = gl.getAttribLocation(globeProg, "aUv");
  const uMVPG = gl.getUniformLocation(globeProg, "uMVP");
  const uModelG = gl.getUniformLocation(globeProg, "uModel");
  const uTex = gl.getUniformLocation(globeProg, "uTex");
  const uLight = gl.getUniformLocation(globeProg, "uLight");

  const aPosR = gl.getAttribLocation(ringProg, "aPos");
  const aNormR = gl.getAttribLocation(ringProg, "aNorm");
  const uMVPR = gl.getUniformLocation(ringProg, "uMVP");
  const uModelR = gl.getUniformLocation(ringProg, "uModel");
  const uColor = gl.getUniformLocation(ringProg, "uColor");

  function resize(cssW: number, cssH: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, w, h);
    perspective(proj, (42 * Math.PI) / 180, w / h, 0.1, 20);
  }

  function drawRing(mesh: MeshBuf, color: [number, number, number], modelMat: Float32Array) {
    gl!.useProgram(ringProg);
    mulMat4(view, modelMat, tmp);
    mulMat4(proj, tmp, mvp);
    gl!.uniformMatrix4fv(uMVPR, false, mvp);
    gl!.uniformMatrix4fv(uModelR, false, modelMat);
    gl!.uniform3fv(uColor, color);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, mesh.pos);
    gl!.enableVertexAttribArray(aPosR);
    gl!.vertexAttribPointer(aPosR, 3, gl!.FLOAT, false, 0, 0);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, mesh.norm);
    gl!.enableVertexAttribArray(aNormR);
    gl!.vertexAttribPointer(aNormR, 3, gl!.FLOAT, false, 0, 0);
    gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl!.drawElements(gl!.TRIANGLES, mesh.count, gl!.UNSIGNED_SHORT, 0);
  }

  function render(angleRad: number) {
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

    // Globe: slight axial tilt + continuous Y spin (vertical-axis revolution).
    rotateX(tilt, -0.22);
    rotateY(spin, angleRad);
    mulMat4(tilt, spin, model);
    mulMat4(view, model, tmp);
    mulMat4(proj, tmp, mvp);

    gl!.useProgram(globeProg);
    gl!.uniformMatrix4fv(uMVPG, false, mvp);
    gl!.uniformMatrix4fv(uModelG, false, model);
    gl!.uniform3f(uLight, 0.55, 0.75, 1.0);
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

    // Orbital rings stay tilted in world space while the globe spins under them.
    gl!.depthMask(false);
    gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE);

    rotateX(rx, 1.05);
    rotateZ(rz, 0.62);
    mulMat4(rx, rz, ringModel);
    drawRing(ringGlow, [0.2, 0.65, 1.0], ringModel);
    drawRing(ring, [0.35, 0.9, 1.0], ringModel);

    rotateX(rx, -1.12);
    rotateZ(rz, -0.4);
    mulMat4(rx, rz, ringModel);
    drawRing(ringGlow, [1.0, 0.45, 0.1], ringModel);
    drawRing(ring, [1.0, 0.62, 0.18], ringModel);

    gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
    gl!.depthMask(true);
  }

  function destroy() {
    gl.deleteTexture(tex);
    gl.deleteBuffer(sphere.pos);
    gl.deleteBuffer(sphere.norm);
    if (sphere.uv) gl.deleteBuffer(sphere.uv);
    gl.deleteBuffer(sphere.idx);
    gl.deleteBuffer(ring.pos);
    gl.deleteBuffer(ring.norm);
    gl.deleteBuffer(ring.idx);
    gl.deleteBuffer(ringGlow.pos);
    gl.deleteBuffer(ringGlow.norm);
    gl.deleteBuffer(ringGlow.idx);
    gl.deleteProgram(globeProg);
    gl.deleteProgram(ringProg);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }

  return { resize, render, destroy };
}

/** Canvas 2D equirectangular sphere fallback (still real 3D UV spin). */
function createCanvas2DFallback(canvas: HTMLCanvasElement) {
  const atlas = buildFlagAtlas();
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  function resize(cssW: number, cssH: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function render(angleRad: number) {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.38;
    ctx!.clearRect(0, 0, w, h);

    const glow = ctx!.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.55);
    glow.addColorStop(0, "rgba(56,189,248,0.35)");
    glow.addColorStop(0.55, "rgba(249,115,22,0.12)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx!.fillStyle = glow;
    ctx!.beginPath();
    ctx!.arc(cx, cy, R * 1.55, 0, Math.PI * 2);
    ctx!.fill();

    // Sphere via vertical atlas slices (true longitude spin around Y).
    ctx!.save();
    ctx!.beginPath();
    ctx!.arc(cx, cy, R, 0, Math.PI * 2);
    ctx!.clip();

    const slices = 64;
    for (let i = 0; i < slices; i++) {
      const t0 = (i / slices) * 2 - 1;
      const t1 = ((i + 1) / slices) * 2 - 1;
      const x0 = cx + t0 * R;
      const x1 = cx + t1 * R;
      const chord0 = Math.sqrt(Math.max(0, 1 - t0 * t0));
      const chord1 = Math.sqrt(Math.max(0, 1 - t1 * t1));
      const avgChord = (chord0 + chord1) / 2;
      const lon0 = Math.asin(Math.max(-1, Math.min(1, t0))) + angleRad;
      const lon1 = Math.asin(Math.max(-1, Math.min(1, t1))) + angleRad;
      let u0 = ((lon0 / (Math.PI * 2)) % 1 + 1) % 1;
      let u1 = ((lon1 / (Math.PI * 2)) % 1 + 1) % 1;
      if (u1 < u0) u1 += 1;
      const sx0 = u0 * ATLAS_W;
      const sx1 = u1 * ATLAS_W;
      const destW = Math.max(1, x1 - x0);
      const destH = R * 2 * avgChord;
      const destY = cy - destH / 2;
      try {
        ctx!.drawImage(atlas, sx0, 0, Math.max(1, sx1 - sx0), ATLAS_H, x0, destY, destW, destH);
      } catch {
        /* atlas wrap edge */
      }
    }

    const shade = ctx!.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R);
    shade.addColorStop(0, "rgba(255,255,255,0.18)");
    shade.addColorStop(0.55, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(5,15,40,0.45)");
    ctx!.fillStyle = shade;
    ctx!.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx!.restore();

    const drawEllipseRing = (rot: number, color: string, width: number) => {
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(rot);
      ctx!.scale(1, 0.42);
      ctx!.beginPath();
      ctx!.arc(0, 0, R * 1.18, 0, Math.PI * 2);
      ctx!.strokeStyle = color;
      ctx!.lineWidth = width;
      ctx!.shadowColor = color;
      ctx!.shadowBlur = 12;
      ctx!.stroke();
      ctx!.restore();
    };
    drawEllipseRing(0.55, "rgba(56,189,248,0.85)", Math.max(2, R * 0.045));
    drawEllipseRing(-0.85, "rgba(249,115,22,0.9)", Math.max(2, R * 0.045));
  }

  return { resize, render, destroy() { /* noop */ } };
}

export default function AuthGlobe({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let renderer: ReturnType<typeof createRenderer> | ReturnType<typeof createCanvas2DFallback> = null;
    try {
      renderer = createRenderer(canvas);
    } catch {
      renderer = null;
    }
    if (!renderer) renderer = createCanvas2DFallback(canvas);
    if (!renderer) return;

    let raf = 0;
    let start = performance.now();
    let reduced = prefersReducedMotion();
    let visible = typeof document === "undefined" ? true : document.visibilityState !== "hidden";

    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height, 1);
      renderer!.resize(size, size);
    };
    applySize();

    const ro = new ResizeObserver(() => {
      applySize();
      if (reduced) renderer!.render(0.35);
    });
    ro.observe(wrap);

    const onVis = () => {
      visible = document.visibilityState !== "hidden";
      if (visible && !reduced) {
        start = performance.now() - ((performance.now() - start) % REVOLUTION_MS);
        loop(performance.now());
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => {
      reduced = mq.matches;
      if (reduced) {
        cancelAnimationFrame(raf);
        renderer!.render(0.35);
      } else {
        start = performance.now();
        loop(performance.now());
      }
    };
    mq.addEventListener?.("change", onMq);

    const loop = (now: number) => {
      if (reduced || !visible) return;
      const angle = ((now - start) / REVOLUTION_MS) * Math.PI * 2;
      renderer!.render(angle);
      raf = requestAnimationFrame(loop);
    };

    if (reduced) {
      renderer.render(0.35);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      mq.removeEventListener?.("change", onMq);
      renderer!.destroy();
    };
  }, []);

  return (
    <div ref={wrapRef} className={cn("auth-globe-canvas relative", className)} aria-hidden>
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
