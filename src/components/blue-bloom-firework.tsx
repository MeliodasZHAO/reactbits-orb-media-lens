"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface BlueBloomFireworkProps {
  color?: string;
  backgroundColor?: string;
  lightSurface?: boolean;
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

  float cyclePhase = t / max(uCycle, 0.1);
  float loopAngle = cyclePhase * TAU;
  vec2 lensAxis = normalize(vec2(-0.62, -1.0));
  vec2 lensAcross = vec2(-lensAxis.y, lensAxis.x);
  vec3 birthPoint = vec3(0.2, 0.22, 0.0);
  vec3 bloomCenter = vec3(-0.03, 0.015, 0.0);
  float globalBreath = 0.5 - 0.5 * cos(loopAngle);

  if (aKind < 0.5) {
    // A permanently populated, closed energy ligament replaces the old launch
    // tail. It links the upper-right birth point to the lower-left bloom body,
    // so contraction never leaves an empty viewport and the loop has no seam.
    float flow = fract(aSeed + cyclePhase * 0.22 + aLayer * 0.035);
    float flowAngle = flow * TAU;
    float filament = floor(aSeedC * 3.0) - 1.0;
    float axial = 0.72 * cos(flowAngle) - 0.08 * cos(flowAngle * 2.0);
    float lateral = 0.13 * sin(flowAngle)
      + 0.035 * sin(flowAngle * 3.0 + loopAngle + filament * 1.7);
    vec2 path = bloomCenter.xy
      - lensAxis * 0.03
      + lensAxis * axial
      + lensAcross * lateral;
    vec2 tangent = normalize(
      lensAxis * (-0.72 * sin(flowAngle) + 0.16 * sin(flowAngle * 2.0))
      + lensAcross * (0.13 * cos(flowAngle) + 0.105 * cos(flowAngle * 3.0 + loopAngle + filament * 1.7))
      + vec2(0.0001)
    );
    vec2 normalToPath = vec2(-tangent.y, tangent.x);
    float braid = sin(flowAngle * 3.0 + filament * 2.15 + loopAngle);
    float width = (0.008 + aSeedD * 0.022) * (0.68 + 0.32 * globalBreath);
    path += normalToPath * (
      filament * width * 0.46
      + braid * width
      + (aSeedB - 0.5) * width * 0.62
    );
    positionNow = vec3(path, (aSeedD - 0.5) * (0.05 + 0.08 * globalBreath));
    alpha = (0.13 + 0.34 * pow(0.5 + 0.5 * cos(flowAngle), 1.8))
      * (0.78 + 0.22 * globalBreath);
    heat = 0.56 + 0.34 * (0.5 + 0.5 * cos(flowAngle));
    twinkle = 0.92 + 0.08 * sin(loopAngle * 3.0 + aSeedB * 40.0);
    tone = mix(0.18, 0.82, aSeedD);
    softness = smoothstep(0.3, 0.0, aSeedD) * 0.72;
    streak = smoothstep(0.58, 1.0, aSeedD) * 0.68;
    travelAngle = atan(tangent.y, tangent.x);
  } else if (aKind < 1.5) {
    // The central nucleus is always present. Its small counter-rotating lobes
    // receive the returning crown while a new inner bloom is already forming.
    float angle = aSeed * TAU;
    float heartBeat = 0.82
      + 0.11 * sin(loopAngle * 2.0 - aLayer * PI)
      + 0.07 * globalBreath;
    float coreAngle = angle
      + 0.24 * sin(loopAngle + aLayer * 1.9)
      + (aLayer - 0.5) * 0.42;
    float radius = (0.025 + 0.12 * sqrt(aSeedB)) * heartBeat;
    vec3 coreOffset = vec3(
      cos(coreAngle) * radius * (0.82 + aSeedC * 0.18),
      sin(coreAngle) * radius * (0.68 + aSeedB * 0.2),
      (aSeedC - 0.5) * radius * 1.2
    );
    coreOffset.xy += lensAxis
      * (aSeedD - 0.5)
      * 0.025
      * sin(loopAngle * 2.0 + angle);
    positionNow = bloomCenter + coreOffset;
    alpha = 0.4 + 0.24 * (1.0 - aSeedB) + globalBreath * 0.08;
    heat = 0.5 + 0.3 * (1.0 - aSeedB);
    twinkle = 0.94 + 0.06 * sin(loopAngle * 4.0 + aSeedD * 31.0);
    tone = mix(0.42, 0.86, aSeedC);
    softness = smoothstep(0.2, 0.0, aSeedD) * 0.68;
  } else if (aKind < 2.5) {
    // Three interlocked crowns are born just inside the upper-right lens zone,
    // then settle toward the visual centre and open primarily down-left.
    float middleLayer = step(0.34, aLayer);
    float outerLayer = step(0.69, aLayer);
    float layerBand = middleLayer + outerLayer;
    float petalCount = mix(17.0, 8.0, middleLayer);
    petalCount = mix(petalCount, 13.0, outerLayer);
    float petalIndex = floor(aSeed * petalCount);
    float handedness = 1.0 - 2.0 * middleLayer + 2.0 * outerLayer;
    float along = pow(aSeedB, mix(0.52, 0.68, aLayer));

    float phaseOffset = aLayer * 0.52 + fract(petalIndex * 0.381966) * 0.1;
    float petalWave = 0.5 - 0.5 * cos(loopAngle - phaseOffset);
    float bloom = 0.34 + 0.66 * pow(petalWave, 0.7);
    float innerRenewal = (1.0 - middleLayer)
      * (0.5 + 0.5 * sin(loopAngle * 2.0 + petalIndex * 0.42));
    bloom = saturate(bloom + innerRenewal * 0.055);
    float centreTransfer = 0.22 + 0.78 * smoothstep(0.42, 0.82, bloom);
    vec3 livingCenter = mix(birthPoint, bloomCenter, centreTransfer);
    livingCenter.xy += lensAxis * bloom * 0.12;

    float petalAngle = PI * 0.58
      + petalIndex * TAU / petalCount
      + middleLayer * 0.23
      - outerLayer * 0.11
      + 0.1 * sin(petalIndex * 2.41 + layerBand * 1.7);
    float petalVariation = 0.82
      + 0.2 * sin(petalIndex * 1.91 + aLayer * 2.3)
      + 0.07 * sin(petalIndex * 4.17);
    float layerDrift = handedness * (
      0.075 * sin(loopAngle + aLayer * 1.7)
      + 0.026 * sin(loopAngle * 2.0 - along * 2.4)
    );
    float openingShear = (1.0 - bloom)
      * handedness
      * mix(0.36, 0.16, smoothstep(0.0, 2.0, layerBand))
      * sin(along * PI);
    float spiralSweep = along
      * handedness
      * mix(0.92, 0.28, smoothstep(0.0, 2.0, layerBand))
      * bloom;
    float strandWave = sin(
      along * TAU * 1.32 - loopAngle * 1.45 + petalIndex * 0.76 + aLayer * 2.2
    );
    float localAngle = petalAngle
      + openingShear
      + spiralSweep
      + layerDrift
      + (aSeedC - 0.5) * mix(0.07, 0.2, bloom)
      + (aLayer - 0.5) * along * 0.15
      + strandWave * sin(along * PI) * 0.035 * bloom;
    vec2 direction = vec2(cos(localAngle), sin(localAngle));
    vec2 across = vec2(-direction.y, direction.x);

    float lowerLeftWeight = smoothstep(-0.35, 0.88, dot(direction, lensAxis));
    float upperRightWeight = pow(max(dot(direction, -lensAxis), 0.0), 7.0);
    float breath = 1.0
      + 0.035 * sin(loopAngle * 2.0 + petalIndex * 0.72 + aLayer * PI)
      + 0.015 * sin(loopAngle * 3.0 - along * 3.2);
    float radius = (
      0.055
      + along
        * mix(0.66, 1.35, smoothstep(0.0, 2.0, layerBand))
        * petalVariation
        * mix(0.76, 1.34, lowerLeftWeight)
    ) * bloom * breath;
    float petalWidth = (aSeedC - 0.5)
      * sin(along * PI)
      * mix(0.14, 0.082, smoothstep(0.0, 2.0, layerBand))
      * bloom;
    petalWidth += handedness
      * smoothstep(0.62, 1.0, along)
      * mix(0.095, 0.05, outerLayer)
      * (0.25 + 0.75 * aSeedD)
      * bloom;
    vec2 petal = direction * radius + across * petalWidth;

    // Only a thin outer family reaches back into the upper-right distortion
    // zone. The lens stretches these tips while the main flower stays centred.
    float rimFamily = outerLayer * smoothstep(0.72, 1.0, along) * upperRightWeight;
    float rimExtension = rimFamily * (0.38 + 0.48 * bloom + aSeedD * 0.16);
    petal += (-lensAxis) * rimExtension;
    petal += lensAcross
      * rimFamily
      * sin(loopAngle * 2.0 + along * 8.0 + petalIndex)
      * 0.055;
    petal += across
      * strandWave
      * sin(along * PI)
      * (0.012 + layerBand * 0.008)
      * bloom;
    petal.y *= 0.91;

    positionNow = livingCenter + vec3(
      petal,
      (aSeedC - 0.5) * sin(along * PI) * mix(0.12, 0.68, bloom)
      + sin(loopAngle + petalIndex * 0.9 - along * 3.5)
        * sin(along * PI)
        * mix(0.02, 0.07, smoothstep(0.0, 2.0, layerBand))
    );
    alpha = mix(0.24, 0.84, sin(along * PI))
      * (0.5 + 0.5 * bloom)
      * mix(1.0, 1.08, rimFamily);
    heat = 0.24 + (1.0 - along) * 0.62 + (1.0 - aLayer) * 0.12;
    twinkle = 0.91 + 0.09 * sin(loopAngle * 4.0 + aSeedC * 47.0 + aLayer * 3.0);
    tone = fract(
      petalIndex * 0.127
      + aLayer * 0.34
      + aSeedC * 0.23
      + 0.018 * sin(loopAngle)
    );
    softness = max(smoothstep(0.28, 0.0, aSeedD), rimFamily * 0.34);
    streak = smoothstep(0.76, 1.0, aSeedD)
      * (0.4 + along * 0.6)
      + rimFamily * 0.48;
    travelAngle = atan(direction.y, direction.x);
  } else {
    // Directional vapour fills the lower-left body and leaves a restrained
    // upper-right fringe for the gravitational lens to exaggerate.
    float rimMist = step(0.82, aSeedD) * smoothstep(0.56, 1.0, aLayer);
    float radialAngle = aSeed * TAU + (aSeedB - 0.5) * 0.32;
    float biasedAngle = atan(lensAxis.y, lensAxis.x) + (aSeedC - 0.5) * 1.18;
    float rimAngle = atan(-lensAxis.y, -lensAxis.x) + (aSeedC - 0.5) * 0.5;
    float angle = mix(radialAngle, biasedAngle, 0.58 + aLayer * 0.18);
    angle = mix(angle, rimAngle, rimMist);
    vec2 direction = vec2(cos(angle), sin(angle));
    float mistWave = 0.5 - 0.5 * cos(loopAngle - aLayer * 0.7 - aSeedB * 0.12);
    float mistBloom = 0.38 + 0.62 * pow(mistWave, 0.78);
    float radius = (0.28 + aSeedC * 0.72 + aLayer * 0.3) * mistBloom;
    radius += rimMist * (0.32 + aSeedB * 0.26) * mistBloom;
    float mistTransfer = 0.18 + 0.82 * smoothstep(0.46, 0.84, mistBloom);
    vec3 mistCenter = mix(birthPoint, bloomCenter, mistTransfer);
    mistCenter.xy += lensAxis * mistBloom * 0.12;
    positionNow = mistCenter + vec3(
      direction.x * radius
        + lensAcross.x * sin(loopAngle * 2.0 + aSeedD * 15.0) * 0.035,
      direction.y * radius * 0.9
        + lensAcross.y * sin(loopAngle * 2.0 + aSeedD * 15.0) * 0.035,
      (aSeedB - 0.5) * radius * 0.52
    );
    alpha = (0.12 + aSeedC * 0.36)
      * (0.48 + 0.52 * mistBloom)
      * mix(1.0, 0.64, rimMist);
    heat = 0.14 + (1.0 - aSeedC) * 0.34;
    twinkle = 0.88 + 0.12 * sin(loopAngle * 4.0 + aSeedD * 53.0);
    tone = fract(aSeedB * 0.7 + aSeedD * 0.46 + 0.012 * sin(loopAngle));
    softness = 0.46 + smoothstep(0.4, 0.0, aSeedD) * 0.54;
    streak = smoothstep(0.82, 1.0, aSeedD) + rimMist * 0.36;
    travelAngle = atan(direction.y, direction.x);
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
uniform float uLightSurface;

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
  float surfaceSoftness = max(vSoftness, uLightSurface * 0.2);
  float shape = mix(sparkShape, mistShape * 0.58, surfaceSoftness);
  shape = mix(shape, streakShape * 0.84 + halo * 0.08, vStreak);
  float alpha = shape * vAlpha * mix(1.0, 0.42, surfaceSoftness);
  alpha *= mix(1.0, 0.82, uLightSurface);

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

  vec3 outputColor = mix(base * alpha, base, uLightSurface);
  gl_FragColor = vec4(outputColor, alpha);
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
  lightSurface: boolean;
  count: number;
  cycleDuration: number;
  paused: boolean;
  restartSignal: number;
}

