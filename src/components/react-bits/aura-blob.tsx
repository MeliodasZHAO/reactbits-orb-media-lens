"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface AuraBlobProps {
  /** How fast the shells tumble */
  speed?: number;
  /** Number of nested shells accumulated along each ray */
  layers?: number;
  /** Rotation offset applied between consecutive shells, in radians */
  stagger?: number;
  /** Radius of the shell the aura wraps around */
  radius?: number;
  /** Thickness response of the shell, lower spreads the glow wider */
  density?: number;
  /** Smallest distance the accumulator will divide by */
  softness?: number;
  /** Strength of the ridged distortion breaking up the shells */
  warp?: number;
  /** Spatial frequency of the distortion */
  warpScale?: number;
  /** Overall brightness before tone mapping */
  gain?: number;
  /** Tone mapping headroom, higher keeps more of the falloff */
  exposure?: number;
  /** Tone response curve, above 1 deepens the shadows */
  contrast?: number;
  /** Distance of the eye from the shell */
  cameraDistance?: number;
  /** Focal length of the virtual lens */
  focal?: number;
  /** First palette colour */
  color?: string;
  /** Second palette colour */
  midColor?: string;
  /** Third palette colour */
  deepColor?: string;
  /** How fast the palette cycles through the shells */
  hueDrift?: number;
  /** Depth of the slow brightness breath, 0 disables it */
  pulse?: number;
  /** Speed of the brightness breath */
  pulseRate?: number;
  /** Film grain strength, 0 to 1 */
  grain?: number;
  /** Grain cell size in CSS pixels */
  grainSize?: number;
  /** Grain refreshes per second */
  grainRate?: number;
  /** Panel backdrop, or "transparent" to show the page through */
  backgroundColor?: string;
  /** Master alpha */
  opacity?: number;
  /** Let the pointer swing the shells around */
  cursorInteraction?: boolean;
  /** How far the pointer tilts the view, 0 to 1 */
  cursorTilt?: number;
  /** Freeze the animation */
  paused?: boolean;
  /** Scale back resolution when the frame budget slips */
  adaptiveQuality?: boolean;
  /** Frame rate the quality meter aims to hold */
  targetFps?: number;
  /** Upper device pixel ratio bound */
  dpr?: number;
  className?: string;
  children?: ReactNode;
}

const auraVertex = `
varying vec2 vPlane;

void main() {
  vPlane = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

const buildAuraFragment = (shells: number) => `
precision highp float;

varying vec2 vPlane;

uniform vec2 uCanvas;
uniform float uClock;
uniform float uSpin;
uniform float uStagger;
uniform float uRadius;
uniform float uDensity;
uniform float uSoftness;
uniform float uWarp;
uniform float uWarpScale;
uniform float uGain;
uniform float uExposure;
uniform float uContrast;
uniform float uReach;
uniform float uLens;
uniform float uHueDrift;
uniform float uPulse;
uniform float uPulseRate;
uniform float uGrain;
uniform float uGrainSize;
uniform float uGrainRate;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform vec3 uTintC;
uniform vec3 uBackdrop;
uniform float uBackdropAlpha;
uniform float uOpacity;
uniform vec2 uTilt;

float scatter(vec3 seed) {
  vec3 wobble = fract(seed * vec3(0.1031, 0.1030, 0.0973));
  wobble += dot(wobble, wobble.yxz + 33.33);
  return fract((wobble.x + wobble.y) * wobble.z);
}

float silver(vec2 cell, float tick) {
  float a = scatter(vec3(cell, tick));
  float b = scatter(vec3(cell.yx + 41.7, tick + 19.3));
  return a + b - 1.0;
}

vec3 swivel(vec3 p, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}

vec3 precess(float angle) {
  return normalize(vec3(
    sin(angle * 0.41) * 0.9,
    0.85 + 0.3 * cos(angle * 0.29),
    cos(angle * 0.57) * 0.9
  ));
}

vec3 softClip(vec3 x) {
  vec3 fall = exp(-2.0 * max(x, 0.0));
  return (1.0 - fall) / (1.0 + fall);
}

float ridges(vec3 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int k = 0; k < 3; k++) {
    vec3 folded = cos(p);
    sum += weight * abs(folded.x + folded.y + folded.z) * 0.3333;
    p = p * 1.87 + vec3(1.7, -2.3, 0.9);
    weight *= 0.55;
  }
  return sum;
}

