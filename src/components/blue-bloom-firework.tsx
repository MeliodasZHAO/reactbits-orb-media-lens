"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface BlueBloomFireworkProps {
  color?: string;
  particleCount?: number;
  cycleDuration?: number;
  paused?: boolean;
  restartSignal?: number;
  className?: string;
}

const vertexShader = `
precision highp float;

uniform float uTime;
uniform float uCycle;
uniform float uPixelRatio;
uniform float uPointScale;
uniform vec2 uPointer;

attribute float aKind;
attribute float aSeed;
attribute float aSeedB;
attribute float aSeedC;
attribute float aSeedD;
attribute float aLayer;
attribute float aSize;

varying float vAlpha;
varying float vHeat;
varying float vTwinkle;
varying float vKind;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

float easeOutCubic(float value) {
  float inverse = 1.0 - saturate(value);
  return 1.0 - inverse * inverse * inverse;
}

float easeInOutCubic(float value) {
  float x = saturate(value);
  return x < 0.5
    ? 4.0 * x * x * x
    : 1.0 - pow(-2.0 * x + 2.0, 3.0) * 0.5;
}

void main() {
  float t = mod(uTime, max(uCycle, 0.1));
  vec3 positionNow = vec3(0.0);
  float alpha = 0.0;
  float heat = 0.5;
  float twinkle = 1.0;

  vec3 bloomCenter = vec3(0.0, 0.12, 0.0);

  if (aKind < 0.5) {
    // A narrow launch plume. The head climbs while older sparks trail behind it.
    float launch = easeOutCubic(t / 1.18);
    float headY = mix(-1.62, bloomCenter.y, launch);
    float tailLength = mix(0.06, 0.72, launch);
    float tail = pow(aSeed, 0.72);
    positionNow.y = headY - tail * tailLength;
    positionNow.x =
      sin(t * 10.0 + aSeedB * 18.0) * (0.008 + tail * 0.026)
      + (aSeedC - 0.5) * 0.035;
    positionNow.z = (aSeedD - 0.5) * 0.12;
    alpha =
      smoothstep(0.02, 0.12, t)
      * (1.0 - smoothstep(1.18, 1.52, t))
      * (1.0 - tail * 0.82);
    heat = 0.82 + (1.0 - tail) * 0.18;
    twinkle = 0.75 + 0.25 * sin(t * 34.0 + aSeedB * 40.0);
  } else if (aKind < 1.5) {
    // The launch compacts into a luminous, vertically folded bud.
    float gather = smoothstep(0.72, 1.2, t);
    float release = smoothstep(3.85 + aLayer * 0.12, 5.42 + aLayer * 0.18, t);
    float coreRound = smoothstep(1.2, 2.15, t);
    float angle = aSeed * TAU;
    float radius = 0.004 + 0.108 * sqrt(aSeedB);
    float fold = 0.45 + 0.55 * sin(angle * 3.0 + aLayer * PI);
    vec3 foldedBud = vec3(
      cos(angle) * radius * mix(0.34, 0.7, fold),
      (aSeedC - 0.5) * 0.34 + abs(sin(angle)) * radius * 0.48,
      sin(angle) * radius * 0.62
    );
    vec3 roundCore = vec3(
      cos(angle) * radius * (0.72 + aSeedC * 0.28),
      sin(angle) * radius * (0.72 + aSeedB * 0.28),
      (aSeedC - 0.5) * radius * 1.35
    );
    vec3 budOffset = mix(foldedBud, roundCore, coreRound);
    positionNow = bloomCenter + budOffset * mix(0.72, 1.0, gather);
    alpha = gather * (1.0 - release);
    heat = 0.72 + 0.28 * (1.0 - aSeedB);
    twinkle = 0.88 + 0.12 * sin(t * 22.0 + aSeedD * 31.0);
  } else if (aKind < 2.5) {
    // Six legible particle petals unfold in staggered layers from the bud.
    float petalIndex = floor(aSeed * 6.0);
    float petalAngle = PI * 0.5 + petalIndex * TAU / 6.0;
    float petalVariation = 0.9 + 0.14 * sin(petalIndex * 2.17 + 0.6);
    float along = pow(aSeedB, 0.58);
    float spawn = 1.2 + aLayer * 0.3 + aSeedD * 0.07;
    float bloom = easeInOutCubic((t - spawn) / 1.34);
    float localAngle =
      petalAngle
      + (aSeedC - 0.5) * mix(0.08, 0.24, bloom)
      + (aSeedD - 0.5) * 0.1 * bloom * bloom
      + (aLayer - 0.5) * along * 0.12
      + sin(along * PI) * (0.07 + 0.045 * sin(petalIndex * 1.73)) * bloom;
    vec2 direction = vec2(cos(localAngle), sin(localAngle));
    vec2 across = vec2(-direction.y, direction.x);
    float radius = mix(
      0.035 + along * 0.09,
      0.12 + along * mix(1.08, 1.42, aLayer) * petalVariation,
      bloom
    );
    float petalWidth =
      (aSeedC - 0.5)
      * sin(along * PI)
      * mix(0.028, 0.27 + aLayer * 0.045, bloom);
    vec2 petal = direction * radius + across * petalWidth;
    petal.y *= 0.9;

    float settle = max(t - 3.35, 0.0);
    petal.x += (aSeedD - 0.5) * settle * 0.055;
    petal.y -= settle * settle * (0.018 + aSeedC * 0.018);
    positionNow = bloomCenter + vec3(
      petal,
      (aSeedC - 0.5) * sin(along * PI) * mix(0.08, 0.72, bloom)
    );

    float born = smoothstep(spawn, spawn + 0.13, t);
    float dissolve = 1.0 - smoothstep(4.18 + aSeedD * 0.18, 5.82, t);
    alpha = born * dissolve * mix(0.52, 1.0, sin(along * PI));
    heat = 0.22 + (1.0 - along) * 0.68 + (1.0 - aLayer) * 0.1;
    twinkle = 0.78 + 0.22 * sin(t * (13.0 + aSeedD * 11.0) + aSeedC * 47.0);
  } else {
    // Fine vapour sparks outrun the petals, then decelerate and disappear.
    float angle = aSeed * TAU + (aSeedB - 0.5) * 0.34;
    float spawn = 1.5 + aLayer * 0.42;
    float bloom = easeOutCubic((t - spawn) / 1.65);
    float radius = mix(0.04, 0.8 + aSeedC * 0.68, bloom);
    vec2 direction = vec2(cos(angle), sin(angle));
    float drift = max(t - 3.0, 0.0);
    positionNow = bloomCenter + vec3(
      direction.x * radius + sin(t * 2.1 + aSeedD * 15.0) * drift * 0.022,
      direction.y * radius * 0.9 - drift * drift * 0.026,
      (aSeedB - 0.5) * radius * 0.55
    );
    alpha =
      smoothstep(spawn, spawn + 0.16, t)
      * (1.0 - smoothstep(3.7 + aSeedD * 0.3, 5.92, t))
      * (0.3 + aSeedC * 0.52);
    heat = 0.12 + (1.0 - aSeedC) * 0.36;
    twinkle = 0.62 + 0.38 * sin(t * 19.0 + aSeedD * 53.0);
  }

  // Pointer movement changes the viewpoint, not the particle physics.
  float yaw = uPointer.x * 0.12;
  float pitch = uPointer.y * 0.07;
  mat2 yawRotation = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw));
  mat2 pitchRotation = mat2(cos(pitch), -sin(pitch), sin(pitch), cos(pitch));
  positionNow.xz = yawRotation * positionNow.xz;
  positionNow.yz = pitchRotation * positionNow.yz;

  vec4 mvPosition = modelViewMatrix * vec4(positionNow, 1.0);
  float perspective = 5.0 / max(-mvPosition.z, 0.8);
  gl_PointSize = clamp(
    aSize * uPointScale * uPixelRatio * perspective,
    1.0,
    16.0 * uPixelRatio
  );
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = max(alpha * max(twinkle, 0.16), 0.0);
  vHeat = saturate(heat);
  vTwinkle = saturate(twinkle);
  vKind = aKind;
}
`;

