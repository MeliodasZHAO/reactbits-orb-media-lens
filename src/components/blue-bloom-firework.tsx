"use client";

import { Canvas, useFrame } from "@react-three/fiber";
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

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform float uCycle;
uniform vec3 uSky;
uniform vec3 uMint;
uniform vec3 uLavender;
uniform vec3 uIce;
uniform vec3 uAccent;

varying vec2 vUv;

const float TAU = 6.28318530718;

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
    mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), local.x),
    local.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 octaveRotation = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 5; octave += 1) {
    value += noise2(p) * amplitude;
    p = octaveRotation * p * 2.04 + 13.7;
    amplitude *= 0.5;
  }
  return value;
}

float ellipseDistance(vec2 p, vec2 center, vec2 radii, float rotation) {
  vec2 q = rotate2d(rotation) * (p - center);
  return length(q / radii) - 1.0;
}

float smoothUnion(float a, float b, float softness) {
  float h = clamp(0.5 + 0.5 * (b - a) / softness, 0.0, 1.0);
  return mix(b, a, h) - softness * h * (1.0 - h);
}

float smoother(float value) {
  value = clamp(value, 0.0, 1.0);
  return value * value * value * (value * (value * 6.0 - 15.0) + 10.0);
}

float poweredBloom(float phase) {
  // Slow preload, fast release, weighted suspension, controlled recovery.
  // Frame zero and frame six land on the same composed posture.
  if (phase < 0.17) {
    return mix(0.24, 0.3, smoother(phase / 0.17));
  }
  if (phase < 0.38) {
    float release = (phase - 0.17) / 0.21;
    return mix(0.3, 1.0, 1.0 - pow(1.0 - release, 3.4));
  }
  if (phase < 0.7) {
    float suspension = (phase - 0.38) / 0.32;
    return 1.0 - 0.045 * smoother(suspension);
  }
  float recovery = (phase - 0.7) / 0.3;
  return mix(0.955, 0.24, smoother(recovery));
}

