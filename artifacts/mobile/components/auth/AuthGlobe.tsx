/**
 * Native auth brand globe — adaptive GPU / lightweight rendering.
 *
 * High/mid/low: expo-gl sphere textured with the website flag atlas.
 * Lite / GL failure / sustained jank: AuthGlobeLite (native-driver Animated).
 *
 * Performance:
 * - Async atlas load via shared cache (does not block Login form)
 * - Device-tier mesh/DPR/FPS caps
 * - Runtime FPS monitor auto-downgrades quality
 * - Pauses when inactive / backgrounded / reduce-motion
 * - Explicit GL resource teardown to avoid leaks
 */
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  type AppStateStatus,
  InteractionManager,
  PixelRatio,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import {
  detectPerfTierAsync,
  detectPerfTierSync,
  downgradeTier,
  qualityForTier,
  type GlobeQuality,
  type PerfTier,
} from "../../lib/devicePerf";
import { getFlagAtlasAsset } from "../../lib/globeAssetCache";
import AuthGlobeLite from "./AuthGlobeLite";

const REVOLUTION_MS = 12_000;
/** Downgrade after this many consecutive slow frames (faster on low-end Android). */
const JANK_STREAK = 12;
/** Frame considered slow if it exceeds target interval by this factor. */
const JANK_FACTOR = 1.65;

type Mesh = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
};

type Renderer = {
  resize: (cssW: number, cssH: number, maxDpr: number) => void;
  render: (angleRad: number) => void;
  destroy: () => void;
};