vec3 palette(float phase) {
  vec3 lobes = 0.52 + 0.78 * sin(phase + vec3(0.0, 2.0944, 4.1888));
  lobes = max(lobes, vec3(0.0));
  return uTintA * lobes.x + uTintB * lobes.y + uTintC * lobes.z;
}

void main() {
  vec2 pixel = vPlane * uCanvas;
  vec2 field = (pixel - 0.5 * uCanvas) / max(uCanvas.y, 1.0);

  vec3 eye = vec3(0.0, 0.0, -uReach);
  vec3 ray = normalize(vec3(field + uTilt * 0.35, uLens));
  ray = swivel(ray, vec3(0.0, 1.0, 0.0), uTilt.x * 0.9);

  float travel = 0.1;
  vec3 glow = vec3(0.0);

  for (int i = 0; i < ${shells}; i++) {
    vec3 probe = eye + ray * travel;
    float turn = uClock * uSpin + float(i) * uStagger;
    vec3 spun = swivel(probe, precess(turn), turn);

    float hull = abs(length(spun) - uRadius) * uDensity + uSoftness;
    hull += ridges(spun * uWarpScale) * uWarp;

    float phase = dot(spun, vec3(0.58)) + uClock * uHueDrift;
    glow += palette(phase) / hull;

    travel += hull;
    if (travel > 60.0) break;
  }

  float breath = 1.0 + uPulse * sin(uClock * uPulseRate);
  vec3 raw = glow * (uGain * breath) / max(uExposure, 1.0);
  vec3 col = softClip(raw);
  col = pow(clamp(col, 0.0, 1.0), vec3(max(uContrast, 0.05)));

  float cover = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);

  vec2 cell = floor(pixel / max(uGrainSize, 1.0));
  float tick = floor(uClock * max(uGrainRate, 1.0));
  float speck = silver(cell, tick) + silver(cell * 0.5 + 7.0, tick) * 0.5;
  float response = cover * (1.0 - cover) * 4.0;
  float lift = 1.0 + speck * uGrain * response * 1.6;
  col = clamp(col * lift, 0.0, 1.0);
  cover = clamp(cover * lift, 0.0, 1.0);

  float rest = uBackdropAlpha * (1.0 - cover);
  gl_FragColor = vec4(col + uBackdrop * rest, cover + rest) * uOpacity;
}
`;

const literal = (hex: string, fallback: string) => {
  const shade = new THREE.Color();
  try {
    shade.setStyle(hex, THREE.LinearSRGBColorSpace);
  } catch {
    shade.setStyle(fallback, THREE.LinearSRGBColorSpace);
  }
  return shade;
};

const repaint = (target: THREE.Color, hex: string) => {
  try {
    target.setStyle(hex, THREE.LinearSRGBColorSpace);
  } catch {
    return;
  }
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const subscribeToScreen = (notify: () => void) => {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(min-resolution: 2dppx)");
  media.addEventListener("change", notify);
  window.addEventListener("resize", notify);
  return () => {
    media.removeEventListener("change", notify);
    window.removeEventListener("resize", notify);
  };
};

const readScreenDpr = () =>
  typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

const isClear = (paint: string) =>
  paint === "transparent" || paint === "none" || paint === "";

interface PointerState {
  x: number;
  y: number;
}

interface AuraFieldProps {
  speed: number;
  layers: number;
  stagger: number;
  radius: number;
  density: number;
  softness: number;
  warp: number;
  warpScale: number;
  gain: number;
  exposure: number;
  contrast: number;
  cameraDistance: number;
  focal: number;
  color: string;
  midColor: string;
  deepColor: string;
  hueDrift: number;
  pulse: number;
  pulseRate: number;
  grain: number;
  grainSize: number;
  grainRate: number;
  backgroundColor: string;
  opacity: number;
  cursorInteraction: boolean;
  cursorTilt: number;
  paused: boolean;
  adaptiveQuality: boolean;
  targetFps: number;
  ceiling: number;
  readPointer: () => PointerState;
}

const AuraField = ({
  speed,
  layers,
  stagger,
  radius,
  density,
  softness,
  warp,
  warpScale,
  gain,
  exposure,
  contrast,
  cameraDistance,
  focal,
  color,
  midColor,
  deepColor,
  hueDrift,
  pulse,
  pulseRate,
  grain,
  grainSize,
  grainRate,
  backgroundColor,
  opacity,
  cursorInteraction,
  cursorTilt,
  paused,
  adaptiveQuality,
  targetFps,
  ceiling,
  readPointer,
}: AuraFieldProps) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const clock = useRef(0);
  const glide = useRef({ x: 0.5, y: 0.5 });
  const budget = useRef({ frames: 0, span: 0, wins: 0, cap: 4 });
  const { gl, size } = useThree();

  const shells = Math.round(clamp(layers, 2, 24));

  const fragment = useMemo(() => buildAuraFragment(shells), [shells]);

  const uniforms = useMemo(
    () => ({
      uCanvas: { value: new THREE.Vector2(1, 1) },
      uClock: { value: 0 },
      uSpin: { value: 1 },
      uStagger: { value: 2.3 },
      uRadius: { value: 4 },
      uDensity: { value: 0.9 },
      uSoftness: { value: 0.01 },
      uWarp: { value: 0.2 },
      uWarpScale: { value: 1.8 },
      uGain: { value: 2.3 },
      uExposure: { value: 130 },
      uContrast: { value: 1 },
      uReach: { value: 13 },
      uLens: { value: 1 },
      uHueDrift: { value: 1 },
      uPulse: { value: 0.12 },
      uPulseRate: { value: 0.5 },
      uGrain: { value: 0.05 },
      uGrainSize: { value: 1 },
      uGrainRate: { value: 24 },
      uTintA: { value: literal("#f472b6", "#f472b6") },
      uTintB: { value: literal("#a855f7", "#a855f7") },
      uTintC: { value: literal("#4338ca", "#4338ca") },
      uBackdrop: { value: literal("#0a0a0a", "#0a0a0a") },
      uBackdropAlpha: { value: 1 },
      uOpacity: { value: 1 },
      uTilt: { value: new THREE.Vector2(0, 0) },
    }),
    [],
  );

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.fragmentShader = fragment;
    material.needsUpdate = true;
  }, [fragment]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    repaint(material.uniforms.uTintA.value, color);
    repaint(material.uniforms.uTintB.value, midColor);
    repaint(material.uniforms.uTintC.value, deepColor);
    const clear = isClear(backgroundColor);
    material.uniforms.uBackdropAlpha.value = clear ? 0 : 1;
    if (!clear) repaint(material.uniforms.uBackdrop.value, backgroundColor);
  }, [color, midColor, deepColor, backgroundColor]);

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;

    const beat = Math.min(delta, 0.05);
    if (!paused) clock.current += beat;

    const ratio = gl.getPixelRatio();
    const set = material.uniforms;
    set.uCanvas.value.set(size.width * ratio, size.height * ratio);
    set.uClock.value = clock.current;
    set.uSpin.value = speed;
    set.uStagger.value = stagger;
    set.uRadius.value = radius;
    set.uDensity.value = density;
    set.uSoftness.value = Math.max(softness, 0.002);
    set.uWarp.value = warp;
    set.uWarpScale.value = warpScale;
    set.uGain.value = gain;
    set.uExposure.value = exposure;
    set.uContrast.value = contrast;
    set.uReach.value = cameraDistance;
    set.uLens.value = focal;
    set.uHueDrift.value = hueDrift;
    set.uPulse.value = pulse;
    set.uPulseRate.value = pulseRate;
    set.uGrain.value = grain;
    set.uGrainSize.value = Math.max(grainSize, 1) * ratio;
    set.uGrainRate.value = grainRate;
    set.uOpacity.value = opacity;

    if (cursorInteraction) {
      const pointer = readPointer();
      const ease = 1 - Math.exp(-beat * 4);
      glide.current.x += (pointer.x - glide.current.x) * ease;
      glide.current.y += (pointer.y - glide.current.y) * ease;
      set.uTilt.value.set(
        (glide.current.x - 0.5) * cursorTilt,
        (glide.current.y - 0.5) * cursorTilt,
      );
    } else {
      set.uTilt.value.set(0, 0);
    }

    if (!adaptiveQuality) return;
    const meter = budget.current;
    meter.frames += 1;
    meter.span += delta;
    if (meter.span < 0.75) return;
    const fps = meter.frames / meter.span;
    meter.frames = 0;
    meter.span = 0;
    const roof = Math.min(ceiling, meter.cap);
    if (fps < targetFps * 0.85 && ratio > 0.6) {
      meter.wins = 0;
      meter.cap = Math.max(0.6, ratio * 0.9);
      gl.setPixelRatio(Math.max(0.6, ratio * 0.75));
    } else if (fps > targetFps * 0.98 && ratio < roof - 0.01) {
      meter.wins += 1;
      if (meter.wins >= 3) {
        meter.wins = 0;
        gl.setPixelRatio(Math.min(roof, ratio * 1.25));
      }
    } else {
      meter.wins = 0;
    }
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={auraVertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
        premultipliedAlpha
      />
    </mesh>
  );
};

export const AuraBlob = ({
  speed = 0.5,
  layers = 10,
  stagger = 2.3,
  radius = 4,
  density = 0.9,
  softness = 0.01,
  warp = 0.25,
  warpScale = 1.8,
  gain = 2.6,
  exposure = 130,
  contrast = 1,
  cameraDistance = 13,
  focal = 1,
  color = "#f472b6",
  midColor = "#a855f7",
  deepColor = "#4338ca",
  hueDrift = 1,
  pulse = 0.12,
  pulseRate = 0.5,
  grain = 0.05,
  grainSize = 1,
  grainRate = 24,
  backgroundColor = "#0a0a0a",
  opacity = 1,
  cursorInteraction = true,
  cursorTilt = 0.6,
  paused = false,
  adaptiveQuality = true,
  targetFps = 60,
  dpr = 1.75,
  className,
  children,
}: AuraBlobProps) => {
  const shell = useRef<HTMLDivElement>(null);
  const pointer = useRef<PointerState>({ x: 0.5, y: 0.5 });
  const [awake, setAwake] = useState(true);

  const screenDpr = useSyncExternalStore(
    subscribeToScreen,
    readScreenDpr,
    () => 1,
  );
  const ceiling = Math.min(screenDpr, Math.max(dpr, 0.5));

  const readPointer = useCallback(() => pointer.current, []);

  useEffect(() => {
    const node = shell.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver(
      ([entry]) => setAwake(entry.isIntersecting),
      { threshold: 0 },
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  useEffect(() => {
    const node = shell.current;
    if (!node || !cursorInteraction) return;

    const track = (event: PointerEvent) => {
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return;
      pointer.current.x = clamp((event.clientX - box.left) / box.width, 0, 1);
      pointer.current.y = clamp(
        1 - (event.clientY - box.top) / box.height,
        0,
        1,
      );
    };

    const reset = () => {
      pointer.current.x = 0.5;
      pointer.current.y = 0.5;
    };

    node.addEventListener("pointermove", track);
    node.addEventListener("pointerleave", reset);
    return () => {
      node.removeEventListener("pointermove", track);
      node.removeEventListener("pointerleave", reset);
    };
  }, [cursorInteraction]);

  return (
    <div ref={shell} className={cn("relative overflow-hidden", className)}>
      <div className="absolute inset-0">
        <Canvas
          orthographic
          dpr={ceiling}
          frameloop={awake ? "always" : "demand"}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: "high-performance",
          }}
        >
          <AuraField
            speed={speed}
            layers={layers}
            stagger={stagger}
            radius={radius}
            density={density}
            softness={softness}
            warp={warp}
            warpScale={warpScale}
            gain={gain}
            exposure={exposure}
            contrast={contrast}
            cameraDistance={cameraDistance}
            focal={focal}
            color={color}
            midColor={midColor}
            deepColor={deepColor}
            hueDrift={hueDrift}
            pulse={pulse}
            pulseRate={pulseRate}
            grain={grain}
            grainSize={grainSize}
            grainRate={grainRate}
            backgroundColor={backgroundColor}
            opacity={opacity}
            cursorInteraction={cursorInteraction}
            cursorTilt={cursorTilt}
            paused={paused}
            adaptiveQuality={adaptiveQuality}
            targetFps={targetFps}
            ceiling={ceiling}
            readPointer={readPointer}
          />
        </Canvas>
      </div>
      {children ? (
        <div className="relative z-10 h-full w-full">{children}</div>
      ) : null}
    </div>
  );
};

export default AuraBlob;