function ParticleField({
  color,
  lightSurface,
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
    uLightSurface: { value: lightSurface ? 1 : 0 },
  }), [color, cycleDuration, lightSurface]);

  useEffect(() => {
    elapsedRef.current = 0;
  }, [restartSignal]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    const main = new THREE.Color(color);
    if (lightSurface) {
      material.uniforms.uBlue.value.copy(main).lerp(new THREE.Color("#eaf8ff"), 0.16);
      material.uniforms.uDeep.value.copy(main).lerp(new THREE.Color("#8accea"), 0.48);
      material.uniforms.uCyan.value.copy(main).lerp(new THREE.Color("#c9f5f4"), 0.62);
      material.uniforms.uViolet.value.copy(main).lerp(new THREE.Color("#d8d7f4"), 0.7);
      material.uniforms.uIce.value.set("#f6fcff");
    } else {
      material.uniforms.uBlue.value.copy(main);
      material.uniforms.uDeep.value.copy(main).offsetHSL(-0.035, 0.07, -0.16);
      material.uniforms.uCyan.value.copy(main).offsetHSL(-0.075, -0.08, 0.13);
      material.uniforms.uViolet.value.copy(main).offsetHSL(0.11, -0.08, 0.18);
      material.uniforms.uIce.value.copy(main).lerp(new THREE.Color("#ffffff"), 0.72);
    }
    material.uniforms.uLightSurface.value = lightSurface ? 1 : 0;
  }, [color, lightSurface]);

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
        blending={lightSurface ? THREE.NormalBlending : THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

export default function BlueBloomFirework({
  color = "#58b7ff",
  backgroundColor,
  lightSurface = false,
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
        {backgroundColor ? <color attach="background" args={[backgroundColor]} /> : null}
        <ParticleField
          color={color}
          lightSurface={lightSurface}
          count={particleCount}
          cycleDuration={cycleDuration}
          paused={paused}
          restartSignal={restartSignal}
        />
      </Canvas>
    </div>
  );
}