function buildSphereMesh(segX: number, segY: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const push = (px: number, py: number, pz: number, u: number, v: number) => {
    positions.push(px, py, pz);
    normals.push(px, py, pz);
    uvs.push(u, v);
  };

  const northIdx = 0;
  push(0, 1, 0, 0.5, 0.04);

  const ringStart: number[] = [];
  for (let y = 1; y < segY; y++) {
    ringStart.push(positions.length / 3);
    const v = y / segY;
    const theta = v * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const vv = 0.04 + v * 0.92;
    for (let x = 0; x <= segX; x++) {
      const u = x / segX;
      const phi = u * Math.PI * 2;
      push(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi), 1 - u, vv);
    }
  }

  const southIdx = positions.length / 3;
  push(0, -1, 0, 0.5, 0.96);

  {
    const rs = ringStart[0];
    for (let x = 0; x < segX; x++) {
      indices.push(northIdx, rs + x, rs + x + 1);
    }
  }

  for (let r = 0; r < ringStart.length - 1; r++) {
    const a0 = ringStart[r];
    const b0 = ringStart[r + 1];
    for (let x = 0; x < segX; x++) {
      const a = a0 + x;
      const b = b0 + x;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  {
    const rs = ringStart[ringStart.length - 1];
    for (let x = 0; x < segX; x++) {
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
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  const z0 = zx / len;
  const z1 = zy / len;
  const z2 = zz / len;
  let xx = up[1] * z2 - up[2] * z1;
  let xy = up[2] * z0 - up[0] * z2;
  let xz = up[0] * z1 - up[1] * z0;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len;
  xy /= len;
  xz /= len;
  const y0 = z1 * xz - z2 * xy;
  const y1 = z2 * xx - z0 * xz;
  const y2 = z0 * xy - z1 * xx;
  out[0] = xx;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = xy;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = xz;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
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
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
}

function rotateX(out: Float32Array, rad: number) {
  identity(out);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
}

function compile(gl: ExpoWebGLRenderingContext, type: number, src: string) {
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

function linkProgram(gl: ExpoWebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  const vert = compile(gl, gl.VERTEX_SHADER, vs);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, vert);
  gl.attachShader(p, frag);
  gl.linkProgram(p);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
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

const GLOBE_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uLight;
varying vec3 vNorm;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vNorm);
  float diff = max(dot(n, normalize(uLight)), 0.0);
  float wrap = diff * 0.55 + 0.45;
  vec3 tex = texture2D(uTex, vUv).rgb;
  vec3 col = tex * wrap;
  gl_FragColor = vec4(col, 1.0);
}
`;

async function createRenderer(
  gl: ExpoWebGLRenderingContext,
  quality: GlobeQuality,
): Promise<Renderer> {
  const mesh = buildSphereMesh(quality.segX, quality.segY);
  const asset = await getFlagAtlasAsset();

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset as any);
  if (gl.getError() !== gl.NO_ERROR) {
    throw new Error("flag atlas texture upload failed");
  }

  const globeProg = linkProgram(gl, GLOBE_VS, GLOBE_FS);

  const pos = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, pos);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);

  const norm = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, norm);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);

  const uv = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, uv);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);

  const idx = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const model = new Float32Array(16);
  const mvp = new Float32Array(16);
  const tmp = new Float32Array(16);
  const tilt = new Float32Array(16);
  const spin = new Float32Array(16);

  lookAt(view, [0, 0.02, 2.85], [0, 0, 0], [0, 1, 0]);

  const aPosG = gl.getAttribLocation(globeProg, "aPos");
  const aNormG = gl.getAttribLocation(globeProg, "aNorm");
  const aUvG = gl.getAttribLocation(globeProg, "aUv");
  const uMVPG = gl.getUniformLocation(globeProg, "uMVP");
  const uModelG = gl.getUniformLocation(globeProg, "uModel");
  const uTex = gl.getUniformLocation(globeProg, "uTex");
  const uLight = gl.getUniformLocation(globeProg, "uLight");

  function resize(cssW: number, cssH: number, maxDpr: number) {
    const dpr = Math.min(PixelRatio.get(), maxDpr);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    gl.viewport(0, 0, gl.drawingBufferWidth || w, gl.drawingBufferHeight || h);
    const aspect =
      (gl.drawingBufferWidth || w) / Math.max(1, gl.drawingBufferHeight || h);
    perspective(proj, (38 * Math.PI) / 180, aspect, 0.1, 20);
  }

  function render(angleRad: number) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    rotateX(tilt, -0.18);
    rotateY(spin, angleRad);
    mulMat4(tilt, spin, model);
    mulMat4(view, model, tmp);
    mulMat4(proj, tmp, mvp);

    gl.useProgram(globeProg);
    gl.uniformMatrix4fv(uMVPG, false, mvp);
    gl.uniformMatrix4fv(uModelG, false, model);
    gl.uniform3f(uLight, 0.35, 0.55, 1.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uTex, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(aPosG);
    gl.vertexAttribPointer(aPosG, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, norm);
    gl.enableVertexAttribArray(aNormG);
    gl.vertexAttribPointer(aNormG, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, uv);
    gl.enableVertexAttribArray(aUvG);
    gl.vertexAttribPointer(aUvG, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.endFrameEXP();
  }

  function destroy() {
    try {
      gl.deleteTexture(tex);
      gl.deleteBuffer(pos);
      gl.deleteBuffer(norm);
      gl.deleteBuffer(uv);
      gl.deleteBuffer(idx);
      gl.deleteProgram(globeProg);
    } catch {
      /* already lost context */
    }
  }

  return { resize, render, destroy };
}

type AuthGlobeProps = {
  size?: number;
  style?: ViewStyle;
  /** When false, pause continuous rotation (keeps last frame). */
  active?: boolean;
  /** Defer mounting GL until after interactions (default true). */
  deferMount?: boolean;
};

export default function AuthGlobe({
  size = 128,
  style,
  active = true,
  deferMount = true,
}: AuthGlobeProps) {
  const [ready, setReady] = useState(!deferMount);
  const [tier, setTier] = useState<PerfTier>(() => detectPerfTierSync());
  const [forceLite, setForceLite] = useState(false);

  const quality = qualityForTier(tier);
  const useLite = forceLite || !quality.useGl;

  // Prefetch atlas + refine tier while the form is already interactive.
  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void getFlagAtlasAsset().catch(() => {});
      void detectPerfTierAsync().then((t) => {
        if (!cancelled) setTier(t);
      });
      if (deferMount) {
        // Small yield so first paint of inputs is never blocked by GLView.
        setTimeout(() => {
          if (!cancelled) setReady(true);
        }, 48);
      }
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, [deferMount]);

  if (!ready) {
    return (
      <View
        style={[
          styles.wrap,
          styles.placeholder,
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
        pointerEvents="none"
      />
    );
  }

  if (useLite) {
    return <AuthGlobeLite size={size} style={style} active={active} />;
  }

  return (
    <AuthGlobeGl
      key={tier}
      size={size}
      style={style}
      active={active}
      quality={quality}
      onNeedDowngrade={() => {
        const next = downgradeTier(tier);
        if (next === "lite" || next === tier) {
          setForceLite(true);
        } else {
          setTier(next);
        }
      }}
      onGlFailed={() => setForceLite(true)}
    />
  );
}

type GlProps = AuthGlobeProps & {
  quality: GlobeQuality;
  onNeedDowngrade: () => void;
  onGlFailed: () => void;
};

function AuthGlobeGl({
  size = 128,
  style,
  active = true,
  quality,
  onNeedDowngrade,
  onGlFailed,
}: GlProps) {
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef(0);
  const startRef = useRef(Date.now());
  const lastFrameRef = useRef(0);
  const jankRef = useRef(0);
  const sizeRef = useRef(size);
  const qualityRef = useRef(quality);
  const reducedRef = useRef(false);
  const appActiveRef = useRef(true);
  const screenActiveRef = useRef(active);
  const cancelledRef = useRef(false);
  const downgradeRef = useRef(onNeedDowngrade);
  const failedRef = useRef(onGlFailed);

  sizeRef.current = size;
  qualityRef.current = quality;
  screenActiveRef.current = active;
  downgradeRef.current = onNeedDowngrade;
  failedRef.current = onGlFailed;

  const shouldAnimate = useCallback(
    () =>
      !cancelledRef.current &&
      !!rendererRef.current &&
      !reducedRef.current &&
      appActiveRef.current &&
      screenActiveRef.current,
    [],
  );

  const kick = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (reducedRef.current || !screenActiveRef.current || !appActiveRef.current) {
      renderer.render(0.4);
      return;
    }

    lastFrameRef.current = 0;
    jankRef.current = 0;

    const loop = (now: number) => {
      if (!shouldAnimate() || !rendererRef.current) return;

      const q = qualityRef.current;
      const last = lastFrameRef.current;
      if (last > 0) {
        const dt = now - last;
        if (dt > q.frameIntervalMs * JANK_FACTOR) {
          jankRef.current += 1;
          if (jankRef.current >= JANK_STREAK) {
            jankRef.current = 0;
            downgradeRef.current();
            return;
          }
        } else if (dt <= q.frameIntervalMs * 1.15) {
          jankRef.current = Math.max(0, jankRef.current - 1);
        }

        // Frame pacing — skip draw if we're ahead of the tier target.
        if (dt < q.frameIntervalMs * 0.85) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
      }
      lastFrameRef.current = now;

      const angle = ((now - startRef.current) / REVOLUTION_MS) * Math.PI * 2;
      rendererRef.current.render(angle);
      rafRef.current = requestAnimationFrame(loop);
    };

    startRef.current = Date.now() - ((Date.now() - startRef.current) % REVOLUTION_MS);
    rafRef.current = requestAnimationFrame(loop);
  }, [shouldAnimate]);

  useEffect(() => {
    cancelledRef.current = false;
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (!mounted) return;
        reducedRef.current = !!v;
        kick();
      })
      .catch(() => {});

    const reduceSub = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (v: boolean) => {
        reducedRef.current = !!v;
        kick();
      },
    );

    const onAppState = (state: AppStateStatus) => {
      appActiveRef.current = state === "active";
      kick();
    };
    const appSub = AppState.addEventListener("change", onAppState);

    return () => {
      mounted = false;
      cancelledRef.current = true;
      cancelAnimationFrame(rafRef.current);
      reduceSub?.remove?.();
      appSub.remove();
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [kick]);

  useEffect(() => {
    kick();
  }, [active, kick]);

  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      try {
        const renderer = await createRenderer(gl, qualityRef.current);
        if (cancelledRef.current) {
          renderer.destroy();
          return;
        }
        rendererRef.current = renderer;
        renderer.resize(sizeRef.current, sizeRef.current, qualityRef.current.maxDpr);
        kick();
      } catch (error) {
        console.warn("[AuthGlobe] WebGL init failed — using lite fallback", error);
        failedRef.current();
      }
    },
    [kick],
  );

  return (
    <View
      style={[styles.wrap, { width: size, height: size }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <GLView
        style={styles.canvas}
        onContextCreate={onContextCreate}
        msaaSamples={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "transparent",
    overflow: "visible",
  },
  placeholder: {
    backgroundColor: "rgba(26, 51, 88, 0.55)",
  },
  canvas: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
});