const fragmentShader = `
precision highp float;

uniform vec3 uDeep;
uniform vec3 uBlue;
uniform vec3 uIce;

varying float vAlpha;
varying float vHeat;
varying float vTwinkle;
varying float vKind;

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float distanceFromCenter = length(point);
  if (distanceFromCenter > 1.0 || vAlpha <= 0.001) discard;

  float core = 1.0 - smoothstep(0.0, 0.22, distanceFromCenter);
  float body = 1.0 - smoothstep(0.12, 0.62, distanceFromCenter);
  float halo = exp(-distanceFromCenter * distanceFromCenter * 4.8);
  float fineSpark = step(2.5, vKind);
  float shape = mix(body * 0.82 + halo * 0.28, body * 0.94 + halo * 0.12, fineSpark);
  float alpha = shape * vAlpha;

  vec3 base = mix(uDeep, uBlue, smoothstep(0.0, 0.72, vHeat));
  base = mix(base, uIce, core * (0.38 + vHeat * 0.62));
  base *= 1.02 + vTwinkle * 0.34;

  gl_FragColor = vec4(base * alpha, alpha);
}
`;

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

interface ParticleFieldProps {
  color: string;
  count: number;
  cycleDuration: number;
  paused: boolean;
  restartSignal: number;
}

function ParticleField({
  color,
  count,
  cycleDuration,
  paused,
  restartSignal,
}: ParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const elapsedRef = useRef(0);
  const pointerRef = useRef(new THREE.Vector2());
  const { gl, size, pointer } = useThree();

  const geometry = useMemo(() => {
    const particleTotal = Math.max(6000, Math.min(Math.round(count), 36000));
    const positions = new Float32Array(particleTotal * 3);
    const kind = new Float32Array(particleTotal);
    const seed = new Float32Array(particleTotal);
    const seedB = new Float32Array(particleTotal);
    const seedC = new Float32Array(particleTotal);
    const seedD = new Float32Array(particleTotal);
    const layer = new Float32Array(particleTotal);
    const particleSize = new Float32Array(particleTotal);
    const random = seededRandom(20260829);

    for (let index = 0; index < particleTotal; index += 1) {
      const ratio = index / particleTotal;
      const particleKind = ratio < 0.1
        ? 0
        : ratio < 0.19
          ? 1
          : ratio < 0.84
            ? 2
            : 3;
      kind[index] = particleKind;
      seed[index] = random();
      seedB[index] = random();
      seedC[index] = random();
      seedD[index] = random();
      layer[index] = random();
      particleSize[index] = particleKind === 0
        ? 0.62 + random() * 0.9
        : particleKind === 1
          ? 0.72 + random() * 1.08
          : particleKind === 2
            ? 0.48 + random() * 1.05
            : 0.34 + random() * 0.62;
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
    buffer.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    buffer.setAttribute("aSeedB", new THREE.BufferAttribute(seedB, 1));
    buffer.setAttribute("aSeedC", new THREE.BufferAttribute(seedC, 1));
    buffer.setAttribute("aSeedD", new THREE.BufferAttribute(seedD, 1));
    buffer.setAttribute("aLayer", new THREE.BufferAttribute(layer, 1));
    buffer.setAttribute("aSize", new THREE.BufferAttribute(particleSize, 1));
    buffer.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3.5);
    return buffer;
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uCycle: { value: cycleDuration },
    uPixelRatio: { value: 1 },
    uPointScale: { value: 5.4 },
    uPointer: { value: new THREE.Vector2() },
    uDeep: { value: new THREE.Color("#0b2b88") },
    uBlue: { value: new THREE.Color(color) },
    uIce: { value: new THREE.Color("#e8fbff") },
  }), [color, cycleDuration]);

  useEffect(() => {
    elapsedRef.current = 0;
  }, [restartSignal]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    const main = new THREE.Color(color);
    material.uniforms.uBlue.value.copy(main);
    material.uniforms.uDeep.value.copy(main).offsetHSL(-0.035, 0.06, -0.14);
    material.uniforms.uIce.value.copy(main).lerp(new THREE.Color("#ffffff"), 0.72);
  }, [color]);

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;
    if (!paused) elapsedRef.current += Math.min(delta, 0.05);
    const easing = 1 - Math.exp(-Math.min(delta, 0.05) * 4.8);
    pointerRef.current.x += (pointer.x - pointerRef.current.x) * easing;
    pointerRef.current.y += (pointer.y - pointerRef.current.y) * easing;
    material.uniforms.uTime.value = paused ? 3.55 : elapsedRef.current;
    material.uniforms.uCycle.value = cycleDuration;
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    material.uniforms.uPointScale.value = Math.max(4.8, Math.min(size.height / 125, 7.2));
    material.uniforms.uPointer.value.copy(pointerRef.current);
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

export default function BlueBloomFirework({
  color = "#58b7ff",
  particleCount = 26000,
  cycleDuration = 6,
  paused = false,
  restartSignal = 0,
  className,
}: BlueBloomFireworkProps) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 38, near: 0.1, far: 20 }}
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: false,
          powerPreference: "high-performance",
        }}
      >
        <ParticleField
          color={color}
          count={particleCount}
          cycleDuration={cycleDuration}
          paused={paused}
          restartSignal={restartSignal}
        />
      </Canvas>
    </div>
  );
}
