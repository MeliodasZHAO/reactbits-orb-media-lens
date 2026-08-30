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
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
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
varying float vTone;
varying float vSoftness;
varying float vStreak;
varying float vAngle;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

vec2 cubicBezier(vec2 a, vec2 b, vec2 c, vec2 d, float value) {
  float x = saturate(value);
  float inverse = 1.0 - x;
  return inverse * inverse * inverse * a
    + 3.0 * inverse * inverse * x * b
    + 3.0 * inverse * x * x * c
    + x * x * x * d;
}

vec2 cubicBezierTangent(vec2 a, vec2 b, vec2 c, vec2 d, float value) {
  float x = saturate(value);
  float inverse = 1.0 - x;
  return normalize(
    3.0 * inverse * inverse * (b - a)
    + 6.0 * inverse * x * (c - b)
    + 3.0 * x * x * (d - c)
    + vec2(0.0001)
  );
}

void main() {
  float t = mod(uTime, max(uCycle, 0.1));
  vec3 positionNow = vec3(0.0);
  float alpha = 0.0;
  float heat = 0.5;
  float twinkle = 1.0;
  float tone = aSeedC;
  float softness = 0.0;
  float streak = 0.0;
  float travelAngle = PI * 0.5;

  vec3 bloomCenter = vec3(0.02, 0.12, 0.0);
  vec2 launchStart = vec2(-0.46, -1.42);
  vec2 launchControlA = vec2(-0.61, -1.08);
  vec2 launchControlB = vec2(-0.24, -0.22);
  vec2 launchEnd = bloomCenter.xy;
  vec2 lensAxis = normalize(vec2(-0.58, -1.0));

  if (aKind < 0.5) {
    // Three braided comet filaments follow a curved path into the lens axis.
    // The power curve deliberately retains velocity at impact, so the launch
    // hands its momentum straight into the opening petals instead of stopping.
    float launchLinear = saturate(t / 1.14);
    float launchHead = pow(launchLinear, 0.76);
    float tail = pow(aSeed, 0.68);
    float trailLength = mix(0.035, 0.48, smoothstep(0.04, 0.78, launchHead));
    float pathProgress = max(launchHead - tail * trailLength, 0.0);
    vec2 path = cubicBezier(
      launchStart,
      launchControlA,
      launchControlB,
      launchEnd,
      pathProgress
    );
    vec2 tangent = cubicBezierTangent(
      launchStart,
      launchControlA,
      launchControlB,
      launchEnd,
      pathProgress
    );
    vec2 normalToPath = vec2(-tangent.y, tangent.x);
    float filament = floor(aSeedC * 3.0) - 1.0;
    float cyclicDrift = sin(t / max(uCycle, 0.1) * TAU) * 1.3;
    float braid = sin(pathProgress * 25.0 + filament * 2.1 + cyclicDrift);
    float width = (0.004 + tail * 0.034) * (0.58 + 0.42 * aSeedD);
    path += normalToPath * (
      filament * width * 0.54
      + braid * width
      + (aSeedB - 0.5) * width * 0.7
    );
    positionNow = vec3(path, (aSeedD - 0.5) * (0.035 + tail * 0.15));
    float trailOpacity = 0.16 + 0.84 * pow(1.0 - tail, 0.66);
    float launchVisibility = mix(0.24, 1.0, smoothstep(0.0, 0.14, t));
    alpha = launchVisibility
      * (1.0 - smoothstep(1.18, 1.52, t))
      * trailOpacity;

    // During the final beat, the last vapour condenses back into the exact
    // position and opacity used at t=0. The modulo boundary is therefore a
    // continuation, not a cut to an empty frame.
    float seamStart = max(uCycle - 1.72, 0.1);
    float seamProgress = smoothstep(seamStart, uCycle, t);
    float returnSpread = sin(seamProgress * PI);
    float returnPathProgress = saturate(
      1.0 - seamProgress + (tail - 0.5) * returnSpread * 0.5
    );
    vec2 seamTangent = cubicBezierTangent(
      launchStart,
      launchControlA,
      launchControlB,
      launchEnd,
      returnPathProgress
    );
    vec2 seamNormal = vec2(-seamTangent.y, seamTangent.x);
    float seamBraid = sin(
      returnPathProgress * 25.0 + filament * 2.1 + cyclicDrift
    );
    vec2 seamPosition = cubicBezier(
      launchStart,
      launchControlA,
      launchControlB,
      launchEnd,
      returnPathProgress
    ) + seamNormal * (
      filament * width * 0.54
      + seamBraid * width
      + (aSeedB - 0.5) * width * 0.7
    );
    float returnAngle = aSeedB * TAU + seamProgress * 1.4;
    float returnRadius = pow(aSeedC, 1.65) * returnSpread;
    vec2 returnCloud = (
      seamNormal * cos(returnAngle) * 0.23
      + seamTangent * sin(returnAngle) * 0.12
    ) * returnRadius;
    float seamMix = smoothstep(seamStart, seamStart + 0.12, t);
    positionNow = mix(
      positionNow,
      vec3(
        seamPosition + returnCloud,
        (aSeedD - 0.5) * (0.035 + tail * 0.15)
      ),
      seamMix
    );
    float seamAlpha = (
      mix(0.08, 0.24, seamProgress)
      + returnSpread * 0.32
    ) * trailOpacity;
    alpha = mix(alpha, seamAlpha, seamMix);
    float boundaryBlend = max(
      seamMix,
      1.0 - smoothstep(0.0, 0.18, t)
    );
    heat = 0.66 + (1.0 - tail) * 0.34;
    twinkle = 0.92 + 0.08 * sin(
      t / max(uCycle, 0.1) * TAU * 3.0 + aSeedB * 40.0
    );
    tone = mix(0.2, 0.82, aSeedD);
    softness = max(
      smoothstep(0.26, 0.0, aSeedD) * (0.46 + tail * 0.34),
      boundaryBlend * (0.42 + tail * 0.28)
    );
    streak = smoothstep(0.54, 1.0, aSeedD)
      * mix(0.5 + launchHead * 0.5, 0.24, boundaryBlend);
    vec2 visualTangent = normalize(mix(tangent, seamTangent, seamMix));
    travelAngle = atan(visualTangent.y, visualTangent.x);
  } else if (aKind < 1.5) {
    // The moving head compresses into a bud while the inner petals are already
    // opening. This overlap removes the old launch / explosion phase break.
    float gather = smoothstep(0.72, 1.1, t);
    float release = smoothstep(3.85 + aLayer * 0.12, 5.42 + aLayer * 0.18, t);
    float coreRound = smoothstep(1.02, 1.86, t);
    float arrivalProgress = pow(saturate(t / 1.14), 0.76);
    vec2 arrival = cubicBezier(
      launchStart,
      launchControlA,
      launchControlB,
      launchEnd,
      arrivalProgress
    );
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
    vec3 arrivingBud = vec3(arrival, 0.0) + budOffset * 0.46;
    vec3 openedBud = bloomCenter + budOffset * mix(0.72, 1.0, gather);
    positionNow = mix(arrivingBud, openedBud, gather);
    float impactPulse = exp(-pow((t - 1.12) / 0.22, 2.0));
    positionNow.xy += lensAxis * impactPulse * (aSeedC - 0.5) * 0.035;
    alpha = gather * (1.0 - release) * mix(0.68, 0.3, coreRound);
    heat = 0.46 + 0.24 * (1.0 - aSeedB);
    twinkle = 0.94 + 0.06 * sin(t * 15.0 + aSeedD * 31.0);
    tone = mix(0.48, 0.92, aSeedC);
    softness = smoothstep(0.18, 0.0, aSeedD) * 0.7;
  } else if (aKind < 2.5) {
    // Interlocking inner and outer petals create one asymmetric living bloom.
    float outerLayer = step(0.46, aLayer);
    float petalCount = mix(7.0, 9.0, outerLayer);
    float petalIndex = floor(aSeed * petalCount);
    float petalAngle =
      PI * 0.5
      + petalIndex * TAU / petalCount
      + outerLayer * 0.19
      + 0.075 * sin(petalIndex * 2.41 + outerLayer);
    float petalVariation =
      0.84
      + 0.2 * sin(petalIndex * 1.91 + aLayer * 2.3)
      + 0.05 * sin(petalIndex * 4.17);
    float along = pow(aSeedB, mix(0.52, 0.68, aLayer));
    float petalStagger = fract(petalIndex * 0.381966) * 0.12;
    float spawn = 0.96 + aLayer * 0.38 + petalStagger + aSeedD * 0.065;
    float bloomAge = max(t - spawn, 0.0);
    float bloom = 1.0 - exp(
      -bloomAge * mix(2.4, 1.55, aLayer)
    );
    bloom = saturate(bloom);
    float bend =
      sin(along * PI)
      * (0.1 * sin(petalIndex * 1.67 + aLayer * 3.0)
        + 0.055 * sin(t * 0.72 + aSeedD * 5.0));
    float unfoldedAngle =
      petalAngle
      + (aSeedC - 0.5) * mix(0.06, 0.2, bloom)
      + (aSeedD - 0.5) * 0.08 * bloom * bloom
      + (aLayer - 0.5) * along * 0.15
      + bend * bloom;
    float unfurl = smoothstep(0.02, 0.68, bloom);
    float foldedAngle = PI * 0.5
      + (aSeedC - 0.5) * 0.24
      + (petalIndex - petalCount * 0.5) * 0.018;
    float localAngle = mix(foldedAngle, unfoldedAngle, unfurl);
    vec2 direction = vec2(cos(localAngle), sin(localAngle));
    vec2 across = vec2(-direction.y, direction.x);
    float radius = mix(
      0.035 + along * 0.09,
      0.1 + along * mix(0.76, 1.42, aLayer) * petalVariation,
      bloom
    );
    float petalWidth =
      (aSeedC - 0.5)
      * sin(along * PI)
      * mix(0.024, 0.2 + outerLayer * 0.075 + aLayer * 0.035, bloom);
    vec2 petal = direction * radius + across * petalWidth;
    petal.y *= 0.9;

    // The bloom carries the launch tangent for its first half-second. Long,
    // quiet diagonal filaments then enter the same rim band that the media
    // lens stretches from the upper-right toward its lower-left gravity point.
    vec2 impactDirection = normalize(launchEnd - launchControlB);
    float momentumCarry = bloomAge * exp(-bloomAge * 3.4);
    petal += impactDirection * momentumCarry * (0.22 + (1.0 - aLayer) * 0.13);
    float lensAlignment = pow(abs(dot(direction, lensAxis)), 4.5);
    float lensReach = outerLayer * pow(along, 3.1) * lensAlignment * bloom;
    petal += direction * lensReach * (0.18 + aSeedD * 0.16);
    float upperRightLobe = smoothstep(0.25, 0.88, dot(direction, -lensAxis));
    petal += lensAxis * upperRightLobe * lensReach * 0.11;

    vec2 flow = vec2(
      sin(petal.y * 4.2 + aSeedD * 12.0 + t * 0.76),
      cos(petal.x * 3.7 - aSeedC * 10.0 - t * 0.58)
    );
    petal += flow * (0.008 + along * 0.028) * bloom;

    float settle = max(t - 3.35, 0.0);
    petal.x +=
      (aSeedD - 0.5) * settle * 0.06
      + sin(t * 1.1 + petalIndex) * settle * 0.008;
    petal.y -= settle * settle * (0.014 + aSeedC * 0.016);
    positionNow = bloomCenter + vec3(
      petal,
      (aSeedC - 0.5) * sin(along * PI) * mix(0.08, 0.72, bloom)
    );

    float born = smoothstep(spawn - 0.035, spawn + 0.36, t);
    float dissolve = 1.0 - smoothstep(4.0 + aSeedD * 0.48, 5.9, t);
    alpha = born * dissolve * mix(0.34, 0.88, sin(along * PI));
    heat = 0.22 + (1.0 - along) * 0.68 + (1.0 - aLayer) * 0.1;
    twinkle = 0.91 + 0.09 * sin(t * (6.0 + aSeedD * 5.0) + aSeedC * 47.0);
    tone = fract(
      petalIndex * 0.127
      + aLayer * 0.34
      + aSeedC * 0.23
      + t * 0.018
    );
    softness = smoothstep(0.28, 0.0, aSeedD);
    streak = smoothstep(0.76, 1.0, aSeedD) * (0.4 + along * 0.6);
    travelAngle = localAngle;
  } else {
    // Fine vapour reaches the distortion band on the lens diagonal while the
    // central flower remains legible in the undistorted safe area.
    float radialAngle = aSeed * TAU + (aSeedB - 0.5) * 0.34;
    float axisAngle = atan(lensAxis.y, lensAxis.x)
      + step(0.5, aSeedB) * PI
      + (aSeedC - 0.5) * 0.5;
    float axisBias = smoothstep(0.46, 1.0, aLayer) * 0.72;
    float angle = mix(radialAngle, axisAngle, axisBias);
    float spawn = 1.18 + aLayer * 0.36;
    float bloomAge = max(t - spawn, 0.0);
    float bloom = 1.0 - exp(-bloomAge * mix(2.4, 1.55, aLayer));
    float radius = mix(
      0.04,
      0.72 + aSeedC * 0.54 + axisBias * (0.26 + aSeedD * 0.18),
      bloom
    );
    vec2 direction = vec2(cos(angle), sin(angle));
    float drift = max(t - 3.0, 0.0);
    positionNow = bloomCenter + vec3(
      direction.x * radius + sin(t * 1.7 + aSeedD * 15.0) * drift * 0.03,
      direction.y * radius * 0.9 - drift * drift * 0.026,
      (aSeedB - 0.5) * radius * 0.55
    );
    alpha =
      smoothstep(spawn - 0.04, spawn + 0.14, t)
      * (1.0 - smoothstep(3.7 + aSeedD * 0.3, 5.92, t))
      * (0.18 + aSeedC * 0.42);
    heat = 0.12 + (1.0 - aSeedC) * 0.36;
    twinkle = 0.86 + 0.14 * sin(t * 8.0 + aSeedD * 53.0);
    tone = fract(aSeedB * 0.7 + aSeedD * 0.46 + t * 0.012);
    softness = 0.38 + smoothstep(0.4, 0.0, aSeedD) * 0.62;
    streak = smoothstep(0.82, 1.0, aSeedD);
    travelAngle = angle;
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
  float textureScale = mix(1.0, 2.35, softness) * mix(1.0, 1.45, streak);
  gl_PointSize = clamp(
    aSize * textureScale * uPointScale * uPixelRatio * perspective,
    1.0,
    16.0 * uPixelRatio
  );
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = max(alpha * max(twinkle, 0.16), 0.0);
  vHeat = saturate(heat);
  vTwinkle = saturate(twinkle);
  vKind = aKind;
  vTone = tone;
  vSoftness = softness;
  vStreak = streak;
  vAngle = travelAngle;
}
`;

const fragmentShader = `
precision highp float;

uniform vec3 uDeep;
uniform vec3 uBlue;
uniform vec3 uCyan;
uniform vec3 uViolet;
uniform vec3 uIce;

varying float vAlpha;
varying float vHeat;
varying float vTwinkle;
varying float vKind;
varying float vTone;
varying float vSoftness;
varying float vStreak;
varying float vAngle;

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float distanceFromCenter = length(point);
  if (distanceFromCenter > 1.0 || vAlpha <= 0.001) discard;

  vec2 axis = vec2(cos(vAngle), sin(vAngle));
  vec2 perpendicular = vec2(-axis.y, axis.x);
  vec2 aligned = vec2(dot(point, axis), dot(point, perpendicular));
  float core = 1.0 - smoothstep(0.0, 0.22, distanceFromCenter);
  float body = 1.0 - smoothstep(0.12, 0.62, distanceFromCenter);
  float halo = exp(-distanceFromCenter * distanceFromCenter * 4.8);
  float streakDistance = length(vec2(aligned.x * 0.42, aligned.y * 1.42));
  float streakShape = 1.0 - smoothstep(0.18, 0.86, streakDistance);
  float mistShape =
    exp(-distanceFromCenter * distanceFromCenter * 2.25)
    * (1.0 - smoothstep(0.76, 1.0, distanceFromCenter));
  float sparkShape = body * 0.78 + halo * 0.2;
  float shape = mix(sparkShape, mistShape * 0.58, vSoftness);
  shape = mix(shape, streakShape * 0.84 + halo * 0.08, vStreak);
  float alpha = shape * vAlpha * mix(1.0, 0.42, vSoftness);

  vec3 blueFamily = mix(uDeep, uBlue, smoothstep(0.0, 0.46, vTone));
  vec3 spectralFamily = mix(
    uCyan,
    uViolet,
    smoothstep(0.38, 0.86, vTone)
  );
  vec3 base = mix(blueFamily, spectralFamily, smoothstep(0.3, 0.82, vTone));
  float earlyHighlight = mix(0.7, 1.0, smoothstep(1.45, 2.1, vKind));
  base = mix(
    base,
    uIce,
    core * (0.18 + vHeat * 0.54) * earlyHighlight
  );
  base *= 0.98 + vTwinkle * 0.24;

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
        : ratio < 0.14
          ? 1
          : ratio < 0.87
            ? 2
            : 3;
      kind[index] = particleKind;
      seed[index] = random();
      seedB[index] = random();
      seedC[index] = random();
      const textureSeed = random();
      seedD[index] = textureSeed;
      layer[index] = random();
      particleSize[index] = particleKind === 0
        ? 0.46 + random() * 0.78
        : particleKind === 1
          ? 0.58 + random() * 0.92
          : particleKind === 2
            ? textureSeed < 0.28
              ? 0.82 + random() * 0.76
              : textureSeed > 0.76
                ? 0.52 + random() * 0.72
                : 0.3 + random() * 0.54
            : textureSeed < 0.4
              ? 0.76 + random() * 0.68
              : 0.26 + random() * 0.48;
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
    uCyan: { value: new THREE.Color("#6ce8ff") },
    uViolet: { value: new THREE.Color("#b9a7ff") },
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
    material.uniforms.uDeep.value.copy(main).offsetHSL(-0.035, 0.07, -0.16);
    material.uniforms.uCyan.value.copy(main).offsetHSL(-0.075, -0.08, 0.13);
    material.uniforms.uViolet.value.copy(main).offsetHSL(0.11, -0.08, 0.18);
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
  particleCount = 32000,
  cycleDuration = 6,
  paused = false,
  restartSignal = 0,
  onCanvasReady,
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
        onCreated={({ gl }) => onCanvasReady?.(gl.domElement)}
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