void main() {
  float phase = mod(uTime, max(uCycle, 0.1)) / max(uCycle, 0.1);
  float loopAngle = phase * TAU;
  float bloom = poweredBloom(phase);
  vec2 loopVector = vec2(cos(loopAngle), sin(loopAngle));

  vec2 p = (vUv - 0.5) * 2.0;
  p.x *= 1.03;
  p.y += 0.015;

  // One posture governs everything: upper-right origin to lower-left release.
  // Broad connected lobes read as an abstract bloom, never as tentacles.
  vec2 axis = normalize(vec2(-1.0, -0.72));
  vec2 across = vec2(-axis.y, axis.x);
  vec2 origin = -axis * 0.36 + across * 0.015;
  float spread = mix(0.68, 1.14, bloom);
  float bodyBreath = 0.985 + 0.018 * sin(loopAngle - 0.45);

  float body = ellipseDistance(
    p,
    origin + axis * (0.3 + 0.045 * bloom),
    vec2(0.55, 0.22) * bodyBreath,
    -0.62
  );
  float crown = ellipseDistance(
    p,
    origin - axis * 0.015 + across * 0.045,
    vec2(0.28, 0.16) * (0.97 + 0.025 * bloom),
    -0.62
  );
  float lowerPetal = ellipseDistance(
    p,
    origin + axis * (0.51 * spread) + across * (0.035 + 0.105 * bloom),
    vec2(0.31, 0.15) * (0.91 + 0.12 * bloom),
    -0.72
  );
  float petalBridge = ellipseDistance(
    p,
    origin + axis * (0.42 * spread) + across * (0.02 + 0.05 * bloom),
    vec2(0.34, 0.18) * (0.95 + 0.06 * bloom),
    -0.68
  );
  float shape = smoothUnion(body, crown, 0.17);
  shape = smoothUnion(shape, petalBridge, 0.21);
  shape = smoothUnion(shape, lowerPetal, 0.195);

  float along = dot(p - origin, axis);
  float lateral = dot(p - origin, across);
  float releaseFront = mix(0.08, 0.98, bloom);
  float releaseWave = exp(-pow(along - releaseFront, 2.0) * 92.0)
    * exp(-lateral * lateral * 3.4);
  shape -= releaseWave * (0.008 + bloom * 0.018);
  float edgeMotion = (
    fbm(vec2(atan(p.y, p.x) * 1.7, length(p) * 4.0) + loopVector * 0.16)
    - 0.5
  ) * 0.018;
  shape += edgeMotion;

  float bodyMask = smoothstep(0.035, -0.025, shape);
  float softEdge = smoothstep(0.13, -0.04, shape);
  float innerDepth = smoothstep(0.03, -0.46, shape);
  if (softEdge <= 0.001) discard;

  // The release accelerates down-left. The silhouette remains composed while
  // moving folds, hue and caustics carry the action.
  vec2 flowPoint = vec2(along, lateral);
  float drive = bloom * bloom * (3.0 - 2.0 * bloom);
  vec2 advect = axis * (drive * 0.24) + across * sin(loopAngle) * 0.04;
  float flowA = fbm(flowPoint * vec2(3.3, 5.1) + advect + loopVector * 0.18);
  float flowB = fbm(
    rotate2d(-0.72) * flowPoint * vec2(4.6, 3.5)
    + vec2(flowA * 0.85, -flowA * 0.55)
    - loopVector.yx * 0.16
  );
  float flowC = fbm(
    flowPoint * vec2(7.2, 8.6)
    + vec2(flowB, flowA) * 1.1
    + loopVector * 0.11
  );

  float longFold = sin(
    lateral * 14.0 - along * 4.2 + flowA * 5.4 - drive * 5.2
  );
  float crossFold = sin(
    lateral * 6.4 + along * 10.5 + flowB * 4.6 + loopAngle * 0.7
  );
  float vein = pow(1.0 - abs(longFold), 9.0);
  float crossVein = pow(1.0 - abs(crossFold), 13.0);
  float wideSilk = smoothstep(-0.52, 0.72, longFold);

  vec3 color = mix(uSky, uMint, smoothstep(0.18, 0.82, flowA));
  color = mix(color, uLavender, smoothstep(0.56, 0.9, flowB) * 0.72);
  color = mix(color, uAccent, wideSilk * 0.16 + innerDepth * 0.07);
  color = mix(color, uIce, vein * 0.5 + crossVein * 0.24);

  // The origin highlight and trailing sheen make the diagonal readable on a
  // still frame, before any animation is seen.
  float sourceGlow = exp(-dot(p - origin, p - origin) * 12.0);
  float trailingSheen = smoothstep(-0.1, 0.72, along)
    * smoothstep(0.62, 0.04, abs(lateral + 0.05));
  color = mix(color, uIce, sourceGlow * 0.34);
  color = mix(color, uMint, trailingSheen * (0.08 + bloom * 0.08));
  color = mix(color, uIce, releaseWave * (0.18 + 0.2 * bloom));

  float relief = 0.94 + innerDepth * 0.075 + (flowC - 0.5) * 0.045;
  color *= relief;
  color = mix(color, uIce, max(0.0, -shape) * vein * 0.13);

  float alpha = bodyMask * (0.91 + innerDepth * 0.07);
  alpha += (softEdge - bodyMask) * 0.34;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

interface DirectionalBloomProps {
  color: string;
  cycleDuration: number;
  paused: boolean;
  restartSignal: number;
}

function DirectionalBloom({
  color,
  cycleDuration,
  paused,
  restartSignal,
}: DirectionalBloomProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const elapsedRef = useRef(0);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uCycle: { value: cycleDuration },
    uSky: { value: new THREE.Color(color) },
    uMint: { value: new THREE.Color("#b8eee3") },
    uLavender: { value: new THREE.Color("#d8d4f2") },
    uIce: { value: new THREE.Color("#f5fbfd") },
    uAccent: { value: new THREE.Color("#91d1ea") },
  }), [color, cycleDuration]);

  useEffect(() => {
    elapsedRef.current = 0;
  }, [restartSignal]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    const main = new THREE.Color(color);
    material.uniforms.uSky.value.copy(main).lerp(new THREE.Color("#d9f3fc"), 0.28);
    material.uniforms.uMint.value.copy(main).lerp(new THREE.Color("#b8eee3"), 0.82);
    material.uniforms.uLavender.value.copy(main).lerp(new THREE.Color("#d8d4f2"), 0.84);
    material.uniforms.uIce.value.set("#f5fbfd");
    material.uniforms.uAccent.value.copy(main).lerp(new THREE.Color("#7fc9e7"), 0.5);
  }, [color]);

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;
    if (!paused) elapsedRef.current += Math.min(delta, 0.05);
    material.uniforms.uTime.value = paused ? cycleDuration * 0.46 : elapsedRef.current;
    material.uniforms.uCycle.value = cycleDuration;
  });

  return (
    <mesh
      position={[0, 0, -0.35]}
      rotation={[0, 0, -0.42]}
      scale={[3.38, 3.38, 1]}
    >
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

export default function BlueBloomFirework({
  color = "#a9def3",
  backgroundColor = "#f8fbfd",
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
          antialias: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => onCanvasReady?.(gl.domElement)}
      >
        <color attach="background" args={[backgroundColor]} />
        <DirectionalBloom
          color={color}
          cycleDuration={cycleDuration}
          paused={paused}
          restartSignal={restartSignal}
        />
      </Canvas>
    </div>
  );
}
