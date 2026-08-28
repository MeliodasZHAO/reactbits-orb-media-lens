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

export interface MinimalRippleProps {
  /** How fast the rings travel outward */
  speed?: number;
  /** Number of rings packed into the field */
  frequency?: number;
  /** Brightness of each ring core */
  thickness?: number;
  /** Softness of the ring falloff, small values give a sharper line */
  softness?: number;
  /** Radius at which the rings fade out */
  radius?: number;
  /** Inner edge of the fade as a fraction of radius */
  fade?: number;
  /** Exponential dimming with distance from the origin */
  decay?: number;
  /** Overall brightness */
  gain?: number;
  /** Tone response curve, above 1 deepens the gaps */
  contrast?: number;
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
  /** Colour of the dim part of a ring */
  color?: string;
  /** Colour reached at the ring core */
  hotColor?: string;
  /** Panel backdrop, or "transparent" to show the page through */
  backgroundColor?: string;
  /** Master alpha */
  opacity?: number;
  /** Let the rings radiate from the pointer */
  cursorInteraction?: boolean;
  /** How far the origin follows the pointer, 0 to 1 */
  cursorFollow?: number;
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

const rippleVertex = `
varying vec2 vPlane;

void main() {
  vPlane = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

const rippleFragment = `
precision highp float;

varying vec2 vPlane;

uniform vec2 uCanvas;
uniform float uClock;
uniform float uSpeed;
uniform float uFreq;
uniform float uThickness;
uniform float uSoftness;
uniform float uRadius;
uniform float uFade;
uniform float uDecay;
uniform float uGain;
uniform float uContrast;
uniform float uPulse;
uniform float uPulseRate;
uniform float uGrain;
uniform float uGrainSize;
uniform float uGrainRate;
uniform vec3 uInk;
uniform vec3 uHot;
uniform vec3 uBackdrop;
uniform float uBackdropAlpha;
uniform float uOpacity;
uniform vec2 uFocus;

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

void main() {
  vec2 pixel = vPlane * uCanvas;
  vec2 field = (pixel - 0.5 * uCanvas) / max(uCanvas.y, 1.0);
  field -= uFocus;

  float span = length(field);
  float wave = sin(span * uFreq - uClock * uSpeed);
  float core = uThickness / (abs(wave) + max(uSoftness, 0.001));

  float reach = max(uRadius, 0.01);
  float mask = smoothstep(reach, reach * clamp(uFade, 0.0, 0.95), span);

  float breath = 1.0 + uPulse * sin(uClock * uPulseRate);
  float level = core * mask * exp(-span * uDecay) * uGain * breath;
  float cover = pow(clamp(level, 0.0, 1.0), max(uContrast, 0.05));

  vec2 cell = floor(pixel / max(uGrainSize, 1.0));
  float tick = floor(uClock * max(uGrainRate, 1.0));
  float speck = silver(cell, tick) + silver(cell * 0.5 + 7.0, tick) * 0.5;
  float response = cover * (1.0 - cover) * 4.0;
  cover = clamp(cover * (1.0 + speck * uGrain * response * 1.6), 0.0, 1.0);

  vec3 tint = mix(uInk, uHot, smoothstep(0.1, 0.85, cover));
  float rest = uBackdropAlpha * (1.0 - cover);

  gl_FragColor = vec4(tint * cover + uBackdrop * rest, cover + rest) * uOpacity;
}
`;

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

interface RippleFieldProps {
  speed: number;
  frequency: number;
  thickness: number;
  softness: number;
  radius: number;
  fade: number;
  decay: number;
  gain: number;
  contrast: number;
  pulse: number;
  pulseRate: number;
  grain: number;
  grainSize: number;
  grainRate: number;
  color: string;
  hotColor: string;
  backgroundColor: string;
  opacity: number;
  cursorInteraction: boolean;
  cursorFollow: number;
  paused: boolean;
  adaptiveQuality: boolean;
  targetFps: number;
  readPointer: () => PointerState;
}

const RippleField = ({
  speed,
  frequency,
  thickness,
  softness,
  radius,
  fade,
  decay,
  gain,
  contrast,
  pulse,
  pulseRate,
  grain,
  grainSize,
  grainRate,
  color,
  hotColor,
  backgroundColor,
  opacity,
  cursorInteraction,
  cursorFollow,
  paused,
  adaptiveQuality,
  targetFps,
  readPointer,
}: RippleFieldProps) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const clock = useRef(0);
  const glide = useRef({ x: 0.5, y: 0.5 });
  const budget = useRef({ frames: 0, span: 0, wins: 0 });
  const { gl, size } = useThree();

  const uniforms = useMemo(
    () => ({
      uCanvas: { value: new THREE.Vector2(1, 1) },
      uClock: { value: 0 },
      uSpeed: { value: 4 },
      uFreq: { value: 26 },
      uThickness: { value: 0.07 },
      uSoftness: { value: 0.02 },
      uRadius: { value: 0.95 },
      uFade: { value: 0.05 },
      uDecay: { value: 0.8 },
      uGain: { value: 1.3 },
      uContrast: { value: 1 },
      uPulse: { value: 0.15 },
      uPulseRate: { value: 0.6 },
      uGrain: { value: 0.05 },
      uGrainSize: { value: 1 },
      uGrainRate: { value: 24 },
      uInk: { value: new THREE.Color("#0e7490") },
      uHot: { value: new THREE.Color("#a5f3fc") },
      uBackdrop: { value: new THREE.Color("#0a0a0a") },
      uBackdropAlpha: { value: 1 },
      uOpacity: { value: 1 },
      uFocus: { value: new THREE.Vector2(0, 0) },
    }),
    [],
  );

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uInk.value.set(color);
    material.uniforms.uHot.value.set(hotColor);
    const clear = isClear(backgroundColor);
    material.uniforms.uBackdropAlpha.value = clear ? 0 : 1;
    if (!clear) material.uniforms.uBackdrop.value.set(backgroundColor);
  }, [color, hotColor, backgroundColor]);

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;

    const beat = Math.min(delta, 0.05);
    if (!paused) clock.current += beat;

    const ratio = gl.getPixelRatio();
    const set = material.uniforms;
    set.uCanvas.value.set(size.width * ratio, size.height * ratio);
    set.uClock.value = clock.current;
    set.uSpeed.value = speed;
    set.uFreq.value = frequency;
    set.uThickness.value = thickness;
    set.uSoftness.value = softness;
    set.uRadius.value = radius;
    set.uFade.value = fade;
    set.uDecay.value = decay;
    set.uGain.value = gain;
    set.uContrast.value = contrast;
    set.uPulse.value = pulse;
    set.uPulseRate.value = pulseRate;
    set.uGrain.value = grain;
    set.uGrainSize.value = Math.max(grainSize, 1) * ratio;
    set.uGrainRate.value = grainRate;
    set.uOpacity.value = opacity;

    if (cursorInteraction) {
      const pointer = readPointer();
      const ease = 1 - Math.exp(-beat * 5);
      glide.current.x += (pointer.x - glide.current.x) * ease;
      glide.current.y += (pointer.y - glide.current.y) * ease;
      const aspect = size.width / Math.max(size.height, 1);
      set.uFocus.value.set(
        (glide.current.x - 0.5) * cursorFollow * aspect,
        (glide.current.y - 0.5) * cursorFollow,
      );
    } else {
      set.uFocus.value.set(0, 0);
    }

    if (!adaptiveQuality) return;
    const meter = budget.current;
    meter.frames += 1;
    meter.span += delta;
    if (meter.span < 0.75) return;
    const fps = meter.frames / meter.span;
    meter.frames = 0;
    meter.span = 0;
    const roof = Math.min(window.devicePixelRatio || 1, 2);
    if (fps < targetFps * 0.85 && ratio > 0.75) {
      meter.wins = 0;
      gl.setPixelRatio(Math.max(0.75, ratio * 0.75));
    } else if (fps > targetFps * 0.98 && ratio < roof) {
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
        vertexShader={rippleVertex}
        fragmentShader={rippleFragment}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
        premultipliedAlpha
      />
    </mesh>
  );
};

export const MinimalRipple = ({
  speed = 4,
  frequency = 26,
  thickness = 0.07,
  softness = 0.02,
  radius = 0.95,
  fade = 0.05,
  decay = 0.8,
  gain = 1.3,
  contrast = 1,
  pulse = 0.15,
  pulseRate = 0.6,
  grain = 0.05,
  grainSize = 1,
  grainRate = 24,
  color = "#0e7490",
  hotColor = "#a5f3fc",
  backgroundColor = "#0a0a0a",
  opacity = 1,
  cursorInteraction = true,
  cursorFollow = 0.9,
  paused = false,
  adaptiveQuality = true,
  targetFps = 60,
  dpr = 2,
  className,
  children,
}: MinimalRippleProps) => {
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
          <RippleField
            speed={speed}
            frequency={frequency}
            thickness={thickness}
            softness={softness}
            radius={radius}
            fade={fade}
            decay={decay}
            gain={gain}
            contrast={contrast}
            pulse={pulse}
            pulseRate={pulseRate}
            grain={grain}
            grainSize={grainSize}
            grainRate={grainRate}
            color={color}
            hotColor={hotColor}
            backgroundColor={backgroundColor}
            opacity={opacity}
            cursorInteraction={cursorInteraction}
            cursorFollow={cursorFollow}
            paused={paused}
            adaptiveQuality={adaptiveQuality}
            targetFps={targetFps}
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

export default MinimalRipple;
